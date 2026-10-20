// WO-5: lobby/HUD/end team UI, nametag screen cap, scoreboard leave confirm.
// Headless Chromium against the source page (no PeerJS server). Drives the
// in-page test hook for both a solo host and a simulated joiner.
import { chromium } from 'playwright';

const URL = process.env.U || 'http://127.0.0.1:8765/cabin-fever.html';
const b = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  localStorage.setItem('blockfire.cloudcfg', JSON.stringify({ url: 'http://127.0.0.1:1', key: 'x' }));
  localStorage.setItem('blockfire.norender', '1');
  localStorage.setItem('blockfire.fastload', '1');
});
const P = await ctx.newPage();
const errs = [];
P.on('pageerror', e => errs.push(String(e)));
P.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
P.setDefaultTimeout(180000);
await P.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await P.waitForFunction(() => window.__bf, { timeout: 60000 });
const ev = c => P.evaluate(s => window.__bf.ev(s), c);
let fails = 0;
const CK = (ok, m) => { console.log((ok ? '  ok  ' : '  FAIL ') + m); if (!ok) fails++; };

const MODES = ['tdm', 'elim', 'snd', 'king', 'front', 'knife', 'gun', 'ffa', 'br', 'oitc', 'ctf', 'build', 'inf'];
const FFA = new Set(['gun', 'ffa', 'br', 'oitc']);
const NO_KILLS = new Set(['elim', 'snd', 'king', 'build', 'gun', 'ffa', 'br', 'oitc', 'ctf', 'inf']);

const lobby = await ev(`(() => {
  const FFA = ['gun','ffa','br','oitc'];
  const out = [];
  const arm = (role, rule) => {
    NET.browse = false; NET.err = ''; NET.status = ''; NET.pings = {}; NET.diag = null;
    NET.code = 'ROOM1'; NET.hostName = 'Ada'; NET.ready = false; NET.teamUp = false; NET.teamUpC = false;
    NET.fillC = true; profile.fillBots = true; NET.goal = 50; profile.goal = 50;
    MAP = MAPS.town; profile.map = 'town';
    if (role === 'client') {
      NET.mode = 'client'; NET.rule = rule; NET.nid = 'P1'; NET.mapKey = 'town';
      NET.roster = [{nid:'P0',name:'Ada',team:'blue',rd:1,lv:4},{nid:'P1',name:'Bea',team:'red',rd:0,lv:2}];
      NET.botsList = {blue:['Kodiak','Pinecone'],red:['Yeti','Viper']};
      player.team = 'red';
    } else {
      NET.mode = role === 'host' ? 'host' : '';
      profile.rule = rule; NET.rule = rule; NET.nid = 'P0'; NET.mapKey = 'town';
      NET.roster = []; player.team = 'blue';
    }
    renderMP();
    const body = $('mpBody');
    const text = body.innerText || '';
    const sides = [...body.querySelectorAll('.lobSide')].map(s => ({
      cls: s.className,
      label: (s.querySelector('.lobSideH span') || {}).textContent || '',
      slots: s.querySelectorAll('.slot').length,
      color: getComputedStyle(s.querySelector('.lobSideH')).color
    }));
    const av = [...body.querySelectorAll('.slot .av')].map(el => el.getAttribute('style') || '');
    return {
      role, rule, slots: teamSize(),
      text,
      sides,
      kills: text.includes('Kills to win'),
      fill: text.includes('Fill my team'),
      swap: !!body.querySelector('[data-swap]'),
      join: text.includes('New players join'),
      blueRed: /\\b(BLUE|RED)\\b/.test(text) || av.some(s => /var\\(--(blue|red)\\)/.test(s)),
      cap: (body.querySelector('.lobCount b') && body.querySelector('.lobCount').innerText) || ''
    };
  };
  for (const rule of ${JSON.stringify(MODES)}) {
    out.push(arm('solo', rule));
    out.push(arm('host', rule));
    out.push(arm('client', rule));
  }
  // zombies stay a single survivor list of 4
  MAP = MAPS.zombie; profile.map = 'zombie'; NET.mode = ''; profile.rule = 'tdm';
  renderMP();
  const z = $('mpBody');
  out.push({ role:'solo', rule:'zombie', slots:4, text:z.innerText, sides:[...z.querySelectorAll('.lobSide')].map(s => ({cls:s.className, label:(s.querySelector('.lobSideH span')||{}).textContent||'', slots:s.querySelectorAll('.slot').length, color:''})), kills:false, fill:true, swap:false, join:false, blueRed:false, cap:'' });
  MAP = MAPS.town; profile.map = 'town';
  return out;
})()`);

