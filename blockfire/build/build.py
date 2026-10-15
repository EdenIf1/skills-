"""Build the standalone game page from the single-file source.
usage: python3 build.py SRC OUT_DIR_OR_FILE [--native]
  web:    local engine files, local fonts, offline service worker (GitHub Pages, itch.io, tests)
  native: the same page for the iPhone app (Capacitor); no service worker, the app bundles everything
Copies engine, fonts, icons and legal pages next to the page when OUT is a directory."""
import sys,os,shutil
src_path,out=sys.argv[1],sys.argv[2];native='--native' in sys.argv
D0=os.path.dirname(os.path.abspath(__file__));A=os.path.join(D0,'assets') if os.path.isdir(os.path.join(D0,'assets')) else os.path.join(D0,'build-assets')
src=open(src_path).read()
GF=['<link rel="preconnect" href="https://fonts.googleapis.com">','<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>']
for g in GF:src=src.replace(g+'\n','').replace(g,'')
i=src.index('<link rel="stylesheet" href="https://fonts.googleapis.com');j=src.index('>',i)+1
src=src[:i]+'<link rel="stylesheet" href="fonts.css">'+src[j:]
head_end=src.index('</style>')+len('</style>')
T3='<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
PJ='<script src="https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js"></script>'
head=src[:head_end].replace(T3,'').replace(PJ,'')
body=src[head_end:].replace(T3,'<script src="three.min.js"></script>').replace(PJ,'<script src="peerjs.min.js"></script>')
meta='''<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#0d1116">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Cubefront">
<meta name="format-detection" content="telephone=no">
<meta name="description" content="Blocky team shooter: build cover, team up with friends, 12v12 Warzone, zombies, crates and a full store.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
'''
# a browser security policy (web and iPhone app). Scripts only from the game's own files plus the exact inline scripts
# of this build (by hash): injected markup can never run code, inline event handlers are refused. No plugins, no forms
# posting elsewhere, no changing the page's base address. Network: the game's servers over https/wss.
CSP_TPL='<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' __HASHES__ \'unsafe-eval\'; script-src-attr \'none\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\' data:; media-src \'self\' data: blob:; connect-src \'self\' https: wss: data: blob: http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*; worker-src \'self\' blob:; manifest-src \'self\'; object-src \'none\'; base-uri \'self\'; form-action \'none\'; frame-src \'none\'">\n<meta name="referrer" content="no-referrer">\n'
csp='__CSP__'
sw='' if native else '<script>if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"))navigator.serviceWorker.register("sw.js").catch(function(){});</script>\n'
html='<!doctype html>\n<html lang="en">\n<head>\n'+csp+meta+head+'\n</head>\n<body>\n'+body+'\n'+sw+'</body>\n</html>\n'
if out.endswith('.html'):
    page,d=out,os.path.dirname(out)
else:
    # web: the game is play.html; index.html is the small frame that keeps it landscape on phones (wrap.html/wrap.js).
    # The iPhone app (--native) is landscape by itself and opens the game as index.html.
    os.makedirs(out,exist_ok=True);page,d=os.path.join(out,'index.html' if native else 'play.html'),out
    if not native:
        shutil.copy(os.path.join(A,'wrap.html'),os.path.join(out,'index.html'));shutil.copy(os.path.join(A,'wrap.js'),out)
html=html.replace('__BUILD_ID__',os.environ.get('BUILD','dev')[:7])
import re,hashlib,base64
hs=sorted({"'sha256-"+base64.b64encode(hashlib.sha256(m.encode()).digest()).decode()+"'" for m in re.findall(r'<script>(.*?)</script>',html,re.S)})
html=html.replace('__CSP__',CSP_TPL.replace('__HASHES__',' '.join(hs)),1)
open(page,'w').write(html)
for f in ['three.min.js','peerjs.min.js','mixer.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png','fonts.css']:
    shutil.copy(os.path.join(A,f),d)
shutil.copytree(os.path.join(A,'fonts'),os.path.join(d,'fonts'),dirs_exist_ok=True)
for f in os.listdir(os.path.join(A,'legal')):shutil.copy(os.path.join(A,'legal',f),d)
if not native:
    build=os.environ.get('BUILD','dev')
    open(os.path.join(d,'sw.js'),'w').write(open(os.path.join(A,'sw.js')).read().replace('__BUILD__',build))
