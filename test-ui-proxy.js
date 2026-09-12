const http = require('http');

const PORT = process.env.PORT || 3000;
const PROD_UI = process.env.PROD_UI || 'https://masoi15.netlify.app/';
const TEST_SERVER = process.env.TEST_SERVER || 'https://masoi-bot-test.onrender.com';
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'MA_SOI_TEST_STOP_2026';

const TEST_CARD = `
    <div id="testModeCard" class="card" style="border:1px solid rgba(156,39,176,.65);box-shadow:0 0 24px rgba(156,39,176,.12)">
      <div class="title">🧪 TEST VỚI BOT</div>
      <div class="notice" style="margin-bottom:10px">Giao diện và thao tác giữ nguyên như game thật. Chỉ thêm phần chọn số người + vai của bạn; các ghế còn lại do Bot đảm nhiệm.</div>
      <div class="grid2">
        <div><div class="muted" style="margin-bottom:5px">Số người</div><select id="testPlayerCount" class="input"></select></div>
        <div><div class="muted" style="margin-bottom:5px">Vai của tôi</div><select id="testMyRole" class="input"></select></div>
      </div>
      <button id="testStartBtn" class="btn green full" style="margin-top:10px">🤖 Tạo Bot & Bắt đầu test</button>
      <button id="stopTestLobbyBtn" class="btn red full" style="margin-top:8px">⛔ Thoát Test & Dừng Bot</button>
      <div id="testRoleHint" class="muted" style="font-size:12px;margin-top:8px"></div>
    </div>
`;

const TEST_SCRIPT = `
<script>
(function(){
  const TEST_ROLE_TABLE={
    6:['Sói','Tiên tri','Bảo vệ','Dân'],
    7:['Sói','Tiên tri','Bảo vệ','Phù thủy','Dân'],
    8:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân'],
    9:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân'],
    10:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    11:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    12:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    13:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    14:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân'],
    15:['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân']
  };

  function initTestControls(){
    const count=document.getElementById('testPlayerCount');
    const role=document.getElementById('testMyRole');
    const btn=document.getElementById('testStartBtn');
    if(!count||!role||!btn)return;
    if(!count.options.length){
      for(let n=6;n<=15;n++){
        const o=document.createElement('option');o.value=String(n);o.textContent=n+' người';count.appendChild(o);
      }
      count.value='10';
    }
    const refresh=()=>{
      const n=Number(count.value), old=role.value;
      role.innerHTML='';
      for(const r of TEST_ROLE_TABLE[n]||[]){const o=document.createElement('option');o.value=r;o.textContent=r;role.appendChild(o)}
      if([...role.options].some(o=>o.value===old))role.value=old;
      const h=document.getElementById('testRoleHint');
      if(h)h.textContent=n<10?'Bàn '+n+' người không có Cupid.':'Bàn '+n+' người có thể test Cupid.';
    };
    if(!count.dataset.testBound){
      count.dataset.testBound='1'; count.addEventListener('change',refresh); refresh();
      btn.addEventListener('click',()=>{
        if(typeof isHost!=='undefined'&&!isHost){ if(typeof toast==='function')toast('Chỉ Host mới tạo được ván Bot test.'); return; }
        btn.disabled=true; btn.textContent='⏳ Đang tạo Bot...';
        socket.emit('startTestGame',{count:Number(count.value),role:role.value});
        setTimeout(()=>{if(typeof room==='undefined'||!room?.started){btn.disabled=false;btn.textContent='🤖 Tạo Bot & Bắt đầu test'}},3000);
      });
    }
  }

  let stopping=false;
  function stopCurrentTest(){
    if(!confirm('Dừng ván test hiện tại, ngắt toàn bộ Bot và thoát khỏi Test Mode?'))return;
    stopping=true;
    if(typeof toast==='function')toast('⏳ Đang dừng Test Mode...');
    socket.emit('adminLogin',{password:${JSON.stringify(TEST_ADMIN_PASSWORD)}});
  }

  socket.on('adminLoginResult',d=>{
    if(!stopping)return;
    if(!d?.ok){stopping=false;if(typeof toast==='function')toast('Không thể dừng Test Mode: '+(d?.message||'lỗi xác thực'));return;}
    socket.emit('adminResetRoom');
    setTimeout(()=>socket.emit('adminKickAll'),150);
    setTimeout(()=>{
      stopping=false;
      try{sessionStorage.removeItem('masoi_joined_session')}catch(e){}
      try{if(typeof resetLocal==='function')resetLocal()}catch(e){}
      try{if(typeof showScreen==='function')showScreen('joinScreen')}catch(e){}
      if(typeof toast==='function')toast('✅ Đã dừng Test Mode.');
    },500);
  });

  function addGameStopButton(){
    const old=document.getElementById('gameLeaveBtn');
    if(!old||document.getElementById('stopTestGameBtn'))return;
    const b=document.createElement('button');
    b.id='stopTestGameBtn'; b.className='btn red full'; b.textContent='⛔ Thoát Test & Dừng Bot';
    b.style.marginBottom='8px'; b.onclick=stopCurrentTest;
    old.parentNode.insertBefore(b,old);
  }

  function syncTestUI(){
    initTestControls(); addGameStopButton();
    const c=document.getElementById('testModeCard');
    if(c)c.classList.toggle('hidden',!!(typeof room!=='undefined'&&room?.started)||!(typeof isHost!=='undefined'&&isHost));
    const normalStart=document.getElementById('startBtn'); if(normalStart)normalStart.classList.add('hidden');
    const ready=document.getElementById('readyBtn'); if(ready)ready.classList.add('hidden');
    const hint=document.getElementById('readyHint');
    if(hint&&typeof isHost!=='undefined'&&isHost&&!(typeof room!=='undefined'&&room?.started))hint.textContent='🧪 Chọn cấu hình TEST VỚI BOT ở trên để bắt đầu.';
    const stopLobby=document.getElementById('stopTestLobbyBtn'); if(stopLobby&&!stopLobby.dataset.bound){stopLobby.dataset.bound='1';stopLobby.onclick=stopCurrentTest;}
  }

  if(typeof renderAll==='function'){
    const baseRender=renderAll;
    renderAll=function(){const out=baseRender.apply(this,arguments);setTimeout(syncTestUI,0);return out;};
  }
  document.addEventListener('DOMContentLoaded',syncTestUI);
  setInterval(syncTestUI,700);
})();
</script>
`;

