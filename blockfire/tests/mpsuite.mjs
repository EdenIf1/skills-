// BLOCKFIRE multiplayer end-to-end suite.
// Usage: node mpsuite.mjs [baseURL] [--only=1,2,5] [--skip=16] [--out=results.json] [--ps=127.0.0.1:9000]
// Each scenario gets its own browser, fresh contexts and a hard timeout; results go to a table and results.json.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=').slice(1).join('=') : null; };
const BASE = args.find(a => !a.startsWith('--')) || 'http://127.0.0.1:8766/index.html';
const ONLY = opt('only') ? opt('only').split(',') : null;
const SKIP = opt('skip') ? opt('skip').split(',') : [];
const OUT = opt('out') || path.join(HERE, 'results.json');
const PS = opt('ps') || '127.0.0.1:9000';
const PEER_BIN = '/tmp/npmt/node_modules/peer/dist/bin/peerjs.js';
const LAUNCH = { executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();
class Fail extends Error {}

/* ------------------------------------------------------------------ harness */
function makeT(browser, res) {
  const pages = [];
  const t = {
    pages, res,
    note(k, v) { res.metrics[k] = v; },
    check(cond, msg) { if (!cond) throw new Fail(msg); },
    soft(cond, msg) { if (!cond) res.soft.push(msg); return !!cond; },
    async mk(name, o = {}) {
      const ctx = o.ctx || await browser.newContext({ viewport: { width: 320, height: 180 }, serviceWorkers: 'block' });
      if (!o.ctx) await ctx.addInitScript(ps => { localStorage.setItem('blockfire.ps', ps); localStorage.setItem('blockfire.norender', '1'); }, o.ps || PS);
      const p = await ctx.newPage();
      p.label = name; p.errs = []; p.cons = []; p.closedOnPurpose = false;
      p.on('pageerror', e => p.errs.push(String(e.message).slice(0, 200)));
      p.on('console', m => { if (m.type() === 'error' && p.cons.length < 20) p.cons.push(m.text().slice(0, 160)); });
      await p.goto(BASE, { waitUntil: 'domcontentloaded' });
      { const t0 = now(); while (!(await p.evaluate(() => { try { return typeof window.__bf === 'object' && window.__bf.ev('frameN') > 5; } catch (e) { return false; } }).catch(() => false))) { if (now() - t0 > 20000) throw new Fail('game did not boot for ' + name); await sleep(150); } }
      if (name) await p.evaluate(n => window.__bf.setProfile({ name: n }), name);
      pages.push(p);
      return p;
    },
    // evaluate code inside the game closure
    ev: (p, code) => p.evaluate(c => window.__bf.ev(c), code),
    // poll a condition (code evaluated in the game) until truthy; returns ms or throws/false
    async until(p, code, ms, what) {
      const t0 = now(); let last;
      while (now() - t0 < ms) {
        try { last = await t.ev(p, code); } catch (e) { last = 'ERR ' + e.message.slice(0, 80); }
        if (last && !(typeof last === 'string' && last.startsWith('ERR '))) return now() - t0;
        await sleep(150);
      }
      if (what) throw new Fail(`timeout ${ms}ms waiting for ${what} (last=${JSON.stringify(last)})`);
      return false;
    },
    info: p => p.evaluate(() => window.__bf.net.info()),
  };
  return t;
}

const scenarios = [];
const S = (id, name, timeout, fn, extra = {}) => scenarios.push({ id: String(id), name, timeout, fn, ...extra });

/* ------------------------------------------------------------------ game helpers */
const WRAP_SNAPS = `(()=>{if(window.__wr)return 1;window.__wr=1;window.__snapN=0;window.__maxEv=0;window.__lastSnapT=0;const o=clientRecv;clientRecv=function(d){if(d&&d.t==='snap'){window.__snapN++;window.__lastSnapT=performance.now();if((d.ev||[]).length>window.__maxEv){window.__maxEv=d.ev.length;const k={};for(const e of d.ev)k[e[0]]=(k[e[0]]||0)+1;window.__maxEvKinds=k;}}return o(d);};return 1})()`;
const VOXHASH = `(()=>{let h=2166136261;for(let i=0;i<vox.length;i++){h^=vox[i];h=Math.imul(h,16777619);}return h>>>0})()`;

async function host(t, H) {
  await H.evaluate(() => window.__bf.net.host());
  await t.until(H, "NET.mode==='host'&&NET.code", 20000, 'host room open');
  return t.ev(H, 'NET.code');
}
async function join(t, C, code, ms = 30000) {
  await C.evaluate(c => window.__bf.net.join(c), code);
  const w = await t.until(C, "NET.mode==='client'", ms, `${C.label} join`);
  await t.ev(C, WRAP_SNAPS);
  return w;
}
async function readyAll(t, H, Cs) {
  for (const C of Cs) await t.ev(C, 'NET.ready||toggleReady();1');
  await t.until(H, `NET.remotes.size===${Cs.length}&&mpAllReady()`, 10000, 'all clients ready on host');
}
async function startAll(t, H, Cs, map, ms = 20000) {
  await H.evaluate(m => window.__bf.start(m), map);
  await Promise.all(Cs.map(C => t.until(C, "state==='play'", ms, `${C.label} in match`)));
  await t.until(H, `[...NET.remotes.values()].every(e=>e.alive)`, ms, 'host sees all clients alive');
}
const godRemotes = (t, H) => t.ev(H, 'for(const e of NET.remotes.values())e.spawnProt=1e9;1');
const godAll = async (t, H) => { await godRemotes(t, H); await t.ev(H, 'player.spawnProt=1e9;1'); };
const snapN = (t, C) => t.ev(C, 'window.__snapN||0');

/* ------------------------------------------------------------------ scenarios */
S(1, '2p TDM: join, ready, hits, kill, end', 120000, async t => {
  const H = await t.mk('Hosty'), C = await t.mk('Buddy');
  const code = await host(t, H); t.note('code', code);
  t.note('joinMs', await join(t, C, code));
  await t.until(H, "NET.roster.some(r=>r.name==='Buddy')", 5000, 'host roster has Buddy');
  await t.until(C, "NET.roster.some(r=>r.name==='Hosty')", 5000, 'client roster has Hosty');
  // Balanced teams so the client is an enemy; ready + start through the lobby UI
  await H.evaluate(() => document.getElementById('play').click());
  await H.evaluate(() => document.querySelector('[data-team="0"]').click());
  await t.until(C, "player.team==='red'", 4000, 'client moved to red');
  await C.evaluate(() => document.getElementById('play').click());
  await C.evaluate(() => document.getElementById('mpReady').click());
  await t.until(H, "NET.remotes.get('P1').ready&&!document.getElementById('mpStart').disabled", 5000, 'host Start enabled');
  await H.evaluate(() => document.getElementById('mpStart').click());
  t.note('clientStartMs', await t.until(C, "state==='play'", 10000, 'client in match'));
  await t.until(H, "state==='play'", 3000, 'host in match');
  await t.until(H, "NET.remotes.get('P1').alive", 8000, 'host sees client alive');
  // client sees bots and host moving
  const b0 = JSON.parse(await t.ev(C, "JSON.stringify(bots.filter(b=>b.inMatch!==false&&b.alive).map(b=>[b.nid,b.x,b.z]))"));
  await t.ev(H, 'player.x=20;player.z=20;1'); await sleep(700);
  const h0 = await t.ev(C, "(()=>{const e=NET.remotes.get('P0');return [e.x,e.z]})()");
  await t.ev(H, 'player.x=30;player.z=34;1'); await sleep(2000);
  const h1 = await t.ev(C, "(()=>{const e=NET.remotes.get('P0');return [e.x,e.z]})()");
  const b1 = JSON.parse(await t.ev(C, "JSON.stringify(bots.filter(b=>b.inMatch!==false&&b.alive).map(b=>[b.nid,b.x,b.z]))"));
  const moved = b0.filter(a => { const b = b1.find(x => x[0] === a[0]); return b && Math.hypot(a[1] - b[1], a[2] - b[2]) > .3; }).length;
  t.note('clientBotsVisible', b0.length); t.note('clientBotsMoved', moved); t.note('hostOnClient', [h0, h1]);
  t.check(b0.length >= 8, 'client sees too few bots: ' + b0.length);
  t.check(moved >= 3, 'bots not moving on client');
  t.check(Math.hypot(h1[0] - 30, h1[1] - 34) < 1.5, 'client does not see host move: ' + JSON.stringify(h1));
  // client shoots host
  await t.ev(H, "window.__hitBy=0;const __d=damage;damage=function(v,a,att){if(v===player&&att&&att.remote)window.__hitBy+=a;return __d.apply(this,arguments)};player.spawnProt=0;1");
  await C.evaluate(() => window.__bf.act.fire(true));
  const tHit = now(); let hit = 0;
  while (now() - tHit < 8000) {
    await C.evaluate(() => { window.__bf.net.tpNear('P0'); window.__bf.net.aimAt('P0'); });
    hit = await t.ev(H, 'window.__hitBy'); if (hit > 0) break; await sleep(120);
  }
  await C.evaluate(() => window.__bf.act.fire(false));
  t.note('clientDamageOnHost', Math.round(hit)); t.check(hit > 0, 'client shots never damaged host');
  // host kills client
  await t.ev(H, 'player.hp=player.maxHp;player.spawnProt=1e9;1');
  const k0 = await t.ev(H, 'player.kills');
  await t.until(H, "NET.remotes.get('P1').alive", 6000, 'client alive before kill');
  await t.ev(H, "NET.remotes.get('P1').spawnProt=0;1");
  await H.evaluate(() => window.__bf.act.fire(true));
  const tK = now(); let dead = false;
  while (now() - tK < 10000) {
    await H.evaluate(() => { window.__bf.net.tpNear('P1'); window.__bf.net.aimAt('P1'); });
    dead = await t.ev(C, 'player.deaths>0'); if (dead) break; await sleep(120);
  }
  await H.evaluate(() => window.__bf.act.fire(false));
  let path = 'gunfire';
  if (!dead) { path = 'direct damage()'; await t.ev(H, "damage(NET.remotes.get('P1'),999,player,false,'test','rifle');1"); await t.until(C, 'player.deaths>0', 4000, 'client death after damage()'); }
  t.note('killPath', path);
  await sleep(500);
  const k1 = await t.ev(H, 'player.kills'), deathShown = await C.evaluate(() => !document.getElementById('death').hidden);
  t.note('hostKills', [k0, k1]); t.note('clientDeathScreen', deathShown);
  t.check(k1 > k0, 'host got no kill credit'); t.check(deathShown, 'client death screen not shown');
  // match end reaches both
  await H.evaluate(() => window.__bf.net.endNow());
  t.note('endMs', await t.until(C, "state==='end'&&!document.getElementById('end').hidden", 5000, 'client end screen'));
  t.check(await t.ev(H, "state==='end'"), 'host not in end state');
});

S(2, 'Zombies 4p start + 5th joiner gets room full', 150000, async t => {
  const H = await t.mk('Zed');
  const code = await host(t, H);
  await t.ev(H, "selectMap('zombie');1");
  const Cs = await Promise.all(['Z1', 'Z2', 'Z3'].map(n => t.mk(n)));
  await Promise.all(Cs.map(C => join(t, C, code)));
  await t.until(H, 'NET.remotes.size===3', 5000, 'host has 3 clients');
  const X = await t.mk('Z5');
  const t0 = now();
  await X.evaluate(c => window.__bf.net.join(c), code);
  await t.until(X, "NET.err&&/full/i.test(NET.err)", 30000, '5th joiner room full error');
  t.note('fullErrMs', now() - t0); t.note('fullErr', await t.ev(X, 'NET.err'));
  t.check(await t.ev(X, 'NET.mode===null'), '5th joiner still in a room');
  t.check(await t.ev(H, 'NET.remotes.size===3'), 'host roster changed by 5th joiner');
  await readyAll(t, H, Cs);
  await startAll(t, H, Cs, 'zombie');
  const zs = await Promise.all(Cs.map(C => t.ev(C, 'isZ()')));
  t.check(zs.every(Boolean), 'a client is not in zombie mode');
  await Promise.all(Cs.map(C => t.until(C, 'zombies.filter(z=>z.alive).length>0', 30000, C.label + ' sees zombies')));
  t.note('clientsRound', await Promise.all(Cs.map(C => t.ev(C, 'Z.round'))));
  t.note('hostBotsOn', await t.ev(H, "bots.filter(b=>b.inMatch!==false).length"));
});

function bigRoom(n) {
  return async t => {
    const H = await t.mk('Boss');
    const code = await host(t, H);
    const names = Array.from({ length: n - 1 }, (_, i) => 'Pl' + (i + 1));
    const t0 = now();
    const Cs = [];
    for (let i = 0; i < names.length; i += 4) Cs.push(...await Promise.all(names.slice(i, i + 4).map(nm => t.mk(nm))));
    t.note('pagesUpMs', now() - t0);
    const t1 = now();
    await Promise.all(Cs.map(C => join(t, C, code, 60000)));
    t.note('allJoinedMs', now() - t1);
    await t.until(H, `NET.remotes.size===${n - 1}`, 10000, 'host sees all');
    await readyAll(t, H, Cs);
    await startAll(t, H, Cs, 'junk', 40000);
    await godAll(t, H);
    // everyone moves; every client must see every other human move and get snapshots
    const s0 = await Promise.all(Cs.map(C => snapN(t, C)));
    const f0 = await t.ev(H, 'frameN');
    await Promise.all(Cs.map((C, i) => t.ev(C, `player.x=${10 + i * 4};player.z=${12 + (i % 3) * 6};1`)));
    await sleep(3000);
    const s1 = await Promise.all(Cs.map(C => snapN(t, C)));
    const f1 = await t.ev(H, 'frameN');
    t.note('hostFps', +((f1 - f0) / 3).toFixed(1));
    const rates = s1.map((v, i) => +((v - s0[i]) / 3).toFixed(1));
    t.note('snapRatePerClient', rates);
    t.check(rates.every(r => r >= 3), 'some client snapshot rate < 3/s: ' + rates);
    const want = Cs.map((C, i) => [C.label, 10 + i * 4, 12 + (i % 3) * 6]);
    let bad = [];
    for (const [ci, C] of Cs.entries()) {
      const seen = JSON.parse(await t.ev(C, 'JSON.stringify([...NET.remotes.values()].map(e=>[e.name,e.x,e.z,e.inMatch]))'));
      if (seen.length !== n - 1) bad.push(`${C.label} sees ${seen.length} remotes`);
      for (const [nm, x, z] of want) { if (nm === C.label) continue; const s = seen.find(q => q[0] === nm); if (!s || Math.hypot(s[1] - x, s[2] - z) > 2) bad.push(`${C.label}: ${nm} at ${s && [s[1], s[2]]}`); }
    }
    const hostSeen = JSON.parse(await t.ev(H, 'JSON.stringify([...NET.remotes.values()].map(e=>[e.name,e.x,e.z]))'));
    for (const [nm, x, z] of want) { const s = hostSeen.find(q => q[0] === nm); if (!s || Math.hypot(s[1] - x, s[2] - z) > 2) bad.push(`host: ${nm}`); }
    t.note('positionMismatches', bad.length); if (bad.length) t.note('mismatchSample', bad.slice(0, 6));
    t.check(!bad.length, 'stale positions: ' + bad.slice(0, 3).join('; '));
  };
}
S(3, 'Big room 8 players TDM', 240000, bigRoom(8));
S('3b', 'Big room 12 players TDM (max)', 300000, bigRoom(12));

S(4, 'Join mid-match (world changes replayed)', 120000, async t => {
  const H = await t.mk('Early');
  const code = await host(t, H);
  await H.evaluate(() => window.__bf.start('junk'));
  await t.until(H, "state==='play'", 5000, 'host playing');
  await t.ev(H, "player.spawnProt=1e9;explode(32,4,20,player,{r:3,dr:1,dmg:0,weapon:'t'});explode(20,4,40,player,{r:3,dr:1,dmg:0,weapon:'t'});1");
  t.note('hostBlkChanges', await t.ev(H, 'NET.blk.size'));
  const C = await t.mk('Late');
  t.note('joinMs', await join(t, C, code));
  t.note('toPlayMs', await t.until(C, "state==='play'", 10000, 'late joiner in match'));
  await t.until(H, "NET.remotes.get('P1')&&NET.remotes.get('P1').alive", 8000, 'host sees late joiner alive');
  await sleep(1000);
  const [hh, ch] = [await t.ev(H, VOXHASH), await t.ev(C, VOXHASH)];
  t.note('voxHash', [hh, ch]);
  t.check(hh === ch, 'late joiner world differs from host');
  const s0 = await snapN(t, C); await sleep(2000); const s1 = await snapN(t, C);
  t.check(s1 - s0 > 10, 'late joiner not receiving snapshots');
  t.check(await t.ev(C, "NET.remotes.has('P0')&&bots.filter(b=>b.inMatch!==false).length>=8"), 'late joiner missing host/bots');
});

S(5, 'Leave then rejoin with same name', 120000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Rejoiner');
  const code = await host(t, H);
  await join(t, C, code);
  await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk');
  const ents0 = await t.ev(H, 'ents.length');
  await t.ev(H, 'NET.rejoinMs=4000;1');   // the real cooldown is 60 s; shortened for the test
  await C.evaluate(() => window.__bf.net.leave());
  t.note('hostDropMs', await t.until(H, 'NET.remotes.size===0', 10000, 'host removes leaver'));
  t.check(await t.ev(C, "NET.mode===null&&state==='menu'"), 'leaver not back in menu');
  t.check(await t.ev(H, "!ents.some(e=>e.name==='Rejoiner')"), 'ghost entity left on host');
  t.check(await t.ev(H, "[...document.querySelectorAll('#feed .sys')].some(d=>/Rejoiner left the game/.test(d.textContent))"), 'host feed missing "Rejoiner left the game"');
  // an instant rejoin is refused with a countdown
  await C.evaluate(c => window.__bf.net.join(c), code);
  await t.until(C, "/join it again in/.test(NET.err||'')", 10000, 'cooldown message');
  t.check(await t.ev(H, 'NET.remotes.size===0'), 'cooldown rejoin got in');
  await sleep(4300);
  t.note('rejoinMs', await join(t, C, code));
  await t.until(C, "state==='play'", 10000, 'rejoiner in match');
  await t.until(H, "[...NET.remotes.values()].some(e=>e.alive)", 8000, 'host sees rejoiner alive');
  const r = JSON.parse(await t.ev(H, "JSON.stringify({roster:NET.roster.map(r=>r.nid+':'+r.name),ents:ents.filter(e=>/Rejoiner/.test(e.name)).length,n:ents.length,remote:[...NET.remotes.values()].map(e=>e.name)})"));
  t.note('hostAfterRejoin', r); t.note('entsBeforeAfter', [ents0, r.n]);
  t.check(r.ents === 1, 'expected exactly 1 Rejoiner ent, got ' + r.ents);
  t.check(r.remote.length === 1 && r.remote[0] === 'Rejoiner', 'rejoined name changed: ' + r.remote);
  t.check(r.n === ents0, 'host ent count changed ' + ents0 + '→' + r.n);
  t.check(await t.ev(C, "NET.remotes.size===1&&ents.filter(e=>e.remote).length===1"), 'client has stale puppets');
  await t.ev(C, 'player.x=25;player.z=25;1');
  await t.until(H, "[...NET.remotes.values()].some(e=>Math.hypot(e.x-25,e.z-25)<1.5)", 4000, 'host sees rejoiner move');
});