for (const row of lobby) {
  const tag = row.role + ' ' + row.rule;
  if (row.rule === 'zombie') {
    CK(row.sides.length === 1 && row.sides[0].slots === 4 && /SURVIVORS/.test(row.sides[0].label), tag + ' survivors x4');
    continue;
  }
  const ffa = FFA.has(row.rule);
  const expectN = row.rule === 'br' ? 12 : row.slots;
  if (ffa) {
    CK(row.sides.length === 1 && row.sides[0].label === 'PLAYERS' && row.sides[0].slots === expectN, tag + ' one PLAYERS list of ' + expectN + ' (got ' + JSON.stringify(row.sides) + ')');
    CK(!row.fill && !row.swap && !row.join, tag + ' hides team swap, Fill my team, and team join');
    CK(!row.blueRed, tag + ' no blue/red in the lobby');
    CK(/No teams/.test(row.text), tag + ' lobby copy is not a team game');
  } else {
    CK(row.sides.length === 2 && row.sides[0].slots === row.slots && row.sides[1].slots === row.slots, tag + ' two sides of teamSize ' + row.slots + ' (got ' + JSON.stringify(row.sides.map(s => s.slots)) + ')');
    CK(row.sides[0].label === 'BLUE TEAM' && row.sides[1].label === 'RED TEAM', tag + ' team labels');
    if (row.role !== 'client') CK(row.swap, tag + ' team swap stays');
    if (row.rule !== 'zombie') CK(row.fill, tag + ' Fill my team stays');
  }
  if (NO_KILLS.has(row.rule)) CK(!row.kills, tag + ' hides kills-to-win');
  else CK(row.kills, tag + ' shows kills-to-win');
}

const goals = await ev(`(() => {
  const run = (role, rule) => {
    MAP = MAPS.town; profile.map = 'town'; NET.goal = 80; profile.goal = 80; profile.rule = rule; NET.rule = rule;
    NET.mode = role === 'client' ? 'client' : '';
    RS.on = false;
    resetMatch(true);
    return { role, rule, goal: $('goalTxt').textContent, ffa: $('score').classList.contains('ffa'), you: $('sBl').hidden ? '' : $('sBl').textContent, lead: $('sRl').hidden ? '' : $('sRl').textContent };
  };
  const rows = [];
  for (const rule of ['tdm','elim','snd','king','ffa','gun','br','oitc']) {
    rows.push(run('solo', rule));
    rows.push(run('client', rule));
  }
  // score numbers: you versus the leader, neutral chips
  profile.rule = 'ffa'; NET.mode = ''; NET.rule = 'ffa'; resetMatch(true);
  player.kills = 4;
  const foe = bots.find(b => b.inMatch !== false && b !== player);
  foe.kills = 9; foe.alive = true;
  refreshHUD(0);
  const chip = el => getComputedStyle(el).backgroundImage;
  const score = {
    you: $('sB').textContent, lead: $('sR').textContent,
    labL: $('sBl').textContent, labR: $('sRl').textContent,
    hiddenL: $('sBl').hidden, hiddenR: $('sRl').hidden,
    cls: $('score').className,
    bgL: chip(document.querySelector('#score .b')),
    bgR: chip(document.querySelector('#score .r'))
  };
  // joiner sees the same chrome once the mode is on
  NET.mode = 'client'; NET.rule = 'ffa'; resetMatch(true);
  player.kills = 2; if (foe) foe.kills = 6;
  refreshHUD(0);
  const join = { you: $('sB').textContent, lead: $('sR').textContent, cls: $('score').className, goal: $('goalTxt').textContent, labL: $('sBl').hidden ? '' : $('sBl').textContent, labR: $('sRl').hidden ? '' : $('sRl').textContent };
  // team deathmatch must stay blue/red
  NET.mode = ''; profile.rule = 'tdm'; NET.rule = 'tdm'; resetMatch(true);
  scores.blue = 3; scores.red = 5; refreshHUD(0);
  const tdm = { you: $('sB').textContent, lead: $('sR').textContent, cls: $('score').className, labs: $('sBl').hidden && $('sRl').hidden, bgL: chip(document.querySelector('#score .b')) };
  return { rows, score, join, tdm };
})()`);

