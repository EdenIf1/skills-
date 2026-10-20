# Migrations

This directory is where a live schema export or `supabase db pull` lands. It is empty of SQL on purpose.

Do not hand-write `CREATE` statements for objects that have not been read from the live database. `schema.sql` and `identity.sql` stay as they are. A pull or an export adds a new timestamped file here and does not rewrite those two files.

How to run the pull, and which client objects are missing from the SQL already in git, is in [../PULL.md](../PULL.md).
