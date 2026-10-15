// Cubefront on phones and tablets: the game runs in a frame that is always landscape-shaped. Held upright, or with the
// rotation lock on, the frame is turned 90 degrees, so the whole game (menus, store, match) shows and plays sideways.
// Computers open the game page directly.
(function(){
  var touch=false;try{touch=matchMedia('(pointer: coarse)').matches||('ontouchstart' in window);}catch(e){}
  var q=location.search+location.hash;
  if(!touch){location.replace('play.html'+q);return;}
  window.__cfWrap=1;
  // an invite link (#room-CODE) goes to the game once; reloading the page later does not join again
  if(location.hash){try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}}
  var f=document.createElement('iframe');
  f.id='game';f.title='Cubefront';f.src='play.html'+q;
  f.setAttribute('allow','fullscreen; autoplay; gamepad');f.setAttribute('allowfullscreen','');f.setAttribute('scrolling','no');
  document.body.appendChild(f);
  var probe=document.getElementById('sa');
  function insets(){try{var s=getComputedStyle(probe);return [parseFloat(s.paddingTop)||0,parseFloat(s.paddingRight)||0,parseFloat(s.paddingBottom)||0,parseFloat(s.paddingLeft)||0];}catch(e){return [0,0,0,0];}}
  var last='';
  function fit(){
    var w=innerWidth,h=innerHeight,up=h>w*1.05,i=insets(),st=f.style;
    if(up){st.width=h+'px';st.height=w+'px';st.left=w+'px';st.transform='rotate(90deg)';}
    else{st.width=w+'px';st.height=h+'px';st.left='0px';st.transform='none';}
    // the phone's safe areas (notch, home bar), turned with the game: turned, the game's left edge is the screen's
    // top, its right edge the screen's bottom, its top the screen's right and its bottom the screen's left
    var g=up?[i[1],i[2],i[3],i[0]]:i;
    try{var d=f.contentDocument&&f.contentDocument.documentElement;
      if(d){d.style.setProperty('--st',g[0]+'px');d.style.setProperty('--sr',g[1]+'px');d.style.setProperty('--sb',g[2]+'px');d.style.setProperty('--sl',g[3]+'px');d.classList.toggle('turned',up);}}catch(e){}
    var k=w+'x'+h+(up?'u':'');if(k!==last){last=k;document.documentElement.classList.toggle('up',up);}
  }
  fit();
  addEventListener('resize',fit);addEventListener('orientationchange',function(){setTimeout(fit,60);setTimeout(fit,400);});
  if(window.visualViewport)visualViewport.addEventListener('resize',fit);
  f.addEventListener('load',function(){fit();try{f.contentWindow.focus();}catch(e){}});
  // Safari shows and hides its bars after load; settle the size a few times
  [300,1000,2500].forEach(function(t){setTimeout(fit,t);});
})();
