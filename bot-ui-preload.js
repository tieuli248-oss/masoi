const http = require('http');

const originalEnd = http.ServerResponse.prototype.end;

const OVERLAY = String.raw`
<style>
  .testBotRoleInlineV2{margin-left:6px;font-weight:900;color:#ffca66;font-size:12px;white-space:nowrap}
  #hostBotFunctionsToggleWrap{
    display:flex;align-items:center;gap:10px;margin:12px 0 4px;padding:11px 12px;
    border:1px solid rgba(133,103,255,.36);border-radius:12px;
    background:linear-gradient(135deg,rgba(28,22,64,.72),rgba(10,13,35,.82));
    cursor:pointer;user-select:none
  }
  #hostBotFunctionsToggle{width:20px;height:20px;flex:0 0 auto;accent-color:#8b5cf6}
  #hostBotFunctionsToggleWrap b{font-size:13px;color:#f5f2ff}
  #hostBotFunctionsToggleWrap .toggleHint{display:block;margin-top:2px;font-size:11px;color:#9ea3bd;line-height:1.35}
  @media(max-width:560px){
    #hostBotFunctionsToggleWrap{padding:10px;margin-top:10px}
    #hostBotFunctionsToggleWrap b{font-size:12px}
    #hostBotFunctionsToggleWrap .toggleHint{font-size:10px}
  }
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

  function setShow(next){
    show=!!next;
    try{sessionStorage.setItem('masoi_test_show_bot_roles',show?'1':'0');}catch(e){}
    const old=document.getElementById('testShowAllBotRoles');
    if(old) old.checked=show;
    const fresh=document.getElementById('hostBotFunctionsToggle');
    if(fresh) fresh.checked=show;
    setTimeout(decorate,0);
  }

  function isHiddenBotAction(text){
    const s=String(text||'');
    if(!/Bot\s*\d+/i.test(s)) return false;
    return /chọn cắn|bảo vệ|soi|Phù thủy|ĐỘC|CỨU|không cứu|bỏ qua bình|bỏ phiếu|\(Sói\)|\(Bảo vệ\)|\(Tiên tri\)|\(Phù thủy\)|\(Thợ săn\)|\(Cupid\)|\(Dân\)/i.test(s);
  }

  function bindEventVisibility(){
    try{
      if(typeof addEvent!=='function' || addEvent.__botVisibilityWrapped) return;
      const baseAddEvent=addEvent;
      const wrapped=function(){
        const text=arguments[0];
        if(!show && isHiddenBotAction(text)) return;
        return baseAddEvent.apply(this,arguments);
      };
      wrapped.__botVisibilityWrapped=true;
      addEvent=wrapped;
    }catch(e){}
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
    if(cb){
      cb.checked=show;
      if(!cb.dataset.overlayV2){
        cb.dataset.overlayV2='1';
        cb.addEventListener('change',()=>setShow(cb.checked));
      }
    }
  }

  function ensureHostBotToggle(){
    const existing=document.getElementById('hostBotFunctionsToggleWrap');
    const shouldShow=isHostNow()&&!gameStarted();
    if(existing){
      existing.style.display=shouldShow?'flex':'none';
      const cb=existing.querySelector('#hostBotFunctionsToggle');
      if(cb) cb.checked=show;
      return;
    }
    if(!shouldShow) return;

    const count=document.getElementById('testPlayerCount');
    const roleList=document.getElementById('testHumanRoleList');
    const startBtn=document.getElementById('testStartBtn');
    const anchorCard=(count&&count.closest('.card')) || (roleList&&roleList.closest('.card')) || (startBtn&&startBtn.closest('.card'));
    if(!anchorCard) return;

    const label=document.createElement('label');
    label.id='hostBotFunctionsToggleWrap';
    label.innerHTML='<input id="hostBotFunctionsToggle" type="checkbox"><span><b>👁 Hiện chức năng Bot trong ván</b><span class="toggleHint">Bật: Host thấy vai/chức năng của Bot. Tắt: giao diện giống người chơi bình thường.</span></span>';
    const insertBefore=startBtn&&startBtn.parentElement===anchorCard?startBtn:null;
    if(insertBefore) anchorCard.insertBefore(label,insertBefore);
    else anchorCard.appendChild(label);
    const cb=label.querySelector('#hostBotFunctionsToggle');
    cb.checked=show;
    cb.addEventListener('change',()=>setShow(cb.checked));
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
    ensureHostBotToggle();
    bindSocket();
    bindEventVisibility();
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