S(6, 'Client page closed abruptly: host cleanup time', 120000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Crashy');
  const code = await host(t, H);
  await join(t, C, code); await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk');
  const t0 = now(); C.closedOnPurpose = true;
  await C.context().close();
  // user-visible: the slot shows RECONNECTING (marked away); the slot itself is held a little longer so the player can come back
  const awayMs = await t.until(H, "[...NET.remotes.values()].every(e=>e.away>0)||NET.remotes.size===0", 30000);
  t.note('hostMarksAwaySec', awayMs === false ? '>30' : +((now() - t0) / 1000).toFixed(1));
  t.check(awayMs !== false && (now() - t0) / 1000 <= 12, 'host did not notice the closed client within 12s');
  const ms = await t.until(H, "NET.remotes.size===0", 60000);
  const sec = ms === false ? null : +((now() - t0) / 1000).toFixed(1);
  t.note('hostRemovesAfterSec', sec ?? '>60 (never)');
  t.note('hostConnStateAtEnd', JSON.parse(await t.ev(H, `JSON.stringify([...NET.conns.keys()].map(c=>({open:c.open,ice:c.peerConnection&&c.peerConnection.iceConnectionState,pc:c.peerConnection&&c.peerConnection.connectionState,dc:c.dataChannel&&c.dataChannel.readyState})))`)));
  t.check(sec !== null, 'host never removed the closed client (60s)');
  t.check(sec <= 35, `host took ${sec}s to free the closed client's slot`);
});

