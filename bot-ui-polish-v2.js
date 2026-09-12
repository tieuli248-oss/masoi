const http = require('http');

// Test UI only. Visual/DOM polish; no game rules or socket actions are changed.
const previousEnd = http.ServerResponse.prototype.end;

const PATCH = String.raw`
<style id="masoi-bot-ui-polish-v2">
  /* Keep only the wolf already present in the real page title. */
  .header::before{content:none!important;display:none!important}
  .header{padding-left:0!important}

  /* The old standalone role-composition card is merged into another card by JS. */
  #lobbyScreen .msMergedRoleSource{display:none!important}
  .msMergedRoleSection{
    margin:12px 0 14px;
    padding:13px 14px;
    border:1px solid rgba(127,111,255,.28);
    border-radius:14px;
    background:linear-gradient(135deg,rgba(8,11,31,.72),rgba(17,15,43,.62));
  }
  .msMergedRoleSection .msMergedRoleTitle{
    font-size:15px;
    font-weight:900;
    margin:0 0 10px;
    color:#f5f2ff;
  }
  .msMergedRoleSection #lobbyRoleComposition{margin:0!important}

  /* Compact lobby after the role card is merged. */
  #lobbyScreen.msHostLobbyMerged>#testModeCard{
    grid-column:2!important;
    grid-row:1 / span 3!important;
    margin:0!important;
    align-self:start;
  }
  #lobbyScreen.msHostLobbyMerged>.card:nth-child(1){grid-column:1!important;grid-row:1!important}
  #lobbyScreen.msHostLobbyMerged>.card:nth-child(2){grid-column:1!important;grid-row:2!important}
  #lobbyScreen.msHostLobbyMerged>.card:nth-child(3){grid-column:1!important;grid-row:3!important}
  #lobbyScreen.msHostLobbyMerged>.card:nth-child(5){grid-column:1!important;grid-row:4!important}
  #lobbyScreen.msHostLobbyMerged>.card:nth-child(6){grid-column:2!important;grid-row:4!important}

  #lobbyScreen.msPlayerLobbyMerged>.card:nth-child(1){grid-column:1!important;grid-row:1!important}
  #lobbyScreen.msPlayerLobbyMerged>.card:nth-child(2){grid-column:1!important;grid-row:2!important}
  #lobbyScreen.msPlayerLobbyMerged>.card:nth-child(3){grid-column:1!important;grid-row:3!important}
  #lobbyScreen.msPlayerLobbyMerged>.card:nth-child(5){grid-column:2!important;grid-row:1!important}
  #lobbyScreen.msPlayerLobbyMerged>.card:nth-child(6){grid-column:2!important;grid-row:2 / span 3!important}

  /* Wolf marker is stable; unlike the old script it is not removed/re-added on a timer. */
  .testWolfPrivateMarker{
    display:inline-block;
    margin-right:4px;
    font-size:13px;
    line-height:1;
    vertical-align:baseline;
  }

  @media(max-width:760px){
    #lobbyScreen.msHostLobbyMerged,
    #lobbyScreen.msPlayerLobbyMerged{display:block!important}
    #lobbyScreen.msHostLobbyMerged>* ,
    #lobbyScreen.msPlayerLobbyMerged>*{margin-bottom:14px!important}
    #lobbyScreen.msHostLobbyMerged>#testModeCard{margin-bottom:14px!important}
  }
</style>
<script>
(function(){
  let viewerIsWolf=false;
  let wolfNames=new Set();
  let boundSocket=null;
  let observer=null;
  let scheduled=false;

  const cleanBotName=v=>String(v||'').replace(/🤖\s*(Bot\s*0*\d+)/gi,'$1');
  const norm=v=>cleanBotName(v).replace(/\s*[•·]\s*(Bạn|Host)\s*$/i,'').replace(/\s+/g,' ').trim();

  function isHostNow(){
    try{return typeof isHost!=='undefined'&&!!isHost}catch(e){return false}
  }
  function gameStarted(){
    try{return typeof room!=='undefined'&&!!room?.started}catch(e){return false}
  }

  function mergeLobbyRoleCard(){
    const lobby=document.getElementById('lobbyScreen');
    const roleBox=document.getElementById('lobbyRoleComposition');
    const testCard=document.getElementById('testModeCard');
    const readyHint=document.getElementById('readyHint');
    if(!lobby||!roleBox||!readyHint)return;

    const sourceCard=roleBox.closest('.card');
    const readyCard=readyHint.closest('.card');
    if(!sourceCard||!readyCard)return;
    sourceCard.classList.add('msMergedRoleSource');

    let section=document.getElementById('msMergedRoleSection');
    if(!section){
      section=document.createElement('div');
      section.id='msMergedRoleSection';
      section.className='msMergedRoleSection';
      const title=document.createElement('div');
      title.className='msMergedRoleTitle';
      title.textContent='🎭 Chức năng trong ván';
      section.appendChild(title);
      section.appendChild(roleBox);
    }

    const host=isHostNow();
    const target=host&&testCard?testCard:readyCard;
    if(section.parentElement!==target){
      if(host&&testCard){
        const notice=testCard.querySelector('.notice');
        if(notice&&notice.nextSibling) testCard.insertBefore(section,notice.nextSibling);
        else testCard.insertBefore(section,testCard.firstChild?.nextSibling||null);
      }else{
        target.insertBefore(section,readyHint);
      }
    }

    lobby.classList.toggle('msHostLobbyMerged',host&&!!testCard);
    lobby.classList.toggle('msPlayerLobbyMerged',!host||!testCard);
  }

  function stripBotIcons(root=document){
    const scope=root&&root.nodeType===1?root:document;
    const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      const before=String(node.nodeValue||'');
      if(!/🤖\s*Bot\s*0*\d+/i.test(before))continue;
      const after=cleanBotName(before);
      if(after!==before)node.nodeValue=after;
    }
  }

  function looksLikePlayerCard(node){
    let cur=node?.parentElement||null;
    for(let d=0;cur&&d<7;d++,cur=cur.parentElement){
      const text=String(cur.innerText||'').replace(/\s+/g,' ').trim();
      if(text.length>280)continue;
      if(/BOX CHAT|Thảo Luận Ban Ngày|Chức năng trong ván/i.test(text))continue;
      if(/Còn sống|Đã chết|Đã rời|Online|Offline/i.test(text))return true;
    }
    return false;
  }

  function findPlayerNameNode(name){
    const root=document.getElementById('gameScreen');
    if(!root)return null;
    const wanted=norm(name);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(norm(node.nodeValue)!==wanted)continue;
      if(!looksLikePlayerCard(node))continue;
      return node;
    }
    return null;
  }

  function syncWolfMarkers(){
    const root=document.getElementById('gameScreen');
    if(!root)return;
    if(!gameStarted()||!viewerIsWolf){
      root.querySelectorAll('.testWolfPrivateMarker').forEach(x=>x.remove());
      return;
    }

    for(const raw of wolfNames){
      const node=findPlayerNameNode(raw);
      if(!node||!node.parentElement)continue;
      const prev=node.previousSibling;
      if(prev&&prev.nodeType===1&&prev.classList?.contains('testWolfPrivateMarker'))continue;
      const mark=document.createElement('span');
      mark.className='testWolfPrivateMarker';
      mark.textContent='🐺';
      mark.title='Đồng đội Sói';
      node.parentElement.insertBefore(mark,node);
    }

    root.querySelectorAll('.testWolfPrivateMarker').forEach(mark=>{
      const next=mark.nextSibling;
      if(!next||next.nodeType!==3||!wolfNames.has(norm(next.nodeValue)))mark.remove();
    });
  }

  function flush(){
    scheduled=false;
    stripBotIcons(document.getElementById('gameScreen')||document);
    mergeLobbyRoleCard();
    syncWolfMarkers();
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(flush);
  }

  function handleWolfData(d){
    viewerIsWolf=!!d?.isWolf;
    wolfNames=new Set((d?.wolves||[]).map(x=>norm(x?.name)).filter(Boolean));
    try{
      sessionStorage.setItem('masoi_test_viewer_is_wolf',viewerIsWolf?'1':'0');
      sessionStorage.setItem('masoi_test_wolf_names',JSON.stringify([...wolfNames]));
    }catch(e){}
    schedule();
  }
  function clearWolfData(){
    viewerIsWolf=false;wolfNames.clear();
    try{
      sessionStorage.removeItem('masoi_test_viewer_is_wolf');
      sessionStorage.removeItem('masoi_test_wolf_names');
    }catch(e){}
    schedule();
  }
  function loadWolfData(){
    try{
      viewerIsWolf=sessionStorage.getItem('masoi_test_viewer_is_wolf')==='1';
      const arr=JSON.parse(sessionStorage.getItem('masoi_test_wolf_names')||'[]');
      if(Array.isArray(arr))wolfNames=new Set(arr.map(norm).filter(Boolean));
    }catch(e){}
  }

  function bindSocket(){
    try{
      if(typeof socket==='undefined'||!socket||boundSocket===socket)return;
      boundSocket=socket;
      socket.on('testWolfIdentityMarkers',handleWolfData);
      socket.on('gameEnded',clearWolfData);
      socket.on('testStopped',clearWolfData);
      ['playersUpdated','roomState','phaseChanged','enteredGame'].forEach(ev=>socket.on(ev,schedule));
    }catch(e){}
  }

  function bindObserver(){
    if(observer)return;
    observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  }

  loadWolfData();
  document.addEventListener('DOMContentLoaded',()=>{bindObserver();bindSocket();flush()});
  setInterval(()=>{bindSocket();schedule()},900);
})();
</script>
`;

http.ServerResponse.prototype.end=function(chunk,encoding,cb){
  try{
    if(typeof chunk==='string'&&chunk.includes('</body>')&&chunk.includes('Ma Sói')){
      chunk=chunk.replace('</body>',PATCH+'\n</body>');
    }
  }catch(e){}
  return previousEnd.call(this,chunk,encoding,cb);
};