function inject(html) {
  let out = String(html);
  if (!out.includes('<base ')) out = out.replace(/<head([^>]*)>/i, '<head$1>\n<base href="https://masoi15.netlify.app/">');
  out = out.replaceAll('https://masoi-jbjs.onrender.com', TEST_SERVER);
  out = out.replace(/<meta property="og:title"[^>]*>/i, '<meta property="og:title" content="🧪 Ma Sói Bot Test">');
  out = out.replace(/<title>[^<]*<\/title>/i, '<title>🧪 Ma Sói Bot Test</title>');

  const readyMarker = /(<div class="card">\s*<div id="readyHint"[\s\S]*?<button id="readyBtn")/i;
  if (readyMarker.test(out)) out = out.replace(readyMarker, TEST_CARD + '$1');
  else {
    const lobbyEnd = out.indexOf('</section>', out.indexOf('id="lobbyScreen"'));
    if (lobbyEnd > 0) out = out.slice(0,lobbyEnd) + TEST_CARD + out.slice(lobbyEnd);
  }

  out = out.replace('</body>', TEST_SCRIPT + '\n</body>');
  return out;
}

const server = http.createServer(async (req,res)=>{
  try {
    if (req.url === '/health') {
      res.writeHead(200,{'content-type':'text/plain; charset=utf-8'}); return res.end('OK');
    }
    if (req.url !== '/' && req.url !== '/index.html') {
      res.writeHead(302,{Location:PROD_UI.replace(/\/$/,'')+req.url}); return res.end();
    }
    const r = await fetch(PROD_UI,{headers:{'user-agent':'Mozilla/5.0 MaSoiTestProxy/1.0'}});
    if(!r.ok) throw new Error('Production UI HTTP '+r.status);
    const html = inject(await r.text());
    res.writeHead(200,{
      'content-type':'text/html; charset=utf-8',
      'cache-control':'no-store, no-cache, must-revalidate',
      'access-control-allow-origin':'*'
    });
    res.end(html);
  } catch (err) {
    res.writeHead(500,{'content-type':'text/plain; charset=utf-8'});
    res.end('Không tải được giao diện test: '+err.message);
  }
});

server.listen(PORT,()=>console.log('Test UI proxy listening on',PORT));