S(7, 'Host page closed abruptly: clients notified', 120000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Left'), C2 = await t.mk('Left2');
  const code = await host(t, H);
  await join(t, C, code); await join(t, C2, code); await readyAll(t, H, [C, C2]); await startAll(t, H, [C, C2], 'junk');
  const t0 = now(); H.closedOnPurpose = true;
  await H.context().close();
  const seen = await Promise.all([C, C2].map(async X => { const ms = await t.until(X, "!document.getElementById('netBanner').hidden||NET.mode===null", 30000); return ms === false ? null : +((now() - t0) / 1000).toFixed(1); }));
  t.note('clientsSeeWarningSec', seen.map(v => v ?? '>30'));
  t.check(seen.every(v => v !== null && v <= 12), `clients were warned only after ${seen}s`);
  const r = await Promise.all([C, C2].map(async X => { const ms = await t.until(X, "NET.mode===null&&state==='menu'", 60000); return ms === false ? null : +((now() - t0) / 1000).toFixed(1); }));
  t.note('clientsBackToMenuSec', r.map(v => v ?? '>60'));
  t.note('clientState', await Promise.all([C, C2].map(X => t.ev(X, "state+'/'+NET.mode"))));
  t.note('clientConnState', await t.ev(C, "NET.host?JSON.stringify({open:NET.host.open,ice:NET.host.peerConnection&&NET.host.peerConnection.iceConnectionState,pc:NET.host.peerConnection&&NET.host.peerConnection.connectionState,dc:NET.host.dataChannel&&NET.host.dataChannel.readyState}):null"));
  t.note('secsSinceLastSnap', await Promise.all([C, C2].map(X => t.ev(X, 'window.__lastSnapT?+((performance.now()-window.__lastSnapT)/1000).toFixed(1):null'))));
  t.check(r.every(v => v !== null), 'a client never left the dead room (60s)');
  t.check(r.every(v => v <= 45), `clients needed ${r}s to give up on the dead room`);
});

