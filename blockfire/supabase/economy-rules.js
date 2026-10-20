'use strict';
// Server economy rules shared by the SQL migration (same numbers) and the local mock.
// Existing rows are never rewritten here; callers pass the current JSON and get a new one back.

const ECON_KEYS=['gp','xp','keys','crates','pity','owned','knives','camos','skins','hitfxs','gearOwn','equipOwn','blocks','titles','cards','killfxs','charms','attOwn','rent','paid','stars','gk','rank','nadeLvl','mineLvl','bagLvl','calls','daily','cal','weekly','season','login','tutPaid','refBonus','armorOwn'];

const CAP={
  matchGp:12000,matchXp:16000,hostGpMatch:2400,hostXpMatch:6000,
  dayGp:100000,dayXp:120000,dayHostGp:10000,dayHostXp:20000,dayMatches:60,dayRp:500,
  gapMs:10000,extraGp:2500,killGp:5,event:1.5,rankMin:-30,rankMax:42,
  gkPerGun:40,gkPerMatch:80
};

const GUN_LIST=['ak47','p9','m4a1','mp5','spas','deagle','hornet','falcon','m249','raptor','awm','vandal','thunder','talon','hammer','hawk','goliath','striker','b7','viper9','scout','pug','brass','ranger','cobra','warden','mauler','sabre','ironside','wasp','jackal','eagle','reaper','tempest','banshee','titan','judge','phantom','nova','stinger','duke','twin','dragon','sunflare'];
const GUN_REQ={ak47:1,p9:1,m4a1:2,mp5:3,viper9:4,spas:5,deagle:5,scout:6,hornet:7,stinger:7,pug:8,machete:8,falcon:9,brass:10,m249:11,duke:11,ranger:12,raptor:13,cobra:14,twin:14,awm:15,warden:16,vandal:17,karambit:18,mauler:18,sabre:19,thunder:20,ironside:21,wasp:22,talon:23,jackal:24,eagle:25,hammer:26,reaper:28,hawk:29,tempest:31,goliath:32,banshee:33,dragon:34,striker:35,titan:36,sunflare:37,b7:38,judge:39,rpg:40,phantom:42,nova:45,knife:1};
const GUN_NAME={ak47:'KV-47',p9:'P9 Sidearm',m4a1:'MK-4',mp5:'PX-9',spas:'Breaker 12',deagle:'Magnum .50',hornet:'Hornet SMG',falcon:'Falcon DMR',m249:'Rhino LMG',raptor:'Raptor AR',awm:'Longbow .338',vandal:'Vandal SMG',thunder:'Thunder Auto-12',talon:'Talon AR',hammer:'Twin Hammer',hawk:'Hawk Bolt',goliath:'Goliath LMG',striker:'Striker AR',b7:'B7 Bullpup',viper9:'Viper 9',scout:'Scout Carbine',pug:'Pug 12',brass:'Brass Revolver',ranger:'Ranger LR',cobra:'Cobra SMG',warden:'Warden AR',mauler:'Mauler 20',sabre:'Sabre DMR',ironside:'Ironside LMG',wasp:'Wasp PDW',jackal:'Jackal AR',eagle:'Iron Eagle',reaper:'Reaper .50',tempest:'Tempest AR',banshee:'Banshee SMG',titan:'Titan LMG',judge:'Judge Auto',phantom:'Phantom Bolt',nova:'Nova Pulse',stinger:'Stinger MP',duke:'Duke .45',twin:'Twin Vipers',dragon:'Dragon Duals',sunflare:'Sunflare',rpg:'Viper RL',knife:'Combat Knife',machete:'Machete',karambit:'Karambit'};
const WORDER=GUN_LIST.slice().sort((a,b)=>(GUN_REQ[a]||1)-(GUN_REQ[b]||1)).concat(['rpg']);
const KNIVES=['knife','machete','karambit'];

const PLACE_GP=[2000,1000,500],PLACE_REST=300;
const CRATE_PRICE=900,DUPE_GP=[60,120,300,700,1800,5000],ODDS=[62,22,10.5,4.2,1.1,.2],PITY_E=30,PITY_L=80,NECK_ODDS=.002;
const RENT=[{k:'1d',d:1,f:.03},{k:'3d',d:3,f:.07},{k:'7d',d:7,f:.12},{k:'30d',d:30,f:.3},{k:'90d',d:90,f:.6},{k:'perm',d:0,f:1}];
const SELL_PCT=.7,RENAME_GP=500000,TUT_GP=1000,REF_GP=5000,REF_MAX=11,WEEK_GP=3000;
const BAG=[{n:20,price:0},{n:30,price:1500},{n:45,price:4000},{n:64,price:9000}];
const CALL={price:2500,req:10,max:3};
const RKDIV=[0,300,700,1200,1800,2600],RKDIV_GP=[2000,5000,12000,25000,50000,100000];
const BASE={gun:['ak47','p9'],knife:['knife'],camo:['none'],skin:['std'],hit:['red'],equip:['frag'],blk:['dirt']};

const ATT={mag:800,grip:1000,red:700,holo:900,acog:1500};
const ATT_ALL=['mag','grip','red','holo','acog'];
const ATT_OK={ak47:ATT_ALL,m4a1:ATT_ALL,mp5:ATT_ALL,spas:['grip','red','holo','acog'],m249:ATT_ALL,awm:['mag','grip'],deagle:['mag','red'],p9:['mag','red'],hornet:['mag','grip','red','holo'],falcon:['mag','grip'],raptor:ATT_ALL,vandal:ATT_ALL,thunder:['grip','red','holo','acog'],talon:ATT_ALL,hammer:['red'],hawk:['mag','grip'],goliath:ATT_ALL,striker:ATT_ALL,b7:ATT_ALL};

const CAMOS={
  none:{name:'Gunmetal',price:0},desert:{name:'Desert',price:12000},arctic:{name:'Arctic',price:12000},woodland:{name:'Woodland',price:12000},urban:{name:'Urban',price:15000},
  gold:{name:'Gold',price:150000},diamond:{name:'Diamond',price:0,crate:1},
  dragon:{name:'Dragon',price:0,crate:1},tiger:{name:'Tiger',price:0,crate:1},digital:{name:'Digital',price:0,crate:1},toxic:{name:'Toxic',price:0,crate:1},frost:{name:'Frost',price:0,crate:1},
  carbon:{name:'Carbon',price:0,crate:1},neon:{name:'Neon',price:0,crate:1},lava:{name:'Lava',price:0,crate:1},galaxy:{name:'Galaxy',price:0,crate:1}
};
const CAMO_T={desert:2,arctic:2,woodland:2,urban:2,dragon:3,tiger:3,digital:3,toxic:3,frost:3,carbon:4,neon:4,lava:4,galaxy:4,gold:4,diamond:5,mastery:5};
const BOX_CAMOS={
  circuit:['Circuit','rookie'],cobalt:['Cobalt Storm','rookie'],rustwave:['Rust Wave','rookie'],sunset:['Sunset Flow','rookie'],
  plasma:['Plasma Flow','veteran'],dragonfire:['Dragonfire','veteran'],aurora:['Aurora Flow','veteran'],bloodmoon:['Bloodmoon','veteran'],
  goldflow:['Gold Flow','elite'],holo:['Hologram','elite'],obsidian:['Obsidian','elite'],solar:['Solar Flare','elite']
};
for(const id in BOX_CAMOS){CAMOS[id]={name:BOX_CAMOS[id][0],price:0,crate:1,box:BOX_CAMOS[id][1]};CAMO_T[id]={rookie:2,veteran:3,elite:4}[BOX_CAMOS[id][1]];}

