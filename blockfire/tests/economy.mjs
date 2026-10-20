// Server economy rules: caps, crates, store, and the fact a raw save cannot raise GP.
import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const R=require('../supabase/economy-rules.js');
let fails=0;const CK=(ok,m)=>{if(!ok){fails++;console.log('FAIL',m);}else console.log('ok',m);};
const ctx=()=>R.freshCtx(Date.parse('2026-06-15T12:00:00Z'));
const base=()=>R.normalize({gp:20000,xp:0,owned:['ak47','p9'],name:'Eden'});

{const c=ctx();const a=R.apply('match',base(),c,{token:'matchtoken1',gp:999999,xp:999999,kills:10,place:1,host_gp:9999,host_xp:9999});
  CK(a.ok&&a.data.gp===20000+a.granted.gp,'match grants something');
  CK(a.granted.gp<=R.CAP.matchGp&&a.granted.xp<=R.CAP.matchXp,'per-match cap');
  CK(a.granted.hostGp<=R.CAP.hostGpMatch,'host slice of one match is capped');
  const again=R.apply('match',a.data,c,{token:'matchtoken1',gp:999999,xp:999999,kills:10,place:1,host_gp:9999,host_xp:9999});
  CK(again.ok&&again.granted.addGp===0&&again.data.gp===a.data.gp,'same match token does not pay twice');
}
{const c=ctx();let p=base(),sum=0;
  for(let i=0;i<8;i++){c.now+=11000;const a=R.apply('match',p,c,{token:'daytoken'+i+'xxxx',gp:12000,xp:16000,kills:150,place:1,host_gp:2400,host_xp:6000});CK(a.ok,'day match '+i);p=a.data;sum+=a.granted.addGp;}
  CK(p.gp-20000<=R.CAP.dayGp&&sum<=R.CAP.dayGp,'daily GP cap across matches');
  c.now+=1000;const fast=R.apply('match',p,c,{token:'toosoonxxxxxxxx',gp:1000,xp:100,kills:1,place:1});
  CK(!fast.ok&&fast.error==='rate','new matches are rate limited');
}
{const c=ctx();const p=R.normalize({gp:500000,xp:3500});const price=R.costOf(p,'gun','m4a1','perm',c.now,false);
  const a=R.apply('buy',p,c,{kind:'gun',id:'m4a1',dur:'perm'});
  CK(a.ok&&a.data.gp===500000-price&&a.data.owned.includes('m4a1'),'buy MK-4 charges the server price');
  const b=R.apply('buy',a.data,c,{kind:'gun',id:'m4a1',dur:'perm'});
  CK(!b.ok,'cannot buy a gun twice');
  const locked=R.apply('buy',p,ctx(),{kind:'gun',id:'awm',dur:'perm'});
  CK(!locked.ok&&locked.error==='locked','level gate holds');
}
{const p=R.normalize({gp:100,xp:0,keys:1,pity:{e:0,l:0},gearOwn:[],daily:{date:'2026-6-15',freeCrate:true,list:[]}});
  const a=R.apply('crate',p,ctx(),{},()=>0.5);
  CK(a.ok&&a.paid==='free'&&a.data.daily.freeCrate===false&&a.prize&&a.prize.tier>=0,'free daily crate does not spend GP');
  const b=R.apply('crate',a.data,ctx(),{},()=>0.99);
  CK(b.ok&&b.paid==='key'&&b.data.keys===0,'next crate spends a key');
}
{let p=R.normalize({gp:0,xp:0,keys:0,pity:{e:29,l:0},gearOwn:['n_legend'],daily:null});
  let epic=0;const rand=()=>0.99;
  for(let i=0;i<5;i++){const a=R.apply('crate',Object.assign(p,{gp:100000}),ctx(),{},rand);p=a.data;p.gp=100000;if(a.prize.tier>=3)epic++;}
  CK(epic>=1,'pity forces an epic-or-better crate');
}
{const p=R.normalize({gp:1000,xp:0});
  const a=R.apply('calendar',p,ctx());CK(a.ok&&a.prize&&a.prize.kind==='gp'&&a.data.gp===1100,'day 1 calendar is 100 GP');
  const b=R.apply('calendar',a.data,ctx());CK(!b.ok,'calendar pays once per UTC day');
}
{const c=ctx();const p=R.normalize({gp:0,xp:0,rank:{s:'2026-05',rp:400,best:700,n:3}});
  const a=R.apply('rank',p,c,{token:'ranktoken01',won:true,kills:10,deaths:2,mvp:true});
  CK(a.ok&&a.delta<=42&&a.delta>=0,'ranked win is bounded');
  CK(a.data.gp>=12000,'new season pays the banked division once');
  const b=R.apply('rank',a.data,c,{token:'ranktoken01',won:true,kills:10,deaths:2,mvp:true});
  CK(b.already||b.data.rank.rp===a.data.rank.rp,'same match cannot climb twice');
  c.now+=1000;const fast=R.apply('rank',b.data,c,{token:'ranktoosoon1',won:true,kills:1,deaths:0});
  CK(!fast.ok&&fast.error==='rate','a new ranked token waits out the gap');
}
{const old={gp:10,xp:5,owned:['ak47'],map:'town',name:'Eden'};
  const nxt=R.protect(old,{gp:999999,xp:50,owned:['ak47','awm'],map:'moon',name:'Hacker'},false);
  CK(nxt.gp===10&&nxt.xp===5&&nxt.owned.join()==='ak47'&&nxt.map==='moon'&&nxt.name==='Eden','a direct save keeps economy and name, keeps the new map');
  const first=R.protect(null,{gp:999999,xp:50,map:'farm',name:'Newbie'},true);
  CK(first.gp===1500&&first.xp===0&&first.map==='farm','a new row starts from the starter kit');
}
{const c=ctx();let p=R.normalize({gp:0,xp:0,daily:null,weekly:null});
  p=R.apply('roll',p,c).data;
  const id=p.daily.list[0].id,goal=({kills:20,heads:8,win:1,boom:3,streak:1,sniper:5,matches:2,shotgun:5})[id];
  const a=R.apply('progress',p,c,{id,n:goal});
  CK(a.ok&&a.granted>0&&a.data.daily.list[0].done,'daily challenge pays its GP once');
  const b=R.apply('progress',a.data,c,{id,n:goal});
  CK(b.granted===0&&b.data.gp===a.data.gp,'daily challenge does not pay twice');
}
{const p=R.normalize({gp:RENAME(),xp:0,name:'Eden'});
  const a=R.apply('rename',p,ctx(),{name:'Nova'});
  CK(a.ok&&a.name==='Nova'&&a.data.gp===p.gp-500000,'rename charges 500,000 GP');
}
function RENAME(){return 500000;}
{const p=R.normalize({gp:0,keys:0,refBonus:[]});
  let cur=p;for(let i=0;i<12;i++){const a=R.apply('friend',cur,ctx(),{tag:'pal'+i});if(a.ok)cur=a.data;}
  CK(cur.refBonus.length===11&&cur.gp===11*5000,'friend bonus stops at 11');
}
console.log(fails?`RESULT ${fails} FAILED`:'RESULT ALL PASSED');
process.exit(fails?1:0);