S(8, 'Host signalling disconnect mid-match', 120000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Stay');
  const code = await host(t, H);
  await join(t, C, code); await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk'); await godAll(t, H);
  await t.ev(H, 'NET.peer.disconnect();1');
  const s0 = await snapN(t, C);
  await t.ev(C, 'player.x=22;player.z=22;1');
  await t.until(H, "Math.hypot(NET.remotes.get('P1').x-22,NET.remotes.get('P1').z-22)<1.5", 5000, 'host still gets client state');
  await sleep(2000);
  const s1 = await snapN(t, C);
  t.note('snapsDuringOutage', s1 - s0);
  t.check(s1 - s0 > 15, 'snapshots stopped during signalling outage');
  const rc = await t.until(H, 'NET.peer&&NET.peer.open&&!NET.peer.disconnected', 20000);
  t.note('hostReconnectMs', rc);
  t.check(rc !== false, 'host peer never reconnected to signalling');
  t.check(await t.ev(H, `NET.code===${JSON.stringify(code)}&&NET.mode==='host'`), 'room code changed');
  const C2 = await t.mk('NewGuy');
  t.note('newJoinMs', await join(t, C2, code));
  await t.until(C2, "state==='play'", 10000, 'new client in match');
  t.check(await t.ev(C, "state==='play'&&NET.mode==='client'"), 'old client dropped');
});

let ownServer = null;
async function startServer() {
  ownServer = spawn('node', [PEER_BIN, '--port', '9100', '-H', '127.0.0.1'], { stdio: 'ignore' });
  const t0 = now();
  while (now() - t0 < 15000) { try { const r = await fetch('http://127.0.0.1:9100/'); if (r.ok) return now() - t0; } catch (e) {} await sleep(200); }
  throw new Fail('own peer server did not start');
}
function killServer() { if (ownServer) { try { ownServer.kill('SIGKILL'); } catch (e) {} ownServer = null; } }
S(9, 'Signalling server restart mid-match (own server :9100)', 150000, async t => {
  await startServer();
  const o = { ps: '127.0.0.1:9100' };
  const H = await t.mk('Hst', o), C = await t.mk('Stay', o);
  const code = await host(t, H);
  await join(t, C, code); await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk'); await godAll(t, H);
  killServer();
  const tk = now(); const s0 = await snapN(t, C);
  await sleep(6000);
  const st = JSON.parse(await t.ev(C, "JSON.stringify({mode:NET.mode,state,err:NET.err})"));
  const s1 = await snapN(t, C);
  t.note('clientAfterKill', st); t.note('snapsWhileServerDown', s1 - s0);
  const hostSt = JSON.parse(await t.ev(H, "JSON.stringify({mode:NET.mode,state,remotes:NET.remotes.size})"));
  t.note('hostAfterKill', hostSt);
  const keep = st.mode === 'client' && st.state === 'play' && s1 - s0 > 20;
  t.soft(keep, `existing client dropped when server died: ${JSON.stringify(st)}`);
  await startServer();
  const rc = await t.until(H, 'NET.peer&&NET.peer.open&&!NET.peer.disconnected', 30000);
  t.note('hostReRegisteredMs', rc === false ? 'never' : rc);
  const C2 = await t.mk('NewGuy', o);
  let joined = true;
  try { t.note('newJoinMs', await join(t, C2, code, 40000)); } catch (e) { joined = false; t.note('newJoinErr', await t.ev(C2, 'NET.err||NET.status')); }
  t.check(keep, `existing client was kicked to menu when the server died (mode=${st.mode}, state=${st.state}, err="${st.err}")`);
  t.check(rc !== false, 'host never re-registered with restarted server');
  t.check(joined, 'new client could not join after server restart');
}, { cleanup: killServer });

S(10, 'Wrong / malformed room code', 130000, async t => {
  const C = await t.mk('Lost');
  await C.evaluate(() => window.__bf.net.join('AB'));
  t.note('shortCodeErr', await t.ev(C, 'NET.err'));
  const t0 = now();
  await C.evaluate(() => window.__bf.net.join('QQQQ9'));
  // the joiner keeps waiting (the host may be in WhatsApp sending the invite) but says so straight away
  await t.until(C, "/not open/.test(NET.status)", 20000, 'clear waiting status for unknown code');
  t.note('waitStatusSec', +((now() - t0) / 1000).toFixed(1));
  await t.until(C, 'NET.err', 110000, 'error for unknown code');
  const sec = +((now() - t0) / 1000).toFixed(1);
  const err = await t.ev(C, 'NET.err');
  t.note('wrongCodeErrSec', sec); t.note('wrongCodeErr', err);
  t.check(/no room|code/i.test(err), 'error not clear: ' + err);
  t.check(sec <= 100, `wrong code took ${sec}s to report`);
});

