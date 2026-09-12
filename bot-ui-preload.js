const http = require('http');

const originalEnd = http.ServerResponse.prototype.end;

const OVERLAY = String.raw`
<style>
  .testBotRoleInlineV2{margin-left:6px;font-weight:900;color:#ffca66;font-size:12px;white-space:nowrap}
</style>
<script>
(function(){
  const meta = new Map();
  let show = false;
  let autoEndCleanup = false;
  let originalTestStoppedListeners = [];
  try{ show = sessionStorage.getItem('masoi_test_show_bot_roles') === '1'; }catch(e){}

  function saveMeta(){
    try{ sessionStorage.setItem('masoi_test_bot_meta', JSON.stringify([...meta.values()])); }catch(e){}
  }
  function loadMeta(){
    try{
      const arr = JSON.parse(sessionStorage.getItem('masoi_test_bot_meta')||'[]');
      if(Array.isArray(arr)) for(const p of arr) if(p&&p.name&&p.role) meta.set(p.id||p.name,p);
    }catch(e){}
  }
  loadMeta();

  function isHostNow(){
    try{ return typeof isHost!=='undefined' && !!isHost; }catch(e){ return false; }
  }
  function gameStarted(){
    try{ return typeof room!=='undefined' && !!room?.started; }catch(e){ return false; }
  }

  function clearBadges(){
    document.querySelectorAll('.testBotRoleInlineV2').forEach(el=>el.remove());
  }

  function clearBotMeta(){
    meta.clear();
    saveMeta();
    clearBadges();
  }

  function findNameParent(root, name){
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while((node = walker.nextNode())){
      const text = String(node.nodeValue||'').replace(/\s+/g,' ').trim();
      if(text === name) return node.parentElement;
    }
    return null;
  }

  function decorate(){
    clearBadges();
    if(!(show && isHostNow() && gameStarted())) return;
    const root = document.getElementById('gameScreen') || document.body;
    for(const p of meta.values()){
      if(!p?.name || !p?.role) continue;
      const nameEl = findNameParent(root,p.name);
      if(!nameEl) continue;
      const badge=document.createElement('span');
      badge.className='testBotRoleInlineV2';
      badge.textContent=' — '+p.role;
      nameEl.appendChild(badge);
    }
  }

  function syncCheckbox(){
    const cb=document.getElementById('testShowAllBotRoles');
    if(!cb) return;
    cb.checked=show;
    if(!cb.dataset.overlayV2){
      cb.dataset.overlayV2='1';
      cb.addEventListener('change',()=>{
        show=!!cb.checked;
        try{sessionStorage.setItem('masoi_test_show_bot_roles',show?'1':'0');}catch(e){}
        setTimeout(decorate,0);
      });
    }
  }

  function returnRealPlayersToLobby(){
    clearBotMeta();
    try{
      const modal=document.getElementById('gameEndModal');
      if(modal) modal.classList.add('hidden');
    }catch(e){}
    try{
      if(typeof currentPhase!=='undefined') currentPhase='lobby';
    }catch(e){}
    try{
      if(typeof showScreen==='function') showScreen('lobbyScreen');
    }catch(e){}
    try{
      if(typeof renderAll==='function') setTimeout(()=>renderAll(),80);
    }catch(e){}
    try{
      if(typeof toast==='function') toast('✅ Ván test đã kết thúc. Bot cũ đã xoá; ván sau sẽ tạo và random Bot mới.');
    }catch(e){}
  }

  function bindSocket(){
    try{
      if(typeof socket==='undefined' || !socket || socket.__botOverlayV3) return;
      socket.__botOverlayV3=true;

      // TEST_SCRIPT cũ có listener testStopped tự đưa người thật ra màn hình nhập tên.
      // Ta giữ listener đó cho nút "Thoát Test & Dừng Bot", nhưng khi game tự kết thúc
      // thì chặn hành vi rời phòng để các máy thật ở lại lobby.
      try{
        originalTestStoppedListeners = typeof socket.listeners==='function' ? socket.listeners('testStopped').slice() : [];
        if(typeof socket.removeAllListeners==='function') socket.removeAllListeners('testStopped');
      }catch(e){}

      socket.on('testRoleMap',d=>{
        meta.clear();
        for(const p of d?.players||[]){
          if(p?.isBot && p?.name && p?.role) meta.set(p.id||p.name,{id:p.id,name:p.name,role:p.role});
        }
        saveMeta();
        setTimeout(decorate,0);
        setTimeout(decorate,120);
        setTimeout(decorate,500);
      });

      ['playersUpdated','roomState','phaseChanged'].forEach(ev=>socket.on(ev,()=>setTimeout(decorate,0)));

      socket.on('gameEnded',()=>{
        autoEndCleanup=true;
        clearBotMeta();
        if(isHostNow()){
          setTimeout(()=>{
            try{ socket.emit('stopTestGame'); }catch(e){}
          },700);
        }
      });

      socket.on('testStopped',d=>{
        clearBotMeta();
        if(autoEndCleanup){
          autoEndCleanup=false;
          returnRealPlayersToLobby();
          return;
        }
        for(const fn of originalTestStoppedListeners){
          try{ fn.call(socket,d); }catch(e){}
        }
      });
    }catch(e){}
  }

  function tick(){
    syncCheckbox();
    bindSocket();
    decorate();
  }

  document.addEventListener('DOMContentLoaded',tick);
  setInterval(tick,350);
})();
</script>
`;

http.ServerResponse.prototype.end = function(chunk, encoding, cb){
  try{
    if(typeof chunk === 'string' && chunk.includes('</body>') && chunk.includes('Ma Sói')){
      chunk = chunk.replace('</body>', OVERLAY + '\n</body>');
    }
  }catch(e){}
  return originalEnd.call(this, chunk, encoding, cb);
};