for (const row of goals.rows) {
  const tag = row.role + ' ' + row.rule;
  if (row.rule === 'elim' || row.rule === 'snd') CK(row.goal === 'First to 5 rounds', tag + ' goal "' + row.goal + '"');
  else if (row.rule === 'king') CK(/^Kill \d+ kings$/.test(row.goal), tag + ' goal "' + row.goal + '"');
  else if (row.rule === 'ffa') CK(row.goal === 'First to 25 kills', tag + ' goal "' + row.goal + '"');
  else if (row.rule === 'gun') CK(/Gun Game/.test(row.goal), tag + ' goal "' + row.goal + '"');
  else if (row.rule === 'br') CK(row.goal === 'Last one standing', tag + ' goal "' + row.goal + '"');
  else if (row.rule === 'oitc') CK(row.goal === '3 lives · one bullet', tag + ' goal "' + row.goal + '"');
  else if (row.rule === 'tdm') CK(/^First to \d+$/.test(row.goal), tag + ' goal "' + row.goal + '"');
  if (FFA.has(row.rule)) CK(row.ffa && row.you === 'YOU' && row.lead === 'LEADER', tag + ' score labels');
  else CK(!row.ffa, tag + ' score stays a team score');
}
CK(goals.score.you === '4' && goals.score.lead === '9' && goals.score.labL === 'YOU' && goals.score.labR === 'LEADER' && !goals.score.hiddenL, 'host FFA score is YOU 4 - LEADER 9');
CK(goals.score.cls.includes('ffa') && !/91,\s*156,\s*240/.test(goals.score.bgL) && !/239,\s*90,\s*79/.test(goals.score.bgR), 'FFA score chips are not blue/red');
CK(goals.join.cls.includes('ffa') && goals.join.labL === 'YOU' && goals.join.labR === 'LEADER' && goals.join.goal === 'First to 25 kills', 'joiner FFA score is YOU / LEADER (' + goals.join.you + ' / ' + goals.join.lead + ')');
CK(!goals.tdm.cls.includes('ffa') && goals.tdm.labs && goals.tdm.you === '3' && goals.tdm.lead === '5' && /91,\s*156,\s*240/.test(goals.tdm.bgL), 'team score stays blue vs red');

const end = await ev(`(() => {
  const paint = (role) => {
    NET.mode = role === 'client' ? 'client' : '';
    profile.rule = 'ffa'; NET.rule = 'ffa'; MAP = MAPS.town;
    resetMatch(true);
    state = 'play'; match.ended = false;
    player.kills = 2; player.deaths = 1;
    const foe = bots.find(b => b.inMatch !== false);
    if (foe) { foe.kills = 7; foe.deaths = 0; }
    XM.win = { n: foe ? foe.nid : 'B0', name: foe ? foe.name : 'Yeti' };
    endMatch(false);
    const pod = $('endPod').innerHTML;
    const board = $('endBody').innerHTML;
    const blob = $('endTitle').className + '|' + $('endWin').className + '|' + $('endWin').textContent + '|' + $('endSub').textContent + '|' + pod + '|' + board;
    return { role, blob, title: $('endTitle').className, win: $('endWin').textContent, sub: $('endSub').textContent, board, pod };
  };
  const ffa = [paint('solo'), paint('client')];
  NET.mode = ''; profile.rule = 'tdm'; NET.rule = 'tdm';
  resetMatch(true); state = 'play'; match.ended = false; XM.on = false; XM.ffa = false; XM.win = null;
  scores.blue = 10; scores.red = 4; player.team = 'blue'; player.kills = 3;
  endMatch(false);
  const tdm = $('endWin').textContent + '|' + $('endSub').textContent;
  return { ffa, tdm };
})()`);

for (const row of end.ffa) {
  const bad = /\b(BLUE|RED)\b/.test(row.blob) || /\b(cb|cr|eTb|eTr)\b/.test(row.title + ' ' + row.pod + ' ' + row.board);
  CK(!bad, row.role + ' FFA end has no blue/red (' + row.win + ' / ' + row.sub + ')');
  CK(/EVERYONE/.test(row.board), row.role + ' FFA end board is one list');
  CK(/WINS|YOU WIN/.test(row.win), row.role + ' FFA end names a winner');
}
CK(/BLUE|RED/.test(end.tdm), 'team end screen still names the teams');

const tags = await ev(`(() => {
  const frac = (e) => {
    const sp = e.sprite, ps = Math.abs(sp.parent.scale.y) || 1, h = sp.scale.y * ps;
    const p = new THREE.Vector3(); sp.getWorldPosition(p);
    const a = p.clone(), b = p.clone(); a.y += h / 2; b.y -= h / 2;
    a.project(camera); b.project(camera);
    return Math.abs(a.y - b.y) / 2;
  };
  const place = (e, dist, sc) => {
    e.mesh.scale.setScalar(sc);
    e.mesh.rotation.set(0, 0, 0);
    e.mesh.position.set(0, 0, 0);
    e.mesh.updateWorldMatrix(true, true);
    const p = new THREE.Vector3(); e.sprite.getWorldPosition(p);
    camera.position.set(p.x, p.y, p.z + dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(p);
    camera.fov = 75; camera.updateProjectionMatrix();
    state = 'play';
    fitNameTags();
    return +frac(e).toFixed(4);
  };
  const e = bots[0];
  e.sprite.visible = true;
  const near = place(e, 1, 0.9);
  const mid = place(e, 20, 0.9);
  const far = place(e, 40, 0.9);
  const king = place(e, 1, 2.7);
  const close = place(e, 0.4, 0.9);
  return { near, mid, far, king, close };
})()`);

