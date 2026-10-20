// minimal stand-in for Supabase auth + one REST table, enough for the game's calls
const http=require('http'),crypto=require('crypto');
const users={},rows={},tokens={},refresh={};let log=[];const support=[],errors=[],rooms=new Map();let config=[{key:'min_version',value:'1.0.0'},{key:'motd',value:''},{key:'features',value:{building:true,crates:true,multiplayer:true}}];
const tok=uid=>{const at='at_'+crypto.randomBytes(8).toString('hex'),rt='rt_'+crypto.randomBytes(8).toString('hex');tokens[at]=uid;refresh[rt]=uid;return{access_token:at,refresh_token:rt,expires_in:+(process.env.EXP||3600),user:{id:uid}};};
http.createServer((q,s)=>{let b='';q.on('data',d=>b+=d);q.on('end',()=>{
  const H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*','Content-Type':'application/json'};
  if(q.method==='OPTIONS'){s.writeHead(204,H);return s.end();}
  const u=new URL(q.url,'http://x');let j={};try{j=b?JSON.parse(b):{};}catch(e){}
  const send=(c,o)=>{s.writeHead(c,H);s.end(o===undefined?'':JSON.stringify(o));};
  if(q.headers.apikey!=='anon-key')return send(401,{message:'No API key found in request'});
  log.push(q.method+' '+u.pathname+u.search);
  if(u.pathname==='/__log')return send(200,{log,rows,users,support,errors});
  if(u.pathname==='/__config'){config=j;return send(200,{});}
  if(u.pathname==='/rest/v1/app_config')return send(200,config);
  if(u.pathname==='/rest/v1/support_messages'){if(!j.message||j.message.length<5)return send(400,{});support.push(j);return send(201);}
  if(u.pathname==='/rest/v1/client_errors'){errors.push(j);return send(201);}
  if(u.pathname==='/functions/v1/delete-account'){const id=tokens[(q.headers.authorization||'').replace('Bearer ','')];if(!id)return send(401,{error:'login'});if(j.confirm!=='DELETE')return send(400,{error:'confirm'});delete users[id];delete rows[id];return send(200,{ok:true});}
  if(u.pathname==='/__revoke'){for(const k in refresh)delete refresh[k];for(const k in tokens)delete tokens[k];return send(200,{});}
  if(u.pathname==='/functions/v1/guest'){const name='Guest-'+String(Math.floor(Math.random()*9e5+1e5)),password=crypto.randomBytes(14).toString('hex');
    users[crypto.randomUUID()]={email:name.toLowerCase()+'@players.blockfire.game',pw:password,guest:true};return send(200,{name,password});}
  if(u.pathname==='/functions/v1/claim'){const id=tokens[(q.headers.authorization||'').replace('Bearer ','')];if(!id)return send(401,{error:'login'});if(!users[id].guest)return send(403,{error:'not_guest'});
    const n=String(j.name||'').trim(),k=n.toLowerCase().replace(/\s+/g,'');if(!/^[A-Za-z0-9_ .-]{2,14}$/.test(n)||k==='player'||k.startsWith('guest'))return send(400,{error:'bad_name'});
    if((j.password||'').length<6)return send(400,{error:'bad_password'});const email=k.replace(/[^a-z0-9._-]/g,'_')+'@players.blockfire.game';
    if(Object.entries(users).some(([i,x])=>i!==id&&x.email===email))return send(409,{error:'taken'});
    Object.assign(users[id],{email,pw:j.password,guest:false});if(rows[id])rows[id].name=n;return send(200,{ok:true,name:n});}
  if(u.pathname==='/functions/v1/signup'){const n=String(j.name||'').trim();if(!/^[A-Za-z0-9_ .-]{2,14}$/.test(n))return send(400,{error:'bad_name'});if((j.password||'').length<6)return send(400,{error:'bad_password'});
    const email=n.toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9._-]/g,'_')+'@players.blockfire.game';if(Object.values(users).some(x=>x.email===email))return send(409,{error:'taken'});
    users[crypto.randomUUID()]={email,pw:j.password};return send(200,{ok:true});}
  if(u.pathname==='/auth/v1/signup'){if(Object.values(users).some(x=>x.email===j.email))return send(422,{code:422,error_code:'user_already_exists',msg:'User already registered'});
    if((j.password||'').length<6)return send(422,{msg:'Password should be at least 6 characters.'});
    const id=crypto.randomUUID();users[id]={email:j.email,pw:j.password};return send(200,tok(id));}
  if(u.pathname==='/auth/v1/token'){const g=u.searchParams.get('grant_type');
    if(g==='password'){const id=Object.keys(users).find(k=>users[k].email===j.email&&users[k].pw===j.password);if(!id)return send(400,{error:'invalid_grant',error_description:'Invalid login credentials'});return send(200,tok(id));}
    if(g==='refresh_token'){const id=refresh[j.refresh_token];if(!id)return send(400,{error:'invalid_grant'});delete refresh[j.refresh_token];return send(200,tok(id));}}
  const uid=tokens[(q.headers.authorization||'').replace('Bearer ','')];
  if(u.pathname==='/rest/v1/players'){if(!uid)return send(401,{message:'JWT expired'});
    if(q.method==='GET'){const id=(u.searchParams.get('id')||'').replace('eq.','');return send(200,id===uid&&rows[id]?[rows[id]]:[]);}
    if(q.method==='POST'){if(j.id!==uid)return send(403,{message:'row-level security'});rows[uid]={name:j.name,data:j.data,updated_at:j.updated_at};return send(201,/representation/.test(q.headers.prefer||'')?[rows[uid]]:undefined);}
    if(q.method==='PATCH'){const id=(u.searchParams.get('id')||'').replace('eq.',''),v=(u.searchParams.get('updated_at')||'').replace('eq.','');
      if(id!==uid||!rows[id]||(v&&rows[id].updated_at!==v))return send(200,[]);Object.assign(rows[id],j);return send(200,[rows[id]]);}}
  if(u.pathname==='/rest/v1/rpc/room_upsert2'||u.pathname==='/rest/v1/rpc/room_upsert'){if(!uid)return send(401,{message:'JWT expired'});
    const code=String(j.p_code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    rooms.set(uid,{code,host_name:String(j.p_host_name||'').slice(0,20),mode:String(j.p_mode||'').slice(0,24),map:String(j.p_map||'').slice(0,24),players:j.p_players|0,max:j.p_max|0,locked:!!j.p_locked,state:String(j.p_state||'lobby'),proto:j.p_proto|0,progress:j.p_progress|0,updated_at:new Date().toISOString()});
    return send(200,null);}
  if(u.pathname==='/rest/v1/rpc/room_remove'){if(!uid)return send(401,{message:'JWT expired'});rooms.delete(uid);return send(200,null);}
  if(u.pathname==='/rest/v1/rooms'&&q.method==='GET'){const proto=(u.searchParams.get('proto')||'').replace(/^eq\./,'');
    const list=[...rooms.values()].filter(r=>!proto||String(r.proto)===String(proto)).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,50);
    return send(200,list.map(r=>({code:r.code,host_name:r.host_name,mode:r.mode,map:r.map,players:r.players,max:r.max,locked:r.locked,state:r.state,progress:r.progress})));}
  send(404,{message:'not found'});});}).listen(54321,'127.0.0.1',()=>console.log('supa up'));