const SKIN_PRICE=[0,40000,90000,220000,600000];
const SKINS={std:0,arctic:2,desert:2,jungle:2,urban:2,astro:2,pirate:2,viking:2,mummy:2,night:3,hazmat:3,crimson:3,ninja:3,samurai:3,robot:3,alien:3,tiger:3,gold:4,comet:4,cyber:4,magma:4};
const SKIN_NAME={std:'Standard Issue',arctic:'Arctic Ops',desert:'Desert Ranger',jungle:'Jungle Recon',urban:'Urban Shadow',astro:'Astronaut',pirate:'Sea Pirate',viking:'Frost Viking',mummy:'Mummy',night:'Night Stalker',hazmat:'Hazmat',crimson:'Crimson Guard',ninja:'Shadow Ninja',samurai:'Red Samurai',robot:'Steel Robot',alien:'Green Alien',tiger:'Jungle Tiger',gold:'Gold Elite',comet:'Captain Comet',cyber:'Neon Cyber',magma:'Magma Golem'};

const GEAR={
  h_basic:{price:15000,req:1,name:'Combat Helmet'},h_runner:{price:30000,req:6,name:'Runner Cap'},h_tank:{price:60000,req:12,name:'Tank Helmet'},
  g_basic:{price:10000,req:2,name:'Grip Gloves'},g_runner:{price:25000,req:7,name:'Runner Gloves'},g_tank:{price:45000,req:11,name:'Tank Gauntlets'},
  b_basic:{price:12000,req:3,name:'Utility Belt'},b_runner:{price:30000,req:8,name:'Runner Belt'},b_tank:{price:45000,req:13,name:'Tank Belt'},
  s_basic:{price:30000,req:4,name:'Plate Carrier'},s_runner:{price:55000,req:9,name:'Runner Jersey'},s_tank:{price:90000,req:15,name:'Tank Vest'},
  p_basic:{price:15000,req:3,name:'Leg Guards'},p_runner:{price:40000,req:10,name:'Runner Pants'},p_tank:{price:65000,req:14,name:'Tank Greaves'},
  f_basic:{price:12000,req:2,name:'Combat Boots'},f_runner:{price:60000,req:16,name:'Runner Sneakers'},f_tank:{price:45000,req:12,name:'Tank Boots'},
  n_legend:{price:2500000,req:20,name:'Legend Dog Tag'}
};
const GEAR_SLOT={h_basic:'helmet',h_runner:'helmet',h_tank:'helmet',g_basic:'gloves',g_runner:'gloves',g_tank:'gloves',b_basic:'belt',b_runner:'belt',b_tank:'belt',s_basic:'shirt',s_runner:'shirt',s_tank:'shirt',p_basic:'pants',p_runner:'pants',p_tank:'pants',f_basic:'shoes',f_runner:'shoes',f_tank:'shoes',n_legend:'necklace'};

const EQUIP={frag:{price:0,req:1,name:'Frag grenade'},smoke:{price:800,req:2,name:'Smoke grenade'},fire:{price:1200,req:4,name:'Fire grenade'},flash:{price:1500,req:6,name:'Flashbang'},impact:{price:2500,req:12,name:'Impact grenade'}};
const BUILD={dirt:{price:0,tier:'common',name:'Dirt'},plank:{price:800,tier:'common',name:'Wood Planks'},glass:{price:1200,tier:'rare',name:'Glass'},sand:{price:1800,tier:'rare',name:'Sandbags'},cobble:{price:2600,tier:'rare',name:'Cobblestone'},brick:{price:3600,tier:'epic',name:'Brick'},concrete:{price:5500,tier:'epic',name:'Concrete'},steel:{price:9500,tier:'legendary',name:'Steel Plate'},ice:{price:0,tier:'epic',crate:1,name:'Ice'},cargo:{price:0,tier:'legendary',crate:1,name:'Cargo Red'},cargob:{price:0,tier:'legendary',crate:1,name:'Cargo Blue'},gold:{price:0,tier:'mythic',crate:1,name:'Gold Crate'}};
const BLK_T={common:1,rare:2,epic:3,legendary:4,mythic:5};
const HIT={red:{t:0,price:0,name:'Classic Red'},ember:{t:1,price:25000,name:'Ember'},toxic:{t:2,price:0,name:'Toxic'},ice:{t:2,price:0,name:'Ice Shards'},void:{t:3,price:0,name:'Void'},gold:{t:4,price:0,name:'Liquid Gold'},rainbow:{t:5,price:0,name:'Rainbow'}};
const TITLES={recruit:0,grunt:0,camper:0,lucky:0,builder:1,night:1,sharp:1,demo:2,ghost:2,hunter:2,architect:2,warlord:3,fortress:3,legend:4,apex:4,immortal:5};
const TITLE_NAME={recruit:'Recruit',grunt:'Grunt',camper:'Camper',lucky:'Lucky Shot',builder:'Builder',night:'Night Owl',sharp:'Sharpshooter',demo:'Demolisher',ghost:'Ghost',hunter:'Headhunter',architect:'Architect',warlord:'Warlord',fortress:'Fortress',legend:'Legend',apex:'Apex Predator',immortal:'Immortal',rcollect:'Rookie Collector',vcollect:'Veteran Collector',ecollect:'Elite Collector'};
const COL_TITLES={rcollect:1,vcollect:1,ecollect:1};
const CARDS={steel:0,sand:0,moss:0,ocean:1,ember:1,aurora:2,toxic:2,inferno:3,galaxy:3,royal:4,prism:5};
const CARD_NAME={steel:'Steel',sand:'Sandstorm',moss:'Moss',ocean:'Deep Ocean',ember:'Ember',aurora:'Aurora',toxic:'Toxic',inferno:'Inferno',galaxy:'Galaxy',royal:'Royal',prism:'Prism',sunstrip:'Sunset Strip',carbonf:'Carbon Fiber',crimson:'Crimson Tide',arcticl:'Arctic Light',nebula:'Nebula',midgold:'Midnight Gold',collector:'Collector Gold'};
const BOX_CARDS={sunstrip:['rookie',2],carbonf:['rookie',2],crimson:['veteran',3],arcticl:['veteran',3],nebula:['elite',4],midgold:['elite',4]};
const KILLFX={sparks:1,confetti:2,hearts:3,lightning:3,goldrush:4,void:4,prism:5};
const FX_NAME={sparks:'Sparks',confetti:'Confetti',hearts:'Love Taps',lightning:'Lightning',goldrush:'Gold Rush',void:'Void',prism:'Prism',ink:'Ink Burst',emerald:'Emerald Rain',blossom:'Cherry Blossom',thunder:'Thunderclap',supernova:'Supernova',blackice:'Black Ice'};
const BOX_FX={ink:['rookie',2],emerald:['rookie',2],blossom:['veteran',3],thunder:['veteran',3],supernova:['elite',4],blackice:['elite',4]};
const CHARMS={die:['Lucky Die','rookie',2],slime:['Slime Cube','rookie',2],tag:['Dog Tag','rookie',2],nade:['Mini Grenade','veteran',3],ruby:['Ruby','veteran',3],star:['Gold Star','veteran',3],crystal:['Ice Crystal','elite',4],crown:['Tiny Crown','elite',4]};