S(11, 'Version mismatch (old client hello/state format)', 90000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Oldie');
  const code = await host(t, H);
  // pretend to be an old build: hello without level/skin/armor + a version field, old 3-value position
  await t.ev(C, `(()=>{const pc=Peer.prototype.connect;Peer.prototype.connect=function(){const c=pc.apply(this,arguments);const s=c.send.bind(c);
    c.send=m=>{if(m&&m.t==='hello')m={t:'hello',name:m.name,v:0};else if(m&&m.t==='st')m=Object.assign({},m,{p:m.p.slice(0,3),proto:0});return s(m);};return c;};return 1})()`);
  await C.evaluate(c => window.__bf.net.join(c), code);
  const ok = await t.until(C, "NET.mode==='client'||NET.err", 20000, 'old client join outcome');
  const res = JSON.parse(await t.ev(C, "JSON.stringify({mode:NET.mode,err:NET.err})"));
  t.note('oldClientResult', res);
  if (res.mode === 'client') {
    await t.ev(C, WRAP_SNAPS);
    await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk').catch(e => t.note('startErr', e.message));
    await sleep(2000);
    t.note('hostViewOfOld', JSON.parse(await t.ev(H, "JSON.stringify((()=>{const e=NET.remotes.get('P1');return e&&{yaw:e.yaw,pitch:e.pitch,vx:e.vx,alive:e.alive,lv:e.lv}})())")));
    t.note('hostPageErrors', H.errs.length);
  }
  t.check(!(res.mode === 'client'), 'no version check: old-protocol client admitted silently (no warning/err)');
}, { expectFail: true });

S(12, 'Latency 300ms + 20% snap loss; world consistency', 150000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Laggy');
  const code = await host(t, H);
  await join(t, C, code); await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk'); await godAll(t, H);
  t.check(await t.ev(H, VOXHASH) === await t.ev(C, VOXHASH), 'worlds differ at match start');
  // phase A: delay only (both directions, 300ms each way on the client side)
  await t.ev(H, `(()=>{window.__sentX=0;window.__sentMsgs=0;const ob=netBroadcast;netBroadcast=function(m){if(m&&m.t==='evs'){window.__sentMsgs++;for(const e of m.ev)if(e[0]==='x')window.__sentX++;}return ob(m);};return 1})()`);
  await t.ev(C, `(()=>{window.__rawX=0;window.__rawMsgs=0;const c=NET.host;c.on('data',d=>{if(d&&d.t==='evs'){window.__rawMsgs++;for(const e of d.ev)if(e[0]==='x')window.__rawX++;}});return 1})()`);
  await t.ev(C, `(()=>{window.__xs=new Set();const oe=clientEvent;clientEvent=function(ev){if(ev&&ev[0]==='x')window.__xs.add(ev[1]+','+ev[2]+','+ev[3]);return oe(ev);};return 1})()`);
  await t.ev(C, `(()=>{window.__drop=0;window.__dropped=0;const o=clientRecv;clientRecv=function(d){if(d&&d.t==='snap'&&Math.random()<window.__drop){window.__dropped++;return;}setTimeout(()=>o(d),300);};
    const c=NET.host,s=c.send.bind(c);c.send=m=>{setTimeout(()=>{try{s(m)}catch(e){}},300)};return 1})()`);
  const boom = async tag => { for (let i = 0; i < 4; i++) { await t.ev(H, `explode(${14 + i * 9},5,${18 + (i % 2) * 20},player,{r:2.6,dr:1,dmg:0,weapon:'t'});1`); await sleep(400); } };
  await boom('A'); await sleep(1500);
  const diffA = await vdiff(t, H, C); t.note('delayOnlyDiffCells', diffA);
  await t.ev(C, 'player.x=26;player.z=26;1');
  t.note('hostSeesMoveMs', await t.until(H, "Math.hypot(NET.remotes.get('P1').x-26,NET.remotes.get('P1').z-26)<1.5", 5000, 'host sees lagged client move'));
  // phase B: + 20% snapshot loss, explosions + a client grenade
  await t.ev(C, 'window.__drop=0.2;1');
  await boom('B');
  await t.ev(C, 'player.x=40;player.z=30;player.pitch=0.3;playerNade();1'); await sleep(1500);
  await boom('B2'); await sleep(3500);
  const s0 = await snapN(t, C); await sleep(1000); const s1 = await snapN(t, C);
  t.note('snapsDropped', await t.ev(C, 'window.__dropped'));
  t.note('playContinues', { state: await t.ev(C, 'state'), snapsPerSec: s1 - s0 });
  t.check(await t.ev(C, "state==='play'&&NET.mode==='client'"), 'client fell out under lag');
  const diffB = await vdiff(t, H, C); t.note('lossDiffCells', diffB);
  t.check(diffA === 0, `world diverged with delay only (${diffA} cells)`);
  t.check(diffB === 0, `world diverged after snap loss: ${diffB} voxel cells differ (block events ride in lost snapshots)`);
});
async function vdiff(t, H, C) {
  // freeze the host's simulation so no new block changes are created, then let in-flight (delayed) events land
  await H.evaluate(() => window.__bf.ev('paused=true;if(NET.q.length){netBroadcast({t:"evs",ev:NET.q});NET.q=[];}1')); await sleep(1200);
  const get = P => P.evaluate(() => window.__bf.ev('Array.from(vox).join(",")'));
  const [a, b] = (await Promise.all([get(H), get(C)])).map(s => s.split(','));
  let d = 0; const cells = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { d++; if (cells.length < 5) cells.push(i + ':' + a[i] + '/' + b[i]); }
  if (d) { t.note('counts', {hostSentMsgs: await H.evaluate(()=>window.__bf.ev('window.__sentMsgs')), hostSentX: await H.evaluate(()=>window.__bf.ev('window.__sentX')), clientRawMsgs: await C.evaluate(()=>window.__bf.ev('window.__rawMsgs')), clientRawX: await C.evaluate(()=>window.__bf.ev('window.__rawX')), clientXs: await C.evaluate(()=>window.__bf.ev('window.__xs.size'))});
    t.note('diffCells', cells);
    const idx = cells.map(c => +c.split(':')[0]);
    t.note('diffWhy', await C.evaluate(ix => window.__bf.ev(`(()=>{const out=[];for(const i of ${JSON.stringify(ix)}){let f=null;for(let y=0;y<H&&!f;y++)for(let z=0;z<D&&!f;z++)for(let x=0;x<W;x++)if(VI(x,y,z)===i){f=[x,y,z];break;}const k=f&&f.join(',');out.push({cell:k,clientGotX:!!(window.__xs&&window.__xs.has(k))});}return JSON.stringify(out)})()`), idx));
    t.note('hostHasBlk', await H.evaluate(ix => window.__bf.ev(`(()=>{const out=[];for(const i of ${JSON.stringify(ix)}){let f=null;for(let y=0;y<H&&!f;y++)for(let z=0;z<D&&!f;z++)for(let x=0;x<W;x++)if(VI(x,y,z)===i){f=[x,y,z];break;}out.push(f&&NET.blk.has(f.join(',')));}return JSON.stringify(out)})()`), idx));
  }
  await H.evaluate(() => window.__bf.ev('paused=false;1'));
  return d;
}

