const http = require('http');

// Test UI only:
// 1) Remove the decorative 🤖 icon from Bot display names.
// 2) If the current real player is a Wolf, show 🐺 before every Wolf name in
//    the player-card area. Non-Wolves never receive the wolf list from server.
const previousEnd = http.ServerResponse.prototype.end;

const PATCH = String.raw`
<style>
  .testWolfPrivateMarker{
    display:inline-block;
    margin-right:4px;
    font-size:13px;
    line-height:1;
    vertical-align:baseline;
  }
</style>
<script>
(function(){
  let viewerIsWolf = false;
  let wolfNames = new Set();
  let boundSocket = null;

  function gameRoot(){
    return document.getElementById('gameScreen') || document.body;
  }

  function started(){
    try { return typeof room !== 'undefined' && !!room?.started; }
    catch(e){ return false; }
  }

  function cleanBotName(value){
    return String(value || '')
      .replace(/🤖\s*(Bot\s*0*\d+)/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanCardName(value){
    return cleanBotName(value)
      .replace(/\s*[•·]\s*Bạn\s*$/i, '')
      .replace(/\s*[•·]\s*Host\s*$/i, '')
      .trim();
  }

  function stripBotIcons(){
    const root = gameRoot();
    if(!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while((node = walker.nextNode())){
      const before = String(node.nodeValue || '');
      if(!/🤖\s*Bot\s*0*\d+/i.test(before)) continue;
      node.nodeValue = before.replace(/🤖\s*(Bot\s*0*\d+)/gi, '$1');
    }
  }

  function clearWolfMarkers(){
    document.querySelectorAll('.testWolfPrivateMarker').forEach(el => el.remove());
  }

  function looksLikePlayerCard(node){
    let cur = node?.parentElement || null;
    for(let depth=0; cur && depth<7; depth++, cur=cur.parentElement){
      const text = String(cur.innerText || '').replace(/\s+/g,' ').trim();
      if(text.length > 260) continue;
      if(/BOX CHAT|Thảo Luận Ban Ngày|Chức năng trong ván/i.test(text)) continue;
      if(/Còn sống|Đã chết|Đã rời|Online|Offline/i.test(text)) return true;
    }
    return false;
  }

  function findPlayerCardNameNode(name){
    const root = gameRoot();
    if(!root) return null;
    const wanted = cleanCardName(name);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while((node = walker.nextNode())){
      const text = cleanCardName(node.nodeValue);
      if(!text) continue;
      if(text !== wanted) continue;
      if(!looksLikePlayerCard(node)) continue;
      return node;
    }
    return null;
  }

  function decorateWolfCards(){
    clearWolfMarkers();
    if(!started() || !viewerIsWolf || !wolfNames.size) return;

    for(const rawName of wolfNames){
      const node = findPlayerCardNameNode(rawName);
      if(!node || !node.parentElement) continue;
      const marker = document.createElement('span');
      marker.className = 'testWolfPrivateMarker';
      marker.textContent = '🐺';
      marker.title = 'Đồng đội Sói';
      node.parentElement.insertBefore(marker, node);
    }
  }

  function handleWolfMarkers(data){
    viewerIsWolf = !!data?.isWolf;
    wolfNames = new Set((data?.wolves || []).map(x => cleanCardName(x?.name)).filter(Boolean));
    try{
      sessionStorage.setItem('masoi_test_viewer_is_wolf', viewerIsWolf ? '1' : '0');
      sessionStorage.setItem('masoi_test_wolf_names', JSON.stringify([...wolfNames]));
    }catch(e){}
    setTimeout(decorateWolfCards, 0);
    setTimeout(decorateWolfCards, 120);
  }

  function loadSaved(){
    try{
      viewerIsWolf = sessionStorage.getItem('masoi_test_viewer_is_wolf') === '1';
      const arr = JSON.parse(sessionStorage.getItem('masoi_test_wolf_names') || '[]');
      if(Array.isArray(arr)) wolfNames = new Set(arr.map(cleanCardName).filter(Boolean));
    }catch(e){}
  }

  function clearSaved(){
    viewerIsWolf = false;
    wolfNames.clear();
    clearWolfMarkers();
    try{
      sessionStorage.removeItem('masoi_test_viewer_is_wolf');
      sessionStorage.removeItem('masoi_test_wolf_names');
    }catch(e){}
  }

  function bindSocket(){
    try{
      if(typeof socket === 'undefined' || !socket) return;
      if(boundSocket === socket) return;
      boundSocket = socket;
      socket.on('testWolfIdentityMarkers', handleWolfMarkers);
      socket.on('gameEnded', clearSaved);
      socket.on('testStopped', clearSaved);
    }catch(e){}
  }

  function tick(){
    bindSocket();
    stripBotIcons();
    decorateWolfCards();
  }

  loadSaved();
  document.addEventListener('DOMContentLoaded', tick);
  setInterval(tick, 180);
})();
</script>
`;

http.ServerResponse.prototype.end = function(chunk, encoding, cb){
  try{
    if(typeof chunk === 'string' && chunk.includes('</body>') && chunk.includes('Ma Sói')){
      chunk = chunk.replace('</body>', PATCH + '\n</body>');
    }
  }catch(e){}
  return previousEnd.call(this, chunk, encoding, cb);
};