const BOXES={
  rookie:{price:50000,cls:'weak',permP:.35,refund:25000,extra:false},
  veteran:{price:150000,cls:'medium',permP:1,refund:75000,extra:false},
  elite:{price:300000,cls:'epic',permP:1,refund:100000,extra:true}
};
const BOX_BONUS={rookie:.25,veteran:.5,elite:1};
const CAL=[['gp',100],['skin',2],['camo',2],['gp',300],['key',1],['blk',1],['key',2],['gp',500],['title',1],['gp',600],['blk',2],['camo',2],['gp',800],['skin',2],['key',3],['gp',1000],['card',2],['camo',3],['gp',1200],['blk',3],['fx',2],['gp',1500],['key',3],['camo',3],['gp',2000],['skin',3],['blk',3],['camo',4],['gp',3000],['key',5],['gp',5000]];
const SEA=[['gp',500],['camo',2],['key',1],['gp',800],['blk',2],['title',2],['gp',1000],['skin',2],['key',2],['card',2],['gp',1500],['camo',3],['fx',2],['gp',2000],['blk',3],['key',2],['title',3],['gp',2500],['skin',3],['card',3],['gp',3000],['camo',3],['key',3],['fx',3],['gp',4000],['blk',4],['title',4],['camo',4],['gp',6000],['skin',4]];
const CHALLENGES=[{id:'kills',goal:20,gp:100},{id:'heads',goal:8,gp:100},{id:'win',goal:1,gp:120},{id:'boom',goal:3,gp:120},{id:'streak',goal:1,gp:150},{id:'sniper',goal:5,gp:120},{id:'matches',goal:2,gp:80},{id:'shotgun',goal:5,gp:120}];
const WEEKLY=[{id:'kills',goal:150},{id:'heads',goal:50},{id:'win',goal:6},{id:'matches',goal:12},{id:'streak',goal:5},{id:'boom',goal:20},{id:'sniper',goal:25},{id:'shotgun',goal:25}];
const LIST_KEY={gun:'owned',knife:'knives',camo:'camos',skin:'skins',hit:'hitfxs',gear:'gearOwn',equip:'equipOwn',blk:'blocks',title:'titles',card:'cards',fx:'killfxs',charm:'charms'};

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const clone=o=>JSON.parse(JSON.stringify(o==null?null:o));
const xpFor=l=>3500+2000*(l-1);
function levelOf(xp){let l=1,rest=Math.max(0,+xp||0);while(l<55&&rest>=xpFor(l)){rest-=xpFor(l);l++;}return l;}
function gunPrice(id){
  if(id==='ak47'||id==='p9'||id==='knife')return 0;
  if(!GUN_REQ[id])return 0;
  if(id!=='machete'&&id!=='karambit'&&WORDER.indexOf(id)<0)return 0;
  const r=Math.max(2,GUN_REQ[id]||2);
  return Math.round((70000+930000*Math.pow((r-2)/38,1.4))/5000)*5000;
}
function gunClass(id){const r=GUN_REQ[id]||1;return r<=12?'weak':r<=30?'medium':'epic';}
function utc(now){
  const d=new Date(now),y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
  return {day:`${y}-${m}-${day}`,month:`${y}-${m}`,monthNum:m,year:y,dim:new Date(Date.UTC(y,m,0)).getUTCDate(),dayNum:Math.floor(now/864e5),week:Math.floor((Math.floor(now/864e5)+3)/7)};
}
function rngOf(seed){let s=seed|0;return()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hashPick(str,i,n){let s=[...str].reduce((a,c)=>a*31+c.charCodeAt(0),i)>>>0;return n?s%n:s;}

function blank(){
  return {gp:1500,xp:0,keys:0,crates:0,pity:{e:0,l:0},owned:['ak47','p9'],knives:['knife'],camos:['none'],skins:['std'],hitfxs:[],gearOwn:[],equipOwn:['frag'],blocks:['dirt'],titles:['recruit'],cards:['steel'],killfxs:[],charms:[],attOwn:{m4a1:['holo']},rent:{},paid:{},stars:{},gk:{},rank:null,nadeLvl:1,mineLvl:0,bagLvl:0,calls:0,daily:null,cal:null,weekly:null,season:null,login:{last:'',streak:0},tutPaid:false,refBonus:[]};
}
function normalize(p){
  p=p&&typeof p==='object'?p:{};
  const b=blank();
  for(const k in b)if(p[k]==null)p[k]=clone(b[k]);
  if(!p.attOwn||typeof p.attOwn!=='object'||Array.isArray(p.attOwn))p.attOwn={};
  if(!Array.isArray(p.attOwn.m4a1))p.attOwn.m4a1=['holo'];
  else if(p.attOwn.m4a1.indexOf('holo')<0)p.attOwn.m4a1=p.attOwn.m4a1.concat('holo');
  for(const g of ['spas','thunder']){const a=Array.isArray(p.attOwn[g])?p.attOwn[g]:[];if(a.indexOf('red')<0)p.attOwn[g]=a.concat('red');}
  if(!p.rent||typeof p.rent!=='object'||Array.isArray(p.rent))p.rent={};
  if(!p.paid||typeof p.paid!=='object'||Array.isArray(p.paid))p.paid={};
  if(!p.pity||typeof p.pity!=='object')p.pity={e:0,l:0};
  p.gp=Math.max(0,p.gp|0);p.xp=Math.max(0,p.xp|0);p.keys=Math.max(0,p.keys|0);
  p.nadeLvl=clamp(p.nadeLvl|0,1,4);p.mineLvl=clamp(p.mineLvl|0,0,2);p.bagLvl=clamp(p.bagLvl|0,0,3);p.calls=clamp(p.calls|0,0,CALL.max);
  return p;
}
function slice(p){const o={};for(const k of ECON_KEYS)if(p&&Object.prototype.hasOwnProperty.call(p,k))o[k]=clone(p[k]);return o;}
function protect(oldData,incoming,isInsert){
  const src=incoming&&typeof incoming==='object'?incoming:{};
  const base=isInsert?blank():normalize(clone(oldData||{}));
  for(const k of Object.keys(src)){
    if(ECON_KEYS.indexOf(k)>=0)continue;
    if(!isInsert&&k==='name')continue;
    base[k]=clone(src[k]);
  }
  return normalize(base);
}

function owns(p,kind,id){
  if(kind==='att'){const i=String(id).indexOf('.'),g=id.slice(0,i),k=id.slice(i+1);return ((p.attOwn||{})[g]||[]).indexOf(k)>=0;}
  const key=LIST_KEY[kind];return key&&(p[key]||[]).indexOf(id)>=0;
}
function priceOf(kind,id){
  if(kind==='gun'||kind==='knife')return gunPrice(id);
  if(kind==='camo')return CAMOS[id]&&!CAMOS[id].crate?CAMOS[id].price:0;
  if(kind==='skin')return SKINS[id]==null?0:(SKIN_PRICE[SKINS[id]]|0);
  if(kind==='hit')return HIT[id]?HIT[id].price:0;
  if(kind==='gear')return GEAR[id]?GEAR[id].price:0;
  if(kind==='equip')return EQUIP[id]?EQUIP[id].price:0;
  if(kind==='blk')return BUILD[id]&&!BUILD[id].crate?BUILD[id].price:0;
  if(kind==='att'){const k=String(id).slice(String(id).indexOf('.')+1);return ATT[k]|0;}
  return 0;
}
function reqOf(kind,id){
  if(kind==='gun'||kind==='knife')return GUN_REQ[id]||1;
  if(kind==='gear')return (GEAR[id]&&GEAR[id].req)||1;
  if(kind==='equip')return (EQUIP[id]&&EQUIP[id].req)||1;
  return 1;
}
function known(kind,id){
  if(kind==='gun')return WORDER.indexOf(id)>=0;
  if(kind==='knife')return KNIVES.indexOf(id)>=0;
  if(kind==='camo')return !!CAMOS[id];
  if(kind==='skin')return SKINS[id]!=null;
  if(kind==='hit')return !!HIT[id];
  if(kind==='gear')return !!GEAR[id];
  if(kind==='equip')return !!EQUIP[id];
  if(kind==='blk')return !!BUILD[id];
  if(kind==='att'){const i=String(id).indexOf('.');if(i<1)return false;const g=id.slice(0,i),k=id.slice(i+1);return !!GUN_NAME[g]&&!!ATT[k]&&(ATT_OK[g]||[]).indexOf(k)>=0;}
  return false;
}
function itemName(kind,id){
  if(kind==='gun'||kind==='knife')return GUN_NAME[id]||id;
  if(kind==='camo')return (CAMOS[id]?CAMOS[id].name:id)+' camo';
  if(kind==='skin')return (SKIN_NAME[id]||id)+' skin';
  if(kind==='hit')return (HIT[id]?HIT[id].name:id)+' hit color';
  if(kind==='gear')return GEAR[id]?GEAR[id].name:id;
  if(kind==='equip')return EQUIP[id]?EQUIP[id].name:id;
  if(kind==='blk')return (BUILD[id]?BUILD[id].name:id)+' blocks';
  if(kind==='att'){const i=String(id).indexOf('.'),k=id.slice(i+1),g=id.slice(0,i);return k+' · '+(GUN_NAME[g]||g);}
  return id;
}
function tierOf(kind,id){
  if(kind==='camo')return CAMO_T[id]||2;
  if(kind==='skin')return SKINS[id]|0;
  if(kind==='hit')return HIT[id]?HIT[id].t:0;
  if(kind==='blk')return BLK_T[BUILD[id]?BUILD[id].tier:'common']||1;
  if(kind==='knife')return id==='karambit'?4:3;
  if(kind==='title')return TITLES[id]|0;
  if(kind==='card')return CARDS[id]!=null?CARDS[id]:(BOX_CARDS[id]?BOX_CARDS[id][1]:0);
  if(kind==='fx')return KILLFX[id]||(BOX_FX[id]?BOX_FX[id][1]:0);
  if(kind==='charm')return CHARMS[id]?CHARMS[id][2]:0;
  if(kind==='gun'){const r=GUN_REQ[id]||1;return r<6?1:r<14?2:r<24?3:r<34?4:5;}
  return 0;
}
function dealOf(p,now){
  const day=Math.floor(now/864e5),lv=levelOf(p.xp),pool=[];
  for(const id of WORDER)if(gunPrice(id)&&(GUN_REQ[id]||1)<=lv+3)pool.push({kind:'gun',id});
  for(const id in SKINS)if(SKIN_PRICE[SKINS[id]])pool.push({kind:'skin',id});
  for(const id in GEAR)if(GEAR[id].price&&(GEAR[id].req||1)<=lv+3&&GEAR[id].price<1e6)pool.push({kind:'gear',id});
  for(const id in CAMOS)if(CAMOS[id].price)pool.push({kind:'camo',id});
  if(!pool.length)return null;
  return pool[(Math.imul(day+7,2654435761)>>>0)%pool.length];
}
function costOf(p,kind,id,dur,now,full){
  const P=priceOf(kind,id);if(!P)return 0;
  const r=RENT.filter(x=>x.k===dur)[0]||RENT[RENT.length-1];
  let c=r.f>=1?P:Math.max(50,Math.round(P*r.f/50)*50);
  if(!full){const d=dealOf(p,now);if(d&&d.kind===kind&&d.id===id)c=Math.max(50,Math.round(c*.75/50)*50);}
  return c;
}
function rentInfo(p,kind,id){const r=p.rent&&p.rent[kind+':'+id];return r&&r.e>0?r:null;}
function pushOwn(p,kind,id){
  if(kind==='att'){const i=id.indexOf('.'),g=id.slice(0,i),k=id.slice(i+1);const a=p.attOwn[g]=p.attOwn[g]||[];if(a.indexOf(k)<0)a.push(k);return;}
  const key=LIST_KEY[kind];if(!key)return;if(!Array.isArray(p[key]))p[key]=[];if(p[key].indexOf(id)<0)p[key].push(id);
}
function dropOwn(p,kind,id){
  if(kind==='att'){const i=id.indexOf('.'),g=id.slice(0,i),k=id.slice(i+1);const a=p.attOwn[g]||[];const j=a.indexOf(k);if(j>=0)a.splice(j,1);return;}
  const key=LIST_KEY[kind];if(!key||!Array.isArray(p[key]))return;const j=p[key].indexOf(id);if(j>=0)p[key].splice(j,1);
}
function grantFree(p){
  const lv=levelOf(p.xp);
  for(const id of WORDER){if((GUN_REQ[id]||1)<=lv&&!gunPrice(id)&&p.owned.indexOf(id)<0)p.owned.push(id);}
}
function seasonTick(p,now){
  const sid=utc(now).month;
  let R=p.rank;
  if(!R||typeof R!=='object'||Array.isArray(R))R=p.rank={s:sid,rp:0,best:0,n:0};
  R.rp=clamp(R.rp|0,0,99999);R.best=Math.max(R.best|0,R.rp);R.n=R.n|0;
  if(typeof R.s!=='string'||!R.s)R.s=sid;
  if(R.s!==sid){
    if((R.n|0)>0){let i=0;for(let k=0;k<RKDIV.length;k++)if((R.best|0)>=RKDIV[k])i=k;p.gp+=RKDIV_GP[i];}
    R.s=sid;R.rp=Math.floor(R.rp/2);R.best=R.rp;R.n=0;
  }
  return R;
}
function seasonXp(p,now,dx){
  const sid=utc(now).month;
  let S=p.season;
  if(!S||S.id!==sid||!Array.isArray(S.got))S=p.season={id:sid,xp:0,got:[]};
  S.xp=Math.max(0,Math.min(1e7,(+S.xp||0)+Math.max(0,Math.min(20000,dx|0))));
  p.season=S;
}

function fail(error){return {ok:false,error};}
function ok(p,extra){return Object.assign({ok:true,data:p},extra||{});}

function freshCtx(now){return {now:now||Date.now(),matches:{},days:{},lastNew:0};}
function dayBag(ctx){
  const k=utc(ctx.now).day;
  return ctx.days[k]||(ctx.days[k]={match_gp:0,match_xp:0,host_gp:0,host_xp:0,matches:0,rank_up:0});
}

function matchReward(data,ctx,a){
  const p=normalize(clone(data));
  const token=String(a.token||a.p_token||'');
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(token))return fail('token');
  const D=dayBag(ctx);
  let rec=ctx.matches[token];
  if(!rec){
    if(ctx.lastNew&&ctx.now-ctx.lastNew<CAP.gapMs)return fail('rate');
    if(D.matches>=CAP.dayMatches)return fail('day');
    ctx.lastNew=ctx.now;D.matches++;
    rec=ctx.matches[token]={gp:0,xp:0,host_gp:0,host_xp:0,gk:0,calls:0};
  }
  const kills=clamp(a.kills|a.p_kills|0,0,150);
  const place=clamp(a.place|a.p_place|0,0,24);
  const base=place>=1&&place<=3?PLACE_GP[place-1]:place>0?PLACE_REST:0;
  const selfCap=Math.round((base+kills*CAP.killGp+CAP.extraGp)*CAP.event);
  let wantGp=clamp(a.gp|a.p_gp|0,0,CAP.matchGp);
  let wantXp=clamp(a.xp|a.p_xp|0,0,CAP.matchXp);
  let wantHost=Math.min(clamp(a.host_gp|a.p_host_gp|0,0,CAP.hostGpMatch),wantGp);
  let wantHostXp=Math.min(clamp(a.host_xp|a.p_host_xp|0,0,CAP.hostXpMatch),wantXp);
  const selfGp=Math.min(Math.max(0,wantGp-wantHost),selfCap);
  const capGp=Math.min(CAP.matchGp,selfGp+wantHost);
  const deltaGp=Math.max(0,capGp-rec.gp),deltaXp=Math.max(0,wantXp-rec.xp);
  const deltaHost=Math.max(0,wantHost-rec.host_gp),deltaHostXp=Math.max(0,wantHostXp-rec.host_xp);
  let give=Math.min(deltaGp,Math.max(0,CAP.dayGp-D.match_gp));
  let giveXp=Math.min(deltaXp,Math.max(0,CAP.dayXp-D.match_xp));
  const hostRoom=Math.max(0,CAP.dayHostGp-D.host_gp),hostXpRoom=Math.max(0,CAP.dayHostXp-D.host_xp);
  let giveHost=Math.min(deltaHost,give,hostRoom);
  let giveHostXp=Math.min(deltaHostXp,giveXp,hostXpRoom);
  const hostIn=Math.min(deltaHost,deltaGp);
  if(giveHost<hostIn)give-=hostIn-giveHost;
  const hostXpIn=Math.min(deltaHostXp,deltaXp);
  if(giveHostXp<hostXpIn)giveXp-=hostXpIn-giveHostXp;
  give=Math.max(0,give);giveXp=Math.max(0,giveXp);
  const wantCalls=clamp(a.calls|a.p_calls|0,0,2);
  const giveCalls=Math.max(0,Math.min(wantCalls-(rec.calls|0),p.calls|0));
  rec.calls=(rec.calls|0)+giveCalls;p.calls=(p.calls|0)-giveCalls;
  rec.gp+=give;rec.xp+=giveXp;rec.host_gp+=giveHost;rec.host_xp+=giveHostXp;
  D.match_gp+=give;D.match_xp+=giveXp;D.host_gp+=giveHost;D.host_xp+=giveHostXp;
  p.gp+=give;p.xp+=giveXp;
  if(giveXp>0)seasonXp(p,ctx.now,giveXp);
  const gk=a.gk||a.p_gk||{};
  let gkAdd=0;
  if(gk&&typeof gk==='object')for(const id in gk){
    if(!GUN_NAME[id]||KNIVES.indexOf(id)>=0)continue;
    let n=clamp(gk[id]|0,0,CAP.gkPerGun);
    n=Math.min(n,CAP.gkPerMatch-(rec.gk|0));
    if(n<=0)continue;
    p.gk[id]=(p.gk[id]|0)+n;rec.gk=(rec.gk|0)+n;gkAdd+=n;
  }
  grantFree(p);seasonTick(p,ctx.now);
  return ok(p,{granted:{gp:rec.gp,xp:rec.xp,addGp:give,addXp:giveXp,hostGp:rec.host_gp},gk:gkAdd});
}

