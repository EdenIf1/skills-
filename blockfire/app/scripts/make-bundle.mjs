// Packs the game for a live update of the iPhone app:
//   node scripts/make-bundle.mjs OUT_DIR
// writes OUT_DIR/bundle-<version>.zip and OUT_DIR/update.json (version, url, sha256, minimum native app version).
// The app checks update.json on start and installs a newer bundle on the next launch (see liveUpdate() in the game).
import {execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import os from 'node:os';
const here=path.dirname(new URL(import.meta.url).pathname),root=path.resolve(here,'..','..');
const out=path.resolve(process.argv[2]||'bundle-out');fs.mkdirSync(out,{recursive:true});
const src=path.join(root,'game','cabin-fever.html'),version=(fs.readFileSync(src,'utf8').match(/const APP_VERSION='([\d.]+)'/)||[])[1];
if(!version)throw new Error('APP_VERSION not found in the game source');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bf-www-'));
execFileSync('python3',[path.join(root,'build','build.py'),src,tmp,'--native'],{stdio:'inherit'});
const zip=path.join(out,`bundle-${version}.zip`);if(fs.existsSync(zip))fs.rmSync(zip);
execFileSync('zip',['-qr','-X',zip,'.'],{cwd:tmp});
const sha=crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
// the oldest installed app that can run this bundle: the native app's own version (package.json)
const minNative=JSON.parse(fs.readFileSync(path.join(root,'app','package.json'),'utf8')).version||'1.0.0';
const url=`https://raw.githubusercontent.com/EdenIf1/skills-/gh-pages/app/bundle-${version}.zip`;
// every update is signed with the owner's private key (kept outside the repository); the app refuses anything else
const keyFile=process.env.UPDATE_KEY;if(!keyFile||!fs.existsSync(keyFile))throw new Error('UPDATE_KEY (the signing key file) is required: unsigned updates are refused by the app');
const sig=crypto.sign('sha256',Buffer.from(['cubefront-update',version,url,sha,minNative].join('|')),{key:fs.readFileSync(keyFile),dsaEncoding:'ieee-p1363'}).toString('base64');
const manifest={version,url,checksum:sha,minNative,sig,date:new Date().toISOString()};
fs.writeFileSync(path.join(out,'update.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`bundle ${version} · ${(fs.statSync(zip).size/1024).toFixed(0)} KB · sha256 ${sha.slice(0,12)}…`);