S(13, 'Lobby settings propagate to client within 2s', 90000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Watcher');
  const code = await host(t, H); await join(t, C, code);
  await H.evaluate(() => document.getElementById('play').click());
  await C.evaluate(() => document.getElementById('play').click());
  const clickH = sel => H.evaluate(s => { const b = document.querySelector(s); if (!b) throw new Error('no ' + s); b.click(); }, sel);
  const times = {}, bad = [];
  const step = async (name, sel, cond) => { await clickH(sel); const ms = await t.until(C, cond, 2000); times[name] = ms === false ? 'MISS' : ms; if (ms === false) bad.push(name); };
  await step('mode→zombie', '[data-mode="zombie"]', `document.querySelector('#mpBody [data-mode="zombie"].on')&&NET.mapKey==='zombie'`);
  await step('diff→hard', '[data-lzd="hard"]', `document.querySelector('#mpBody [data-lzd="hard"].on')&&NET.zdiff==='hard'`);
  await step('fill→off', '#lobFill', `!document.getElementById('lobFill').checked&&NET.fillC===false`);
  await step('fill→on', '#lobFill', `document.getElementById('lobFill').checked&&NET.fillC===true`);
  await step('mode→tdm', '[data-mode="tdm"]', `document.querySelector('#mpBody [data-mode="tdm"].on')&&NET.mapKey==='junk'`);
  await step('map→cabin', '[data-lmap="cabin"]', `document.querySelector('#mpBody [data-lmap="cabin"].on')&&NET.mapKey==='cabin'`);
  await step('teams→balanced', '[data-team="0"]', `document.querySelector('#mpBody [data-team="0"].on')&&player.team==='red'`);
  await step('swap client', '[data-swap="P1"]', `player.team==='blue'`);
  await step('teams→mine', '[data-team="1"]', `document.querySelector('#mpBody [data-team="1"].on')&&player.team==='blue'`);
  await step('mode→knife', '[data-mode="knife"]', `NET.mapKey==='knife'&&document.querySelector('#mpBody [data-mode="knife"].on')`);
  t.note('propagationMs', times);
  t.note('clientButtonsDisabled', await C.evaluate(() => [...document.querySelectorAll('#mpBody [data-mode]')].every(b => b.disabled)));
  t.check(!bad.length, 'not reflected within 2s: ' + bad.join(', '));
});

S(14, 'Simultaneous pickup of one dropped weapon', 120000, async t => {
  const H = await t.mk('Hst'), A = await t.mk('Grab1'), B = await t.mk('Grab2');
  const code = await host(t, H); await join(t, A, code); await join(t, B, code);
  await readyAll(t, H, [A, B]); await startAll(t, H, [A, B], 'junk'); await godAll(t, H);
  const results = [];
  for (let round = 0; round < 3; round++) {
    const id = await t.ev(H, `(()=>{clearDrops();const d=spawnDrop('awm',30.5,player.y,30.5);if(!d){return -1}const y=(()=>{for(let y=H-1;y>0;y--)if(getV(30,y-1,30)&&!getV(30,y,30))return y;return 4})();d.y=y;d.m.position.y=y+.16;return d.id})()`);
    t.check(id > 0, 'host could not spawn a drop');
    for (const P of [A, B]) await t.until(P, `drops.some(d=>d.id===${id})`, 4000, P.label + ' sees drop');
    for (const P of [A, B]) await t.ev(P, `(()=>{const d=drops.find(d=>d.id===${id});player.x=d.x;player.y=d.y;player.z=d.z+1.2;player.vx=player.vy=player.vz=0;player.yaw=0;player.pitch=-0.7;return 1})()`);
    await sleep(500);
    for (const P of [A, B]) await t.until(P, `pickTarget&&pickTarget.id===${id}`, 3000, P.label + ' targets drop');
    const w0 = await Promise.all([A, B].map(P => t.ev(P, 'curW().id')));
    await Promise.all([A, B].map(P => t.ev(P, 'pickUp();1')));
    await sleep(1500);
    const w1 = await Promise.all([A, B].map(P => t.ev(P, 'curW().id')));
    const lists = await Promise.all([H, A, B].map(P => t.ev(P, "JSON.stringify(drops.map(d=>d.id+':'+d.w).sort())")));
    const got = w1.filter(w => w === 'awm').length;
    results.push({ before: w0, after: w1, got, drops: lists[0], consistent: lists[0] === lists[1] && lists[1] === lists[2] });
    // give the gun back for the next round
    for (const P of [A, B]) await t.ev(P, "giveWeapon('ak47');1");
  }
  t.note('rounds', results);
  t.check(results.every(r => r.got === 1), 'pickup winners per round: ' + results.map(r => r.got).join(','));
  t.check(results.every(r => r.consistent), 'drop lists differ between host and clients');
  t.check(results.every(r => !r.drops.includes('awm')), 'picked drop still in host list');
});

S(15, 'Ready toggle race vs host start', 120000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Jittery');
  const code = await host(t, H); await join(t, C, code);
  // 80 ms one-way latency on the client's messages (a normal mobile link)
  await t.ev(C, "(()=>{const c=NET.host,s=c.send.bind(c);c.send=m=>{setTimeout(()=>{try{s(m)}catch(e){}},80)};return 1})()");
  const outcomes = [];
  for (let trial = 0; trial < 3; trial++) {
    let stop = false, toggles = 0;
    const spam = (async () => { while (!stop) { await t.ev(C, "state==='menu'&&toggleReady();1"); toggles++; await sleep(15); } })();
    const t0 = now(); let started = false;
    while (now() - t0 < 8000) { started = await t.ev(H, "(state==='menu'&&mpAllReady()&&NET.remotes.size===1)?(lobbyStart(),1):state==='play'"); if (started) break; await sleep(5); }
    await sleep(400); stop = true; await spam;
    const cPlay = await t.until(C, "state==='play'", 6000);
    await sleep(1500);
    const st = JSON.parse(await t.ev(H, "JSON.stringify({hs:state,hostThinksReady:NET.remotes.get('P1').ready})"));
    st.cs = await t.ev(C, 'state'); st.clientReady = await t.ev(C, 'NET.ready'); st.toggles = toggles; st.clientStarted = cPlay !== false;
    outcomes.push(st);
    // back to lobby for next trial
    await H.evaluate(() => window.__bf.net.endNow());
    await t.until(C, "state==='end'", 5000, 'client end');
    await t.ev(H, 'backToMenu();1'); await t.ev(C, 'backToMenu();1');
    await sleep(800);
    st.afterEnd = { hostThinksReady: await t.ev(H, "NET.remotes.get('P1').ready"), clientReady: await t.ev(C, 'NET.ready'), hostStartEnabled: await t.ev(H, 'mpAllReady()') };
    if (st.afterEnd.clientReady) await t.ev(C, 'toggleReady();1');
    await sleep(300);
  }
  t.note('trials', outcomes);
  t.check(outcomes.every(o => o.hs === 'play' && o.cs === 'play'), 'a start did not reach both');
  const mism = outcomes.filter(o => o.afterEnd.hostThinksReady !== o.afterEnd.clientReady);
  t.check(!mism.length, `ready state desync in ${mism.length}/3 trials: host thinks client ready=${mism.map(o => o.afterEnd.hostThinksReady)} while client shows ${mism.map(o => o.afterEnd.clientReady)}`);
});