function rankUpdate(data,ctx,a){
  const p=normalize(clone(data));
  const token=String(a.token||a.p_token||'');
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(token))return fail('token');
  let rec=ctx.matches[token];
  if(!rec){
    if(ctx.lastNew&&ctx.now-ctx.lastNew<CAP.gapMs)return fail('rate');
    const D=dayBag(ctx);
    if(D.matches>=CAP.dayMatches)return fail('day');
    ctx.lastNew=ctx.now;D.matches++;
    rec=ctx.matches[token]={gp:0,xp:0,host_gp:0,host_xp:0,gk:0,calls:0};
  }
  const R=seasonTick(p,ctx.now);
  if(rec.ranked)return ok(p,{already:true,delta:0});
  const won=!!(a.won||a.p_won),draw=!!(a.draw||a.p_draw)&&!won;
  const kills=clamp(a.kills|a.p_kills|0,0,150),deaths=clamp(a.deaths|a.p_deaths|0,0,150);
  let d=won?24:draw?6:-16;
  d+=clamp(Math.round((kills-deaths)*1.5),-8,12);
  if(a.mvp||a.p_mvp)d+=6;
  if(!won&&!draw&&R.rp<100)d=Math.max(d,-6);
  d=clamp(d,CAP.rankMin,CAP.rankMax);
  if(d>0){const room=Math.max(0,CAP.dayRp-dayBag(ctx).rank_up);d=Math.min(d,room);dayBag(ctx).rank_up+=d;}
  R.rp=Math.max(0,R.rp+d);R.n++;R.best=Math.max(R.best|0,R.rp);
  rec.ranked=true;
  return ok(p,{delta:d});
}

