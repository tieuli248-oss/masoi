const http = require('http');

// Test UI only: hide the Host crown while a game is running.
// Lobby keeps the crown normally. MutationObserver removes re-rendered crowns
// before the next paint so the icon no longer flickers on/off during the game.
const previousEnd = http.ServerResponse.prototype.end;

const PATCH = String.raw`
<script>
(function(){
  const saved = new Map();
  let observer = null;
  let scheduled = false;

  function started(){
    try { return typeof room !== 'undefined' && !!room?.started; }
    catch(e){ return false; }
  }

  function gameRoot(){
    return document.getElementById('gameScreen') || null;
  }

  function restoreCrowns(){
    for(const [node, original] of saved){
      try{
        if(node && node.isConnected) node.nodeValue = original;
      }catch(e){}
    }
    saved.clear();
  }

  function stripCrowns(){
    scheduled = false;
    const root = gameRoot();
    if(!root) return;

    if(!started()){
      restoreCrowns();
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while((node = walker.nextNode())){
      const value = String(node.nodeValue || '');
      if(!value.includes('👑')) continue;
      if(!saved.has(node)) saved.set(node, value);
      node.nodeValue = value.replace(/👑/g, '').replace(/\s{2,}/g, ' ');
    }
  }

  function scheduleStrip(){
    if(scheduled) return;
    scheduled = true;
    queueMicrotask(stripCrowns);
  }

  function bindObserver(){
    const root = gameRoot();
    if(!root || observer) return;
    observer = new MutationObserver(scheduleStrip);
    observer.observe(root, {subtree:true, childList:true, characterData:true});
  }

  function tick(){
    bindObserver();
    stripCrowns();
  }

  document.addEventListener('DOMContentLoaded', tick);
  setInterval(tick, 120);
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