S(16, 'Soak: 2 players + bots, 3 min auto-fire', 300000, async t => {
  const res = t.res;
  const H = await t.mk('Hst'), C = await t.mk('Soaker');
  const code = await host(t, H); await join(t, C, code);
  await t.ev(H, "NET.teamUp=false;for(const r of [...NET.remotes.values()])hostSetTeam(r,'red');netFitBots();netRoster();1");
  await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk');
  await t.ev(H, 'GOAL=1e9;matchT=1e9;1');
  const probe = `JSON.stringify({q:NET.q.length,ents:ents.length,drops:drops.length,scene:scene.children.length,tr:tracers.length,parts:parts.length,fires:fires.length,projs:typeof projs!=='undefined'?projs.length:-1,zom:zombies.length,heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null,state,fr:frameN,k:player.kills,d:player.deaths})`;
  const samples = [];
  // every tick: refill ammo, stand ~4m from the nearest live enemy, aim and hold fire; a grenade every ~8s
  const aim = (P, tick) => t.ev(P, `(()=>{if(!player.alive||state!=='play')return 0;if(ammo[cur]){ammo[cur].mag=Math.max(ammo[cur].mag,LW[cur].mag-1);ammo[cur].reserve=999;}
    let best=null,bd=1e9;for(const e of ents){if(e===player||!e.alive||e.team===player.team||e.inMatch===false)continue;const d=Math.hypot(e.x-player.x,e.z-player.z);if(d<bd){bd=d;best=e}}
    if(best){if(bd>6){player.x=best.x+3;player.z=best.z+2;player.y=best.y;player.vx=player.vy=player.vz=0;}const dx=best.x-player.x,dz=best.z-player.z,dy=(best.y+1.3)-(player.y+1.6);player.yaw=Math.atan2(-dx,-dz);player.pitch=Math.atan2(dy,Math.hypot(dx,dz));}
    fireHeld=true;if(${tick}%32===0){nades=Math.max(nades,1);playerNade();}return 1})()`);
  const t0 = now(); let nxt = 0, maxQ = 0;
  let tick = 0;
  while (now() - t0 < 180000) {
    tick++; await aim(H, tick); await aim(C, tick + 16);
    maxQ = Math.max(maxQ, await t.ev(H, 'NET.q.length'), await t.ev(C, 'NET.q.length'));
    if (now() - t0 >= nxt) { samples.push({ s: Math.round((now() - t0) / 1000), h: JSON.parse(await t.ev(H, probe)), c: JSON.parse(await t.ev(C, probe)), cSnaps: await snapN(t, C) }); nxt += 30000; }
    await sleep(250);
  }
  samples.push({ s: 180, h: JSON.parse(await t.ev(H, probe)), c: JSON.parse(await t.ev(C, probe)), cSnaps: await snapN(t, C) });
  const f = samples[0], l = samples[samples.length - 1];
  t.note('first', f); t.note('last', l); t.note('maxQ', maxQ);
  t.note('kd', { host: [l.h.k, l.h.d], client: [l.c.k, l.c.d], score: await t.ev(H, 'JSON.stringify(scores)'), hostBlk: await t.ev(H, 'NET.blk.size') });
  t.note('worldDiffCells', await vdiff(t, H, C));
  t.note('series', samples.map(s => [s.s, s.h.scene, s.c.scene, s.h.heap, s.c.heap, s.h.ents, s.c.ents]));
  t.check(maxQ < 400, 'NET.q grew to ' + maxQ);
  t.check(l.h.ents === f.h.ents && l.c.ents === f.c.ents, `entity count drifted host ${f.h.ents}→${l.h.ents} client ${f.c.ents}→${l.c.ents}`);
  t.check(l.h.scene < f.h.scene + 80 && l.c.scene < f.c.scene + 80, `scene children grew host ${f.h.scene}→${l.h.scene} client ${f.c.scene}→${l.c.scene}`);
  if (f.h.heap != null) t.check(l.h.heap < f.h.heap * 2 + 40 && l.c.heap < f.c.heap * 2 + 40, `heap grew host ${f.h.heap}→${l.h.heap}MB client ${f.c.heap}→${l.c.heap}MB`);
  t.check(l.c.state === 'play' && l.h.state === 'play', 'match not running at end of soak');
  t.check(l.h.k + l.c.k >= 10 && l.h.d + l.c.d >= 3, 'soak produced too little combat to be meaningful');
  t.check(res.metrics.worldDiffCells === 0, 'host/client worlds diverged during soak: ' + res.metrics.worldDiffCells);
  t.check((l.cSnaps - f.cSnaps) / ((l.s - f.s) || 1) > 8, 'client snapshot rate collapsed');
});

S(17, 'Client tab backgrounded 12s (loop+events frozen) then resumes', 120000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Sleeper');
  const code = await host(t, H); await join(t, C, code);
  await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk'); await godAll(t, H);
  await t.ev(H, "(()=>{const o=hostRecv;hostRecv=function(c,d){if(d&&d.t==='st')window.__lastSt=performance.now();return o(c,d)};return 1})()");
  // Background the tab: document.hidden + visibilitychange, the game loop (rAF) stops and incoming network
  // events queue up until the tab comes back (what a frozen mobile tab does). CDP Page.setWebLifecycleState
  // 'frozen' is ignored by headless Chromium for visible pages, so the freeze is emulated in-page.
  await C.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await t.ev(C, `(()=>{window.__rafQ=[];window.__raf0=window.requestAnimationFrame;window.requestAnimationFrame=cb=>{window.__rafQ.push(cb);return 0};
    window.__inbox=[];window.__cr0=clientRecv;clientRecv=d=>{window.__inbox.push(d)};return 1})()`);
  const fr0 = await t.ev(C, 'frameN');
  await t.ev(H, 'player.x=36;player.z=14;1');
  await sleep(12000);
  const hostStill = await t.ev(H, "NET.remotes.has('P1')");
  t.note('hostSecsSinceClientStateAtEndOfFreeze', await t.ev(H, '+((performance.now()-window.__lastSt)/1000).toFixed(1)'));
  t.note('clientFramesDuringFreeze', (await t.ev(C, 'frameN')) - fr0);
  t.note('queuedMsgsAtResume', await t.ev(C, 'window.__inbox.length'));
  await t.ev(C, `(()=>{clientRecv=window.__cr0;const q=window.__inbox;window.__inbox=[];for(const d of q)clientRecv(d);window.requestAnimationFrame=window.__raf0;const r=window.__rafQ;window.__rafQ=[];for(const cb of r)requestAnimationFrame(cb);return q.length})()`);
  await C.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  t.note('hostKeptClientDuringFreeze', hostStill);
  const s0 = await snapN(t, C);
  await t.ev(H, 'player.x=18;player.z=40;1');
  const rs = await t.until(C, "(()=>{const e=NET.remotes.get('P0');return e&&Math.hypot(e.x-18,e.z-40)<1.5&&state==='play'})()", 8000);
  t.note('resyncMs', rs);
  t.note('snapsAfterResume', (await snapN(t, C)) - s0);
  t.check(hostStill, 'host dropped frozen client');
  t.check(rs !== false, 'client did not resync host position after resume');
  await t.ev(C, 'player.x=27;player.z=27;1');
  t.check(await t.until(H, "Math.hypot(NET.remotes.get('P1').x-27,NET.remotes.get('P1').z-27)<1.5", 4000) !== false, 'host not receiving client after resume');
});