function listHas(p,kind,id){return owns(p,kind,id);}
function give(p,w){
  const key=w.kind+':'+w.v;
  if(w.dupe&&p.rent&&p.rent[key]){delete p.rent[key];return 'Yours forever now (was a rental)';}
  if(w.dupe&&w.kind!=='gp'&&w.kind!=='xp'&&w.kind!=='key'){p.gp+=DUPE_GP[Math.min(5,w.tier|0)]||0;return 'dupe';}
  if(w.kind==='gp'){p.gp+=w.v|0;return '';}
  if(w.kind==='xp'){p.xp+=w.v|0;grantFree(p);return '';}
  if(w.kind==='key'){p.keys+=w.v|0;return '';}
  if(w.kind==='gear'){pushOwn(p,'gear',w.v);if(GEAR_SLOT[w.v]){p.gear=p.gear||{};if(!p.gear[GEAR_SLOT[w.v]])p.gear[GEAR_SLOT[w.v]]=w.v;}}
  else pushOwn(p,w.kind,w.v);
  return '';
}
function cratePool(p,t){
  const P=[],add=(kind,v,label,w)=>P.push({kind,v,label,tier:t,w:w||1,dupe:kind!=='gp'&&kind!=='xp'&&listHas(p,kind,v)});
  const gp=[[100,150,200],[400,600],[1200],[3000],[7000],[15000]][t];
  for(const v of gp)add('gp',v,v+' GP',t<2?2:1);
  if(t<=1)add('xp',t?150:60,(t?150:60)+' XP',1);
  for(const k in TITLES)if(TITLES[k]===t&&!COL_TITLES[k])add('title',k,'Title: '+(TITLE_NAME[k]||k));
  for(const k in CARDS)if(CARDS[k]===t)add('card',k,(CARD_NAME[k]||k)+' banner');
  for(const k in KILLFX)if(KILLFX[k]===t)add('fx',k,(FX_NAME[k]||k)+' kill effect');
  for(const k in HIT)if(HIT[k].t===t&&t>=2)add('hit',k,HIT[k].name+' hit color');
  for(const k in BUILD){if(k!=='dirt'&&BLK_T[BUILD[k].tier]===t)add('blk',k,BUILD[k].name+' blocks');}
  if(t===1)['plank','glass'].forEach(k=>add('blk',k,BUILD[k].name+' blocks'));
  if(t===2){['desert','arctic','woodland','urban'].forEach(k=>add('camo',k,CAMOS[k].name+' camo'));for(const k in SKINS)if(SKINS[k]===2)add('skin',k,SKIN_NAME[k]+' skin',.3);}
  if(t===3){['dragon','tiger','digital','toxic','frost'].forEach(k=>add('camo',k,CAMOS[k].name+' camo'));add('knife','machete','Machete');for(const k in SKINS)if(SKINS[k]===3)add('skin',k,SKIN_NAME[k]+' skin',.4);}
  if(t===4){['carbon','neon','lava','galaxy'].forEach(k=>add('camo',k,CAMOS[k].name+' camo'));add('knife','karambit','Karambit');const lv=levelOf(p.xp);for(const id of WORDER)if(gunPrice(id)>0&&(GUN_REQ[id]||1)<=lv+10)add('gun',id,GUN_NAME[id]);}
  if(t===5){add('skin','gold','Gold Elite skin');add('camo','gold','Gold camo');add('camo','diamond','Diamond camo');}
  return P;
}
function crateTier(p,rand,pityOn){
  const pity=p.pity||{e:0,l:0};
  if(pityOn&&pity.l>=PITY_L-1)return rand()<ODDS[5]/(ODDS[4]+ODDS[5])?5:4;
  if(pityOn&&pity.e>=PITY_E-1){const top=ODDS[3]+ODDS[4]+ODDS[5];let r=rand()*top;for(let t=3;t<6;t++){r-=ODDS[t];if(r<=0)return t;}return 3;}
  let r=rand()*100;for(let t=0;t<6;t++){r-=ODDS[t];if(r<=0)return t;}return 0;
}
function rollReward(p,rand,pityOn){
  if(p.gearOwn.indexOf('n_legend')<0&&rand()<NECK_ODDS)return {kind:'gear',v:'n_legend',label:'Legend Dog Tag',tier:5,w:1,dupe:false};
  const t=crateTier(p,rand,pityOn),P=cratePool(p,t);
  let tot=0;for(const it of P)tot+=it.w;
  let r=rand()*tot,it=P[0];
  for(const x of P){r-=x.w;if(r<=0){it=x;break;}}
  return Object.assign({},it);
}
function openCrate(data,ctx,a,rand){
  const p=normalize(clone(data));
  rand=rand||Math.random;
  rollDay(p,ctx,true);
  let how='gp';
  if(p.daily&&p.daily.freeCrate){p.daily.freeCrate=false;how='free';}
  else if((p.keys|0)>0){p.keys--;how='key';}
  else if(p.gp<CRATE_PRICE)return fail('gp');
  else p.gp-=CRATE_PRICE;
  const win=rollReward(p,rand,true);
  p.crates=(p.crates|0)+1;
  p.pity.e=win.tier>=3?0:(p.pity.e|0)+1;
  p.pity.l=win.tier>=4?0:(p.pity.l|0)+1;
  const note=give(p,win);
  return ok(p,{prize:win,note:note==='dupe'?`Duplicate · +${(DUPE_GP[win.tier]|0).toLocaleString?DUPE_GP[win.tier]:DUPE_GP[win.tier]} GP`:note,paid:how});
}

