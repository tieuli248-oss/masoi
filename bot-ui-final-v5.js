const http = require('http');

// FINAL TEST UI PATCH — visual/layout only + intro client handshake.
// Loaded FIRST in NODE_OPTIONS so this response wrapper runs LAST and wins CSS conflicts.
const previousEnd = http.ServerResponse.prototype.end;

const PATCH = String.raw`
<style id="masoi-final-v5-style">
:root{
  --ms-final-line:rgba(126,104,255,.52);
  --ms-final-panel:rgba(6,8,24,.88);
  --ms-final-panel2:rgba(11,13,34,.92);
}

/* 1–2: exactly ONE real logo + normal title */
.header:before,.header::before,.header h1:before,.header h1::before{display:none!important;content:none!important}
.header{
  padding-left:0!important;
  padding-right:58px!important;
  text-align:left!important;
  min-height:72px!important;
}
.header h1{
  display:flex!important;
  align-items:center!important;
  justify-content:flex-start!important;
  gap:10px!important;
  margin:0!important;
  width:auto!important;
  font-family:Georgia,"Times New Roman",serif!important;
  font-style:normal!important;
  font-size:clamp(30px,3.5vw,48px)!important;
  letter-spacing:0!important;
  text-transform:none!important;
  color:#fff!important;
  background:none!important;
  -webkit-background-clip:initial!important;
  background-clip:initial!important;
  filter:none!important;
  text-shadow:0 0 18px rgba(122,93,255,.38)!important;
}
.header h1 .msFinalLogo{
  width:42px!important;height:42px!important;min-width:42px!important;max-width:42px!important;
  object-fit:contain!important;border-radius:8px!important;display:block!important;
}
.header #connectionText{margin:6px 0 0 52px!important}

/* 6: sound on the RIGHT */
.soundToggle,#soundToggleBtn{
  position:fixed!important;top:12px!important;right:12px!important;left:auto!important;
  z-index:12050!important;
}

/* 10 + 12: scene backgrounds */
body.ms-final-ui{
  background-color:#050713!important;
  background-repeat:no-repeat!important;
  background-size:cover!important;
  background-position:center top!important;
  background-attachment:fixed!important;
}
body.ms-final-ui:before{
  content:""!important;display:block!important;position:fixed!important;inset:0!important;z-index:-1!important;
  pointer-events:none!important;background:linear-gradient(180deg,rgba(2,4,14,.18),rgba(2,4,14,.48) 58%,rgba(1,2,8,.72))!important;
}
body.ms-final-ui:after{display:none!important;content:none!important}
@media(min-width:801px){
  body.ms-bg-lobby{background-image:url("https://i.ibb.co/wNntnF6r/d0e3e48b-2b5b-428d-88bf-5933312be01e.png")!important}
  body.ms-bg-day{background-image:url("https://i.ibb.co/HL36M929/b3ded14e-3286-4b56-81cd-f36882f1cc96.png")!important}
  body.ms-bg-night,body.ms-bg-intro{background-image:url("https://i.ibb.co/JFtMcR1F/3f9f96d1-cee5-4d8b-b016-de1bd20905d8.png")!important}
}
@media(max-width:800px){
  body.ms-final-ui{background-attachment:scroll!important}
  body.ms-bg-lobby{background-image:url("https://i.ibb.co/mrt3WYy4/f395e364-26bc-4818-8918-a4154f1a4917.png")!important}
  body.ms-bg-day{background-image:url("https://i.ibb.co/cSTj3b7W/9924e256-9ce6-421b-a8e4-6fa53df66083.png")!important}
  body.ms-bg-night,body.ms-bg-intro{background-image:url("https://i.ibb.co/7x0VTcZF/707ddcb3-1a83-4413-a97f-4a1f4b9ab09a.png")!important}
}

/* keep panels readable over images */
.card,.statusBox{background:linear-gradient(155deg,rgba(12,15,38,.90),rgba(5,7,21,.90))!important;backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important}

/* 3: one checkbox only: TEST BOT */
#testShowAllWrap{display:flex!important;align-items:center!important;gap:9px!important;margin-top:10px!important;padding:9px 10px!important}
#testShowAllWrap .muted{display:none!important}
#testShowAllWrap span>b{font-size:13px!important}
.msFinalHiddenBotToggle{display:none!important}

/* 4: HOST lobby — setup LEFT, players/roles CENTER, chat RIGHT */
@media(min-width:901px){
  body.ms-host-lobby-v4 #lobbyScreen.msHostLobbyV4:not(.hidden),
  body.ms-final-host-lobby #lobbyScreen:not(.hidden){
    display:grid!important;
    grid-template-columns:minmax(270px,.78fr) minmax(330px,1fr) minmax(410px,1.30fr)!important;
    grid-template-areas:
      "hero hero hero"
      "setup players chat"
      "setup roles chat"!important;
    gap:14px!important;
    align-items:stretch!important;
  }
  #lobbyScreen .msHostHero{grid-area:hero!important}
  #lobbyScreen #testModeCard,.msSetupCard{grid-area:setup!important;align-self:stretch!important}
  #lobbyScreen .msPlayersCard{grid-area:players!important}
  #lobbyScreen .msRoleBarCard{grid-area:roles!important}
  #lobbyScreen .msChatCard{grid-area:chat!important;min-height:520px!important}
  #lobbyScreen .msChatCard #lobbyChatBox{min-height:390px!important;height:auto!important;flex:1!important}
}
@media(max-width:900px){
  body.ms-final-host-lobby #lobbyScreen:not(.hidden),
  body.ms-host-lobby-v4 #lobbyScreen.msHostLobbyV4:not(.hidden){display:flex!important;flex-direction:column!important;gap:10px!important}
  #lobbyScreen .msHostHero{order:1!important}
  #lobbyScreen .msPlayersCard{order:2!important}
  #lobbyScreen .msRoleBarCard{order:3!important}
  #lobbyScreen #testModeCard,.msSetupCard{order:4!important}
  #lobbyScreen .msChatCard{order:5!important}
  .header{padding-right:48px!important;min-height:60px!important}
  .header h1{font-size:28px!important;gap:7px!important}
  .header h1 .msFinalLogo{width:30px!important;height:30px!important;min-width:30px!important;max-width:30px!important}
  .header #connectionText{margin-left:37px!important;font-size:10px!important}
}

/* 7: desktop game = players full LEFT; chat + event stack RIGHT */
@media(min-width:901px){
  #gameScreen .mainGrid{
    display:grid!important;
    grid-template-columns:minmax(0,1.04fr) minmax(360px,.96fr)!important;
    gap:14px!important;align-items:stretch!important;
  }
  #gameScreen .mainGrid>div:first-child{min-width:0!important;height:100%!important}
  #gameScreen #playerActionCard{height:100%!important;margin-bottom:0!important}
  #gameScreen .mainGrid>div:nth-child(2){display:flex!important;flex-direction:column!important;gap:12px!important;min-width:0!important}
  #gameScreen #gameChatCard{margin:0!important}
  #gameScreen #gameChatCard + .card{margin:0!important}
  #gameScreen #eventLog{height:190px!important;min-height:150px!important}
}

/* 9: role composition is a compact bar */
#gameScreen>.card[style*="margin-top"]{padding:10px 13px!important;margin-top:10px!important;margin-bottom:10px!important}
#gameScreen>.card[style*="margin-top"]>.title{font-size:14px!important;margin-bottom:6px!important}
#gameRoleComposition{gap:5px!important}
#gameRoleComposition .roleChip{padding:5px 8px!important;font-size:11px!important;line-height:1.15!important}
#gameScreen>.card[style*="margin-top"]>.muted{font-size:10px!important;margin-top:5px!important}

/* 11: during vote, history remains visible + scrollable. Only composer is locked. */
.voteLocked,#gameChatCard.voteMode{opacity:1!important;filter:none!important;pointer-events:auto!important}
.voteLocked .chatBox,#gameChatCard.voteMode .chatBox,#gameChatCard.voteMode #chatBox{
  display:block!important;opacity:1!important;filter:none!important;pointer-events:auto!important;overflow-y:auto!important;
}
#gameChatCard.voteMode .row{display:flex!important;opacity:.55!important;pointer-events:none!important}
#gameChatCard.voteMode #chatInput,#gameChatCard.voteMode #chatSendBtn{
  display:block!important;visibility:visible!important;pointer-events:none!important;
}
#gameChatCard.voteMode #chatPhaseTitle,#gameChatCard.voteMode #chatTitle,#gameChatCard.voteMode #voteAlert,#gameChatCard.voteMode #chatNotice{display:block!important}

/* intro overlay */
#storyOverlay.msFinalIntro{display:flex!important;background:rgba(0,0,0,.90)!important}
#storyOverlay.msFinalIntro.hidden{display:none!important}

/* smaller game cards on mobile */
@media(max-width:800px){
  #gameScreen .mainGrid{grid-template-columns:1fr!important}
  #gameScreen #eventLog{height:160px!important}
  #gameRoleComposition .roleChip{font-size:10px!important;padding:4px 7px!important}
}
</style>
<script id="masoi-final-v5-script">
(function(){
  const INTRO_TEXT='🌙 Màn đêm dần buông xuống... dân làng chìm vào giấc ngủ, nhưng đâu đó trong bóng tối, Ma Sói đã thức giấc...';
  let introRunning=false;
  let introDoneForGame=false;
  let introTimer=null;
  let introFinishTimer=null;

  function setHeader(){
    const h=document.querySelector('.header h1');
    if(!h)return;
    if(h.dataset.msFinalHeader==='1')return;
    h.dataset.msFinalHeader='1';
    h.innerHTML='<img class="msFinalLogo" src="https://masoi15.netlify.app/images/og-image.png" alt="Logo"><span>Ma Sói Online</span>';
  }

  function cleanBotRobot(root=document){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];let n;
    while((n=walker.nextNode()))nodes.push(n);
    for(const node of nodes){
      const v=node.nodeValue||'';
      if(v.includes('🤖')&&/Bot\s*\d/i.test(v))node.nodeValue=v.replace(/🤖\s*(?=Bot\s*\d)/gi,'');
    }
  }

  function consolidateBotToggle(){
    const card=document.getElementById('testModeCard');
    const primary=document.getElementById('testShowAllBotRoles');
    const wrap=document.getElementById('testShowAllWrap');
    if(!card||!primary||!wrap)return;

    const labelText=wrap.querySelector('span');
    if(labelText && labelText.dataset.msFinalLabel!=='1'){
      labelText.dataset.msFinalLabel='1';
      labelText.innerHTML='<b>Test Bot</b>';
    }

    const extras=[];
    card.querySelectorAll('label,div').forEach(el=>{
      if(el===wrap||wrap.contains(el)||el.contains(wrap))return;
      const t=(el.textContent||'').trim();
      if(/Hiện chức năng Bot trong ván|Hiện chức năng tất cả Bot/i.test(t)){
        const cb=el.querySelector('input[type="checkbox"]');
        if(cb)extras.push({el,cb});
      }
    });
    extras.forEach(({el})=>el.classList.add('msFinalHiddenBotToggle'));

    if(primary.dataset.msFinalSync!=='1'){
      primary.dataset.msFinalSync='1';
      primary.addEventListener('change',()=>{
        extras.forEach(({cb})=>{
          if(cb.checked!==primary.checked){cb.checked=primary.checked;cb.dispatchEvent(new Event('change',{bubbles:true}));}
        });
      });
    }
  }

  function applyScreenClasses(){
    const body=document.body;if(!body)return;
    body.classList.add('ms-final-ui');
    body.classList.remove('ms-bg-lobby','ms-bg-day','ms-bg-night','ms-bg-intro','ms-final-host-lobby');
    const lobby=document.getElementById('lobbyScreen');
    const game=document.getElementById('gameScreen');
    const lobbyVisible=lobby&&!lobby.classList.contains('hidden');
    const gameVisible=game&&!game.classList.contains('hidden');
    let phase='';
    try{phase=(typeof currentPhase!=='undefined'&&currentPhase)||room?.phase||''}catch(e){try{phase=room?.phase||''}catch(_){}}
    if(lobbyVisible){
      body.classList.add('ms-bg-lobby');
      try{if(typeof isHost!=='undefined'&&isHost)body.classList.add('ms-final-host-lobby')}catch(e){}
    }else if(gameVisible){
      if(phase==='intro')body.classList.add('ms-bg-intro');
      else if(phase==='night'||phase==='witchPoison'||phase==='witchSave')body.classList.add('ms-bg-night');
      else body.classList.add('ms-bg-day');
    }
  }

  function hideExtraBotToggleByText(){
    const card=document.getElementById('testModeCard');if(!card)return;
    const primaryWrap=document.getElementById('testShowAllWrap');
    [...card.querySelectorAll('label')].forEach(label=>{
      if(label===primaryWrap)return;
      if(/Hiện chức năng Bot trong ván|Hiện chức năng tất cả Bot/i.test(label.textContent||''))label.classList.add('msFinalHiddenBotToggle');
    });
  }

  function stopLegacyStory(){
    try{
      window.playStoryTyping=function(){
        if(!introDoneForGame)runIntroStory();
      };
    }catch(e){}
  }

  function runIntroStory(){
    let phase='';
    try{phase=(typeof currentPhase!=='undefined'&&currentPhase)||room?.phase||''}catch(e){try{phase=room?.phase||''}catch(_){}}
    if(phase!=='intro'||introRunning||introDoneForGame)return;
    const overlay=document.getElementById('storyOverlay');
    const out=document.getElementById('storyTyping');
    if(!overlay||!out)return;
    introRunning=true;
    overlay.classList.remove('hidden');
    overlay.classList.add('msFinalIntro');
    out.textContent='';
    let i=0;
    if(introTimer)clearInterval(introTimer);
    introTimer=setInterval(()=>{
      i++;
      out.textContent=INTRO_TEXT.slice(0,i);
      if(i>=INTRO_TEXT.length){
        clearInterval(introTimer);introTimer=null;
        introFinishTimer=setTimeout(()=>{
          overlay.classList.add('hidden');
          introRunning=false;
          introDoneForGame=true;
          try{if(typeof isHost!=='undefined'&&isHost&&typeof socket!=='undefined')socket.emit('testIntroComplete')}catch(e){}
        },1200);
      }
    },42);
  }

  function resetIntroIfLobby(){
    const lobby=document.getElementById('lobbyScreen');
    if(lobby&&!lobby.classList.contains('hidden')){
      introDoneForGame=false;introRunning=false;
      if(introTimer){clearInterval(introTimer);introTimer=null}
      if(introFinishTimer){clearTimeout(introFinishTimer);introFinishTimer=null}
    }
  }

  function voteReadOnlyFix(){
    let voting=false;
    try{voting=((typeof currentPhase!=='undefined'&&currentPhase)||room?.phase)==='dayVote'}catch(e){}
    const input=document.getElementById('chatInput');
    const send=document.getElementById('chatSendBtn');
    const box=document.getElementById('chatBox');
    if(voting){
      if(input)input.disabled=true;
      if(send)send.disabled=true;
      if(box){box.style.display='block';box.style.pointerEvents='auto';box.style.opacity='1'}
    }
  }

  function tick(){
    setHeader();
    applyScreenClasses();
    consolidateBotToggle();
    hideExtraBotToggleByText();
    cleanBotRobot();
    resetIntroIfLobby();
    runIntroStory();
    voteReadOnlyFix();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    stopLegacyStory();tick();setTimeout(tick,150);setTimeout(tick,700);
    const mo=new MutationObserver(()=>{setTimeout(tick,0)});
    mo.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
  });

  setInterval(tick,650);
})();
</script>
`;

http.ServerResponse.prototype.end = function(chunk, encoding, callback){
  try{
    const type=String(this.getHeader?.('content-type')||'');
    if(chunk && /text\/html/i.test(type)){
      let html=Buffer.isBuffer(chunk)?chunk.toString('utf8'):String(chunk);
      if(!html.includes('masoi-final-v5-style'))html=html.replace('</body>',PATCH+'\n</body>');
      chunk=html;
      try{this.removeHeader?.('content-length')}catch(e){}
    }
  }catch(e){console.error('[FINAL UI V5]',e)}
  return previousEnd.call(this,chunk,encoding,callback);
};