S(18, 'Duplicate names + same profile in two tabs', 120000, async t => {
  const H = await t.mk('Sam'), A = await t.mk('Sam'), B = await t.mk('sam');
  const code = await host(t, H);
  await join(t, A, code); await join(t, B, code);
  const roster = await t.ev(H, "NET.roster.map(r=>r.name)");
  const mine = [await t.ev(A, 'NET.myName'), await t.ev(B, 'NET.myName')];
  t.note('roster', roster); t.note('clientNames', mine);
  const keys = roster.map(n => n.toLowerCase());
  t.check(new Set(keys).size === keys.length, 'duplicate names in roster: ' + roster);
  // same profile (same browser context / localStorage) in two tabs
  const T1 = await t.mk('Twin');
  const T2 = await t.mk('', { ctx: T1.context() });
  t.note('tab2Name', await t.ev(T2, 'profile.name'));
  await join(t, T1, code); await join(t, T2, code);
  await t.until(H, 'NET.remotes.size===4', 5000, 'host has 4 clients');
  const r2 = await t.ev(H, "NET.roster.map(r=>r.nid+':'+r.name)");
  t.note('rosterWithTwins', r2);
  await readyAll(t, H, [A, B, T1, T2]); await startAll(t, H, [A, B, T1, T2], 'junk'); await godAll(t, H);
  await t.ev(T1, 'player.x=12;player.z=12;1'); await t.ev(T2, 'player.x=44;player.z=44;1');
  await t.until(H, "(()=>{const v=[...NET.remotes.values()];return v.some(e=>Math.hypot(e.x-12,e.z-12)<1.5)&&v.some(e=>Math.hypot(e.x-44,e.z-44)<1.5)})()", 4000, 'both twin tabs move independently');
  const names2 = r2.map(s => s.split(':')[1].toLowerCase());
  t.check(new Set(names2).size === names2.length, 'twin tabs share a name');
});

S(19, 'Host lobby idle with client: event queue growth', 120000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Waiter');
  const code = await host(t, H); await join(t, C, code);
  const q0 = await t.ev(H, 'NET.q.length');
  await sleep(30000);
  const q1 = await t.ev(H, 'NET.q.length');
  t.note('hostQueueAfter30sInLobby', [q0, q1]);
  await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk');
  await sleep(1500);
  t.note('firstSnapEvBurstOnClient', await t.ev(C, 'window.__maxEv'));
  t.note('burstEventKinds', await t.ev(C, 'window.__maxEvKinds||null'));
  t.check(q1 < 200, `host NET.q grew to ${q1} while in lobby (never flushed outside a match)`);
  t.check(await t.ev(C, 'window.__maxEv') < 200, 'client received a stale event burst at start');
});

S(20, 'Rematch: end → lobby → second match', 120000, async t => {
  const H = await t.mk('Hst'), C = await t.mk('Again');
  const code = await host(t, H); await join(t, C, code);
  await readyAll(t, H, [C]); await startAll(t, H, [C], 'junk');
  await H.evaluate(() => window.__bf.net.endNow());
  await t.until(C, "state==='end'", 5000, 'client end');
  await H.evaluate(() => document.getElementById('again').click());
  await C.evaluate(() => document.getElementById('again').click());
  await t.until(C, "state==='menu'&&NET.mode==='client'", 4000, 'client back in lobby');
  await readyAll(t, H, [C]);
  await H.evaluate(() => document.getElementById('mpStart').click());
  await t.until(C, "state==='play'", 8000, 'client in second match');
  await t.until(H, "NET.remotes.get('P1').alive", 8000, 'client alive in 2nd match');
  const s0 = await snapN(t, C); await sleep(1500);
  t.check((await snapN(t, C)) - s0 > 10, 'no snapshots in second match');
  t.check(await t.ev(C, 'player.kills===0&&player.deaths===0&&scores.blue+scores.red<5'), 'stats not reset for rematch');
});

/* ------------------------------------------------------------------ runner */
async function runOne(sc) {
  const res = { id: sc.id, name: sc.name, status: 'PASS', reason: '', expectFail: !!sc.expectFail, ms: 0, metrics: {}, soft: [], pageErrors: {}, consoleErrors: {} };
  const t0 = now();
  const browser = await chromium.launch(LAUNCH);
  const t = makeT(browser, res);
  let timer;
  try {
    await Promise.race([sc.fn(t), new Promise((_, rej) => { timer = setTimeout(() => rej(new Fail(`hard timeout ${sc.timeout / 1000}s`)), sc.timeout); })]);
  } catch (e) {
    res.status = 'FAIL'; res.reason = (e instanceof Fail ? '' : 'ERROR: ') + String(e.message).split('\n')[0].slice(0, 300);
  } finally { clearTimeout(timer); }
  for (const p of t.pages) {
    if (p.errs.length) res.pageErrors[p.label || 'tab'] = [...new Set(p.errs)].slice(0, 5);
    if (p.cons.length) res.consoleErrors[p.label || 'tab'] = [...new Set(p.cons)].slice(0, 3);
  }
  if (res.status === 'PASS' && Object.keys(res.pageErrors).length) { res.status = 'FAIL'; res.reason = 'page errors: ' + JSON.stringify(res.pageErrors).slice(0, 200); }
  if (res.status === 'PASS' && res.soft.length) res.reason = 'note: ' + res.soft.join('; ');
  try { if (sc.cleanup) sc.cleanup(); } catch (e) {}
  await browser.close().catch(() => {});
  res.ms = now() - t0;
  return res;
}

const list = scenarios.filter(s => (!ONLY || ONLY.includes(s.id)) && !SKIP.includes(s.id));
console.log(`BLOCKFIRE MP suite → ${BASE} (peer server ${PS}), ${list.length} scenarios`);
const results = []; const T0 = now();
for (const sc of list) {
  process.stdout.write(`[${sc.id}] ${sc.name} … `);
  const r = await runOne(sc);
  results.push(r);
  console.log(`${r.status}${r.expectFail && r.status === 'FAIL' ? ' (expected)' : ''} ${(r.ms / 1000).toFixed(1)}s ${r.reason ? '- ' + r.reason : ''}`);
  console.log('     ' + JSON.stringify(r.metrics).slice(0, 600));
  writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), totalSec: Math.round((now() - T0) / 1000), results }, null, 1));
}
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log('\n' + pad('ID', 4) + pad('RESULT', 16) + pad('TIME', 8) + 'SCENARIO / REASON');
for (const r of results) console.log(pad(r.id, 4) + pad(r.status + (r.expectFail && r.status === 'FAIL' ? '(exp)' : ''), 16) + pad((r.ms / 1000).toFixed(0) + 's', 8) + r.name + (r.reason ? '\n' + ' '.repeat(28) + r.reason.slice(0, 160) : ''));
const pass = results.filter(r => r.status === 'PASS').length;
console.log(`\n${pass}/${results.length} passed in ${Math.round((now() - T0) / 1000)}s → ${OUT}`);
killServer();
process.exit(0);