function buy(data,ctx,a){
  const p=normalize(clone(data));
  const kind=String(a.kind||a.p_kind||''),id=String(a.id||a.p_id||''),dur=String(a.dur||a.p_dur||'perm');
  if(!known(kind,id))return fail('item');
  const price=priceOf(kind,id);
  if(!price||reqOf(kind,id)>levelOf(p.xp))return fail('locked');
  const owned=owns(p,kind,id),rent=rentInfo(p,kind,id);
  if(owned&&!rent)return fail('owned');
  const R=RENT.filter(x=>x.k===dur)[0];if(!R)return fail('dur');
  const c=costOf(p,kind,id,dur,ctx.now,false);
  if(p.gp<c)return fail('gp');
  p.gp-=c;
  const k=kind+':'+id;
  if(R.d){const r=p.rent[k]||{e:ctx.now,d:0,p:0};r.e=Math.max(r.e||ctx.now,ctx.now)+R.d*864e5;r.d=(r.d||0)+R.d*864e5;r.p=(r.p|0)+c;p.rent[k]=r;delete p.paid[k];}
  else{delete p.rent[k];p.paid[k]=c;}
  if(!owned)pushOwn(p,kind,id);
  return ok(p,{spent:c,name:itemName(kind,id),rent:!!R.d});
}
function sellValue(p,kind,id){
  if(!known(kind,id)||!owns(p,kind,id)||rentInfo(p,kind,id))return 0;
  if((BASE[kind]||[]).indexOf(id)>=0)return 0;
  const paid=p.paid&&p.paid[kind+':'+id];
  if(typeof paid==='number')return Math.round(paid*SELL_PCT/10)*10;
  const t=tierOf(kind,id);if(t>0)return DUPE_GP[Math.min(5,t)];
  return kind==='att'?0:Math.round(priceOf(kind,id)*.35/10)*10;
}
function sell(data,ctx,a){
  const p=normalize(clone(data));
  const kind=String(a.kind||a.p_kind||''),id=String(a.id||a.p_id||'');
  const v=sellValue(p,kind,id);if(!v)return fail('no');
  dropOwn(p,kind,id);if(p.paid)delete p.paid[kind+':'+id];p.gp+=v;
  return ok(p,{gain:v,name:itemName(kind,id)});
}
function upgrade(data,ctx,a){
  const p=normalize(clone(data));
  const what=String(a.what||a.p_what||'');
  if(what==='nade'){if(p.nadeLvl>=4)return fail('max');const price=600*p.nadeLvl;if(p.gp<price)return fail('gp');p.gp-=price;p.nadeLvl++;return ok(p,{spent:price});}
  if(what==='mine'){if(p.mineLvl>=2)return fail('max');if(p.gp<1500)return fail('gp');p.gp-=1500;p.mineLvl++;return ok(p,{spent:1500});}
  if(what==='bag'){const nx=BAG[(p.bagLvl|0)+1];if(!nx)return fail('max');if(p.gp<nx.price)return fail('gp');p.gp-=nx.price;p.bagLvl++;return ok(p,{spent:nx.price});}
  if(what==='call'){if(levelOf(p.xp)<CALL.req)return fail('locked');if(p.calls>=CALL.max)return fail('max');if(p.gp<CALL.price)return fail('gp');p.gp-=CALL.price;p.calls++;return ok(p,{spent:CALL.price});}
  return fail('what');
}

