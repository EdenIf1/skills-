#!/usr/bin/env bash
# Pull the live Cubefront schema into blockfire/supabase/migrations/.
#
# The 2026-10-20 snapshot is blockfire/supabase/baseline/20261018000000_live_baseline.sql.
# That file is a reference snapshot, not a migration. Do not move it back under migrations/.
#
# Requires, and never prints:
#   SUPABASE_ACCESS_TOKEN   https://supabase.com/dashboard/account/tokens
#   SUPABASE_DB_PASSWORD    Dashboard → Project Settings → Database
#
# Does not modify schema.sql, identity.sql, or the baseline snapshot.
# Does not dump table data. Does not write the live migration history.
# Does not run `supabase db push`, `supabase migration repair`, or `supabase config push`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKDIR="$ROOT/blockfire"
MIGRATIONS="$WORKDIR/supabase/migrations"
PROJECT_REF="${SUPABASE_PROJECT_REF:-qnhogbwnumvounwpusmc}"

die() {
  printf 'error: %s\n' "$1" >&2
  exit "${2:-1}"
}

# Print rule names only. Never print the matching line (it may be the secret).
scan_sql() {
  python3 - "$1" << 'PY'
import os, re, sys
path = sys.argv[1]
text = open(path, encoding="utf-8", errors="replace").read()
hits = []
password = os.environ.get("SUPABASE_DB_PASSWORD", "")
token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
if len(password) >= 12 and password in text:
    hits.append("database password")
if len(token) >= 12 and token in text:
    hits.append("access token")
if re.search(r"postgres(?:ql)?://[^\s/:]*:[^\s@]+@", text):
    hits.append("database URL with a password")
if re.search(r"\bsbp_[A-Za-z0-9]{20,}", text):
    hits.append("Supabase access token (sbp_)")
if re.search(r"\bsb_secret_[A-Za-z0-9]{20,}", text):
    hits.append("Supabase secret key")
if re.search(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", text):
    hits.append("JWT")
if re.search(r"-----BEGIN [A-Z ]*PRIVATE KEY-----", text):
    hits.append("private key")
if re.search(r"'[0-9a-fA-F]{64,}'", text):
    hits.append("quoted hex string of 64 or more characters")
if hits:
    print(f"secret-scan: {path} matched: {', '.join(hits)}", file=sys.stderr)
    sys.exit(1)
sys.exit(0)
PY
}

reject_sql() {
  local src="$1"
  local dest="${src}.rejected"
  mv "$src" "$dest"
  printf 'Moved %s aside to %s (gitignored). It was not left as a migration.\n' "$src" "$dest" >&2
}

snapshot() {
  local dest="$1"
  mkdir -p "$MIGRATIONS"
  find "$MIGRATIONS" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort > "$dest"
}

self_test() {
  local dir
  dir="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$dir'" RETURN
  printf 'create table public.example (id int);\n' > "$dir/clean.sql"
  scan_sql "$dir/clean.sql"
  # Assemble the fixtures in pieces so this script does not contain a JWT or a database URL.
  jwt_hdr="$(printf '%s%s' 'eyJ' 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')"
  jwt_pay="$(printf '%s%s' 'eyJ' 'yb2xlIjoic2VydmljZV9yb2xlIn0')"
  jwt_sig="$(printf '%s%s' 'signature' 'value')"
  printf '%s\n' "select '${jwt_hdr}.${jwt_pay}.${jwt_sig}';" > "$dir/jwt.sql"
  if scan_sql "$dir/jwt.sql"; then
    die "self-test: JWT was not detected"
  fi
  db_scheme="$(printf '%s%s' 'postgres' '://')"
  db_user="$(printf '%s' 'postgres')"
  db_secret="$(printf '%s%s' 'super' 'secretpassword')"
  db_host="$(printf '%s%s' 'db.example.com' ':5432/postgres')"
  printf '%s\n' "select '${db_scheme}${db_user}:${db_secret}@${db_host}';" > "$dir/url.sql"
  if scan_sql "$dir/url.sql"; then
    die "self-test: database URL was not detected"
  fi
  printf '%s\n' "-- hunter2hunter2" > "$dir/pw.sql"
  if SUPABASE_DB_PASSWORD='hunter2hunter2' scan_sql "$dir/pw.sql"; then
    die "self-test: password was not detected"
  fi
  SUPABASE_DB_PASSWORD='hunter2hunter2' scan_sql "$dir/clean.sql"
  printf 'self-test ok\n'
}

if [[ "${1:-}" == "--self-test" ]]; then
  self_test
  exit 0
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" || -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  cat >&2 << EOF
error: live schema pull needs two values. They are not in this repository.

  SUPABASE_ACCESS_TOKEN
    Create one at https://supabase.com/dashboard/account/tokens
    Local shell:  export SUPABASE_ACCESS_TOKEN='...'
    GitHub:       Settings → Secrets and variables → Actions → secret SUPABASE_ACCESS_TOKEN

  SUPABASE_DB_PASSWORD
    Dashboard → project blockfire (ref ${PROJECT_REF}) → Project Settings → Database → Database password
    Local shell:  export SUPABASE_DB_PASSWORD='...'
    GitHub:       repository secret SUPABASE_DB_PASSWORD

Optional:
  SUPABASE_PROJECT_REF            defaults to ${PROJECT_REF} (public; already in the game client URL)

The pull always answers no when the CLI asks to update the remote migration history.
Do not commit either secret. Do not paste them into config.toml, this script, the baseline snapshot, or a migration file.
EOF
  exit 2
fi

if ! command -v supabase >/dev/null 2>&1; then
  die "supabase CLI is not on PATH. Install 2.121.0 or newer: https://supabase.com/docs/guides/cli/getting-started" 3
fi

if ! docker info >/dev/null 2>&1; then
  die "Docker is required. supabase db pull starts a shadow Postgres to diff the remote schema." 3
fi

mkdir -p "$MIGRATIONS"
cd "$WORKDIR"

# The CLI reads SUPABASE_DB_PASSWORD itself. Do not pass --password; that puts it in the process list.
printf 'Linking project ref %s (password not printed).\n' "$PROJECT_REF"
supabase link --project-ref "$PROJECT_REF" --yes

before="$(mktemp)"
after="$(mktemp)"
trap 'rm -f "$before" "$after"' EXIT
snapshot "$before"

set +e
printf 'db pull will not update the live migration history (answering no to that prompt).\n'
printf 'n\n' | supabase db pull remote_schema --linked
pull_status=$?
set -e

snapshot "$after"
mapfile -t created < <(comm -13 "$before" "$after")

if [[ ${#created[@]} -eq 0 && "$pull_status" -ne 0 ]]; then
  stamp="$(date -u +%Y%m%d%H%M%S)"
  out="$MIGRATIONS/${stamp}_remote_public.sql"
  printf 'db pull exited %s without a new migration file. Trying supabase db dump --schema public.\n' "$pull_status" >&2
  if supabase db dump --linked --schema public -f "$out"; then
    tmp="$(mktemp)"
    {
      printf '%s\n' '-- Produced by `supabase db dump --linked --schema public` after `supabase db pull` wrote no file.'
      printf '%s\n' '-- Schema only. Review before use. This header is not a hand-written object definition.'
      printf '\n'
      cat "$out"
    } > "$tmp"
    mv "$tmp" "$out"
    created=("${stamp}_remote_public.sql")
    pull_status=0
  else
    rm -f "$out"
    die "db pull and db dump both failed. No migration file was kept." 4
  fi
elif [[ ${#created[@]} -eq 0 && "$pull_status" -eq 0 ]]; then
  printf 'db pull finished and wrote no new migration file (remote matches the migrations already here).\n'
  exit 0
elif [[ "$pull_status" -ne 0 ]]; then
  printf 'warning: db pull exited %s after writing a migration file. The file is kept if the secret scan passes.\n' "$pull_status" >&2
fi

failed=0
for name in "${created[@]}"; do
  path="$MIGRATIONS/$name"
  if scan_sql "$path"; then
    printf 'Kept %s\n' "blockfire/supabase/migrations/$name"
  else
    reject_sql "$path"
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  die "A pulled file matched a secret pattern and was moved aside. Nothing from that file should be committed." 5
fi

printf 'schema.sql and identity.sql were not modified. Review the new file before db push.\n'
printf 'Do not commit blockfire/supabase/.temp/.\n'