CK(tags.near < 0.03, 'tag at 1 block is ' + (tags.near * 100).toFixed(2) + '% of screen height (< 3%)');
CK(tags.close < 0.03, 'tag closer than 1 block stays capped (' + (tags.close * 100).toFixed(2) + '%)');
CK(tags.king < 0.03, 'king-sized tag at 1 block stays capped (' + (tags.king * 100).toFixed(2) + '%)');
CK(tags.mid < tags.near - 0.005 && tags.far < tags.mid - 0.002, 'tag shrinks with distance (1 / 20 / 40 = ' + tags.near + ' / ' + tags.mid + ' / ' + tags.far + ')');

await P.setViewportSize({ width: 390, height: 700 });
const back = await ev(`(() => {
  state = 'play'; paused = false; match.ended = false;
  $('end').hidden = true; $('pause').hidden = true; $('settings').hidden = true;
  toggleBoard(true);
  const row = i => '<tr><td>Player ' + i + '</td><td>1</td><td>0</td></tr>';
  const tbl = (cap, n) => '<table><caption>' + cap + '</caption><tr><th>Name</th><th>K</th><th>D</th></tr>' + Array.from({length:n}, (_, i) => row(i)).join('') + '</table>';
  $('boardBody').innerHTML = tbl('BLUE', 12) + tbl('RED', 12);
  const btn = $('boardBack'), sheet = document.querySelector('#board .sheet');
  const br = btn.getBoundingClientRect(), sh = sheet.getBoundingClientRect();
  const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
  return {
    inside: br.height > 8 && br.top >= sh.top - 1 && br.bottom <= sh.bottom + 1,
    hit: hit ? (hit.id || hit.tagName) : '',
    covered: !!(hit && (hit.id === 'boardBody' || (hit.closest && hit.closest('#boardBody'))))
  };
})()`);
CK(back.inside && back.hit === 'boardBack' && !back.covered, 'Back to game is on screen and is the hit target (' + JSON.stringify(back) + ')');
const box = await P.locator('#boardBack').boundingBox();
await P.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
const afterClick = await ev(`({ state, hidden: $('board').hidden })`);
CK(afterClick.hidden && afterClick.state === 'play', 'Back to game closes the board on the first click');
await ev(`state='play'; paused=false; toggleBoard(true);`);
await P.keyboard.press('Escape');
const afterEsc = await ev(`({ state, hidden: $('board').hidden, pause: $('pause').hidden })`);
CK(afterEsc.hidden && afterEsc.state === 'play', 'Esc closes the scoreboard');
await P.setViewportSize({ width: 1280, height: 720 });

const leave = await ev(`(() => {
  state = 'play'; paused = false; match.ended = false;
  toggleBoard(true);
  const back = $('boardBack'), first = $('boardLeave');
  const same = first.parentElement === back.parentElement || first.closest('.row') === back.closest('.row');
  const before = state;
  first.click();
  const mid = { state, yes: !!$('boardLeaveYes'), sameRow: $('boardLeaveYes') && $('boardLeaveYes').closest('.row') === back.closest('.row'), board: !$('board').hidden };
  $('boardLeaveYes').click();
  return { same, before, mid, after: state, boardHidden: $('board').hidden };
})()`);

CK(!leave.same, 'Leave match is not in the same row as Back to game');
CK(leave.before === 'play' && leave.mid.state === 'play' && leave.mid.yes && leave.mid.board && !leave.mid.sameRow, 'first click asks, and does not leave');
CK(leave.after === 'menu', 'second click leaves the match');

const errTail = errs.filter(e => !/favicon|net::ERR|Failed to load resource|cloud|supabase|peer/i.test(e));
CK(errTail.length === 0, 'no page errors' + (errTail.length ? ' ' + errTail.slice(0, 4).join(' | ') : ''));
console.log(fails ? 'RESULT FAIL ' + fails : 'RESULT ALL PASSED');
await b.close();
process.exit(fails ? 1 : 0);