function boxSeasonOn(sid,id){let h=7;for(const c of sid+'|'+id)h=(h*31+c.charCodeAt(0))>>>0;return h%3!==0;}
function openBox(data,ctx,a,rand){
  const p=normalize(clone(data));
  rand=rand||Math.random;
  const k=String(a.box||a.p_box||'');
  const B=BOXES[k];if(!B)return fail('box');
  const sid=utc(ctx.now).month;
  const guns=WORDER.filter(id=>id!=='ak47'&&id!=='p9'&&id!=='rpg'&&gunClass(id)===B.cls&&(!(p.owned.indexOf(id)>=0&&!rentInfo(p,'gun',id))||((p.stars[id]|0)<3)));
  const cos=[];
  for(const id in BOX_CAMOS)if(BOX_CAMOS[id][1]===k&&boxSeasonOn(sid,'camo:'+id)&&p.camos.indexOf(id)<0)cos.push({kind:'camo',v:id,n:BOX_CAMOS[id][0]+' camo'});
  for(const id in BOX_FX)if(BOX_FX[id][0]===k&&boxSeasonOn(sid,'fx:'+id)&&p.killfxs.indexOf(id)<0)cos.push({kind:'fx',v:id,n:FX_NAME[id]+' kill effect'});
  for(const id in BOX_CARDS)if(BOX_CARDS[id][0]===k&&boxSeasonOn(sid,'card:'+id)&&p.cards.indexOf(id)<0)cos.push({kind:'card',v:id,n:CARD_NAME[id]+' banner'});
  for(const id in CHARMS)if(CHARMS[id][1]===k&&boxSeasonOn(sid,'charm:'+id)&&p.charms.indexOf(id)<0)cos.push({kind:'charm',v:id,n:CHARMS[id][0]+' charm'});
  const skins=B.extra?Object.keys(SKINS).filter(id=>SKINS[id]>=3&&p.skins.indexOf(id)<0):[];
  const titles=B.extra?Object.keys(TITLES).filter(id=>TITLES[id]>=3&&TITLES[id]<=4&&!COL_TITLES[id]&&p.titles.indexOf(id)<0):[];
  if(!guns.length&&!cos.length&&!skins.length&&!titles.length)return fail('empty');
  if(p.gp<B.price)return fail('gp');
  p.gp-=B.price;
  const got=[];let refund=0;
  const pick=arr=>arr[Math.floor(rand()*arr.length)];
  if(guns.length){
    const id=pick(guns),key='gun:'+id;
    if(p.owned.indexOf(id)>=0&&!rentInfo(p,'gun',id)){const n=Math.min(3,(p.stars[id]|0)+1);p.stars[id]=n;got.push({kind:'star',id,txt:GUN_NAME[id]+' '+'★'.repeat(n)+'☆'.repeat(3-n),sub:'Repeat gun · star '+n+' of 3'});}
    else if(p.owned.indexOf(id)>=0&&p.rent[key]){delete p.rent[key];got.push({kind:'gun',id,txt:GUN_NAME[id],sub:'Yours forever now (was a rental)'});}
    else{const perm=rand()<B.permP;if(p.owned.indexOf(id)<0)p.owned.push(id);
      if(perm){delete p.rent[key];got.push({kind:'gun',id,txt:GUN_NAME[id],sub:'Forever'});}
      else{const r=p.rent[key]||{e:ctx.now,d:0,p:0};r.e=Math.max(r.e||ctx.now,ctx.now)+90*864e5;r.d=(r.d||0)+90*864e5;p.rent[key]=r;got.push({kind:'gun',id,txt:GUN_NAME[id],sub:'90 days'});}}
  }else refund+=B.refund;
  if(rand()<BOX_BONUS[k]){if(cos.length){const x=pick(cos);give(p,{kind:x.kind,v:x.v,tier:4,dupe:false});got.push({kind:x.kind,id:x.v,txt:x.n,sub:'Box-only · forever'});}else refund+=Math.round(B.refund/2);}
  if(B.extra){
    if(skins.length){const id=pick(skins);p.skins.push(id);got.push({kind:'skin',id,txt:SKIN_NAME[id]+' skin',sub:'Forever'});}else refund+=B.refund;
    if(titles.length){const id=pick(titles);p.titles.push(id);got.push({kind:'title',id,txt:'“'+TITLE_NAME[id]+'” title',sub:'Forever'});}else refund+=B.refund;
  }
  if(refund){p.gp+=refund;got.push({kind:'gp',txt:'+'+refund+' GP',sub:'for parts you already own'});}
  const T={rookie:'rcollect',veteran:'vcollect',elite:'ecollect'};
  for(const bk in T){const all=WORDER.filter(id=>id!=='ak47'&&id!=='p9'&&id!=='rpg'&&gunClass(id)===BOXES[bk].cls);
    if(all.length&&all.every(id=>p.owned.indexOf(id)>=0&&!rentInfo(p,'gun',id))){if(p.titles.indexOf(T[bk])<0)p.titles.push(T[bk]);if(bk==='elite'&&p.cards.indexOf('collector')<0)p.cards.push('collector');}}
  return ok(p,{got,spent:B.price});
}

function rollDay(p,ctx,silent){
  const U=utc(ctx.now);
  let fresh=false;
  if(!p.daily||p.daily.date!==U.day){
    const r=rngOf([...U.day].reduce((a,c)=>a*31+c.charCodeAt(0),7));
    const pool=CHALLENGES.map(c=>c.id),pick=[];
    while(pick.length<3)pick.push(pool.splice((r()*pool.length)|0,1)[0]);
    const prev=p.login||{last:'',streak:0};
    const y=new Date(ctx.now-864e5),ys=`${y.getUTCFullYear()}-${y.getUTCMonth()+1}-${y.getUTCDate()}`;
    p.login={last:U.day,streak:prev.last===ys?(prev.streak|0)+1:1};
    p.daily={date:U.day,dn:U.dayNum,list:pick.map(id=>({id,p:0,done:false})),freeCrate:true,at:ctx.now};
    fresh=true;
  }
  const w=U.week;
  if(!p.weekly||p.weekly.w!==w||!Array.isArray(p.weekly.list)||p.weekly.list.length!==3){
    const r=rngOf(w*7919+13),pool=WEEKLY.map(c=>c.id),pick=[];
    while(pick.length<3)pick.push(pool.splice((r()*pool.length)|0,1)[0]);
    p.weekly={w,list:pick.map(id=>({id,p:0,c:0})),big:0};
  }
  if(!p.cal||p.cal.m!==U.month)p.cal={m:U.month,n:0,last:''};
  const sid=U.month;
  if(!p.season||p.season.id!==sid||!Array.isArray(p.season.got))p.season={id:sid,xp:0,got:[]};
  return fresh;
}
function rollDayOp(data,ctx){const p=normalize(clone(data));const fresh=rollDay(p,ctx);return ok(p,{fresh});}

function progress(data,ctx,a){
  const p=normalize(clone(data));
  rollDay(p,ctx,true);
  const id=String(a.id||a.p_id||''),n=clamp(a.n|a.p_n|0,0,500);
  if(!n)return fail('n');
  let granted=0;
  const dly=CHALLENGES.filter(c=>c.id===id)[0];
  const row=(p.daily.list||[]).filter(c=>c.id===id)[0];
  if(dly&&row&&!row.done){
    row.p=Math.min(dly.goal,(row.p|0)+n);
    if(row.p>=dly.goal){row.done=true;p.gp+=dly.gp;granted+=dly.gp;}
  }
  const wk=WEEKLY.filter(c=>c.id===id)[0];
  for(const c of p.weekly.list)if(c.id===id&&wk)c.p=Math.min(wk.goal,(c.p|0)+n);
  return ok(p,{granted});
}
function claimWeekly(data,ctx,a){
  const p=normalize(clone(data));
  rollDay(p,ctx,true);
  const i=a.index|a.p_index|0,c=p.weekly.list[i];
  if(!c||c.c)return fail('claimed');
  const d=WEEKLY.filter(x=>x.id===c.id)[0];
  if(!d||c.p<d.goal)return fail('progress');
  c.c=1;p.gp+=WEEK_GP;
  return ok(p,{gp:WEEK_GP});
}
function claimWeeklyBig(data,ctx,a,rand){
  const p=normalize(clone(data));
  rand=rand||Math.random;
  rollDay(p,ctx,true);
  if(p.weekly.big||!p.weekly.list.every(c=>c.c))return fail('progress');
  p.weekly.big=1;
  const pool=[];
  for(const k in BOXES){
    for(const id in BOX_CAMOS)if(BOX_CAMOS[id][1]===k&&p.camos.indexOf(id)<0)pool.push({kind:'camo',v:id,n:BOX_CAMOS[id][0]+' camo'});
    for(const id in BOX_FX)if(BOX_FX[id][0]===k&&p.killfxs.indexOf(id)<0)pool.push({kind:'fx',v:id,n:FX_NAME[id]+' kill effect'});
    for(const id in BOX_CARDS)if(BOX_CARDS[id][0]===k&&p.cards.indexOf(id)<0)pool.push({kind:'card',v:id,n:CARD_NAME[id]+' banner'});
    for(const id in CHARMS)if(CHARMS[id][1]===k&&p.charms.indexOf(id)<0)pool.push({kind:'charm',v:id,n:CHARMS[id][0]+' charm'});
  }
  let lab;
  if(pool.length){const x=pool[Math.floor(rand()*pool.length)];give(p,{kind:x.kind,v:x.v,tier:4,dupe:false});lab=x.n;}
  else{p.keys+=3;lab='3 free crates';}
  return ok(p,{label:lab});
}

function cosmeticPrize(p,k,v,salt){
  if(k==='gp')return {kind:'gp',v,label:v+' GP',tier:0};
  if(k==='key')return {kind:'key',v,label:v+' free crate'+(v>1?'s':''),tier:Math.min(4,v)};
  const P=cratePool(p,v).filter(it=>it.kind===k&&!it.dupe);
  if(!P.length)return {kind:'gp',v:DUPE_GP[v]*2,label:(DUPE_GP[v]*2)+' GP',tier:v,was:k};
  return Object.assign({},P[hashPick(salt,0,P.length)],{tier:v});
}
function claimCalendar(data,ctx){
  const p=normalize(clone(data));
  rollDay(p,ctx,true);
  const U=utc(ctx.now);
  if(p.cal.last===U.day||(p.cal.n|0)>=U.dim)return fail('claimed');
  const w=cosmeticPrize(p,CAL[p.cal.n][0],CAL[p.cal.n][1],(p.cal.m||'')+'#'+(p.cal.n+7));
  if(w.kind==='key')p.keys+=w.v;else give(p,w);
  p.cal.n++;p.cal.last=U.day;
  return ok(p,{prize:w});
}
function claimSeason(data,ctx,a){
  const p=normalize(clone(data));
  rollDay(p,ctx,true);
  const i=a.index|a.p_index|0;
  if(i<0||i>=30)return fail('tier');
  const tier=Math.min(30,Math.floor((p.season.xp||0)/2000));
  if(i>=tier)return fail('locked');
  if(p.season.got.indexOf(i)>=0)return fail('claimed');
  const spec=SEA[i]||['gp',1000];
  const w=cosmeticPrize(p,spec[0],spec[1],(p.season.id||'')+'#'+(i*13+5));
  if(w.kind==='key')p.keys+=w.v;else give(p,w);
  p.season.got.push(i);
  return ok(p,{prize:w});
}
function tutorial(data){
  const p=normalize(clone(data));
  if(p.tutPaid)return ok(p,{already:true});
  p.tutPaid=true;p.gp+=TUT_GP;
  return ok(p,{gp:TUT_GP});
}
function friendBonus(data,a){
  const p=normalize(clone(data));
  const tag=String(a.tag||a.p_tag||'').replace(/[^\w ._-]/g,'').slice(0,24);
  if(tag.length<2)return fail('tag');
  if(!Array.isArray(p.refBonus))p.refBonus=[];
  if(p.refBonus.indexOf(tag)>=0)return ok(p,{already:true});
  if(p.refBonus.length>=REF_MAX)return fail('cap');
  p.refBonus.push(tag);p.gp+=REF_GP;p.keys+=1;
  return ok(p,{gp:REF_GP,keys:1});
}
const BADSUB=['fuck','fuk','shit','cunt','nigg','nigr','faggot','bitch','whore','slut','porn','penis','vagina','pussy','hitler','nazi','retard','twat','wank','jizz','rapist','molest','pedophil','kkk','asshole','bastard','motherf','dildo','boob','tits','sharmuta','benzona','kusemek','kusemak','kusomo'];
const BADWORD=['fag','rape','cock','dick','anal','cum','sex','ass','zona','kus','homo','isis'];
const RESSUB=['admin','moderator','gamemaster','cubefront','blockfire','official'],RESWORD=['gm','mod','mods','dev','devs','staff','support','owner','system','server'];
function nameBad(n){
  const s=String(n||'').toLowerCase().replace(/[013457@$!|]/g,c=>({0:'o',1:'i',3:'e',4:'a',5:'s',7:'t','@':'a','$':'s','!':'i','|':'i'}[c]));
  const flat=s.replace(/[^a-z]/g,'');
  if(BADSUB.concat(RESSUB).some(w=>flat.includes(w)))return true;
  return s.split(/[^a-z]+/).concat([flat]).some(t=>BADWORD.indexOf(t)>=0||RESWORD.indexOf(t)>=0);
}
function rename(data,a){
  const p=normalize(clone(data));
  let v=String(a.name||a.p_name||'').replace(/[^\w \-.]/g,'').trim().replace(/\s+/g,' ').slice(0,14);
  if(v.length<3)return fail('name');
  if(nameBad(v))return fail('name');
  if(v.toLowerCase()===String(p.name||'').toLowerCase())return fail('same');
  if((p.gp|0)<RENAME_GP)return fail('gp');
  p.gp-=RENAME_GP;p.name=v;
  return ok(p,{name:v,spent:RENAME_GP});
}

function apply(fn,data,ctx,args,rand){
  args=args||{};ctx=ctx||freshCtx(Date.now());
  if(fn==='match')return matchReward(data,ctx,args);
  if(fn==='rank')return rankUpdate(data,ctx,args);
  if(fn==='crate')return openCrate(data,ctx,args,rand);
  if(fn==='buy')return buy(data,ctx,args);
  if(fn==='sell')return sell(data,ctx,args);
  if(fn==='upgrade')return upgrade(data,ctx,args);
  if(fn==='box')return openBox(data,ctx,args,rand);
  if(fn==='roll')return rollDayOp(data,ctx);
  if(fn==='progress')return progress(data,ctx,args);
  if(fn==='weekly')return claimWeekly(data,ctx,args);
  if(fn==='weekly_big')return claimWeeklyBig(data,ctx,args,rand);
  if(fn==='calendar')return claimCalendar(data,ctx);
  if(fn==='season')return claimSeason(data,ctx,args);
  if(fn==='tutorial')return tutorial(data);
  if(fn==='friend')return friendBonus(data,args);
  if(fn==='rename')return rename(data,args);
  return fail('fn');
}

module.exports={ECON_KEYS,CAP,apply,protect,slice,normalize,blank,gunPrice,levelOf,WORDER,costOf,dealOf,CRATE_PRICE,RENAME_GP,freshCtx,utc,GUN_REQ};
