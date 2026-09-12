const http = require('http');

const PORT = process.env.PORT || 3000;
const PROD_UI = process.env.PROD_UI || 'https://masoi15.netlify.app/';
// Internal socket backend. Users only use masoi-bot-ui.onrender.com.
const TEST_SERVER = process.env.TEST_SERVER || 'https://masoi-bot-test.onrender.com';

const TEST_CARD = `
    <style>
      #testHumanRoleList .testHumanRoleRow{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,.9fr);gap:10px;align-items:center;margin:8px 0;padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:12px}
      #testHumanRoleList .testHumanRoleSelect{min-height:48px;font-size:16px;touch-action:manipulation;position:relative;z-index:2}
      #testBotFunctionPanel{margin-bottom:8px;padding:10px;border:1px solid rgba(156,39,176,.45);border-radius:12px;background:rgba(156,39,176,.07)}
      #testBotFunctionList{margin-top:8px;display:grid;gap:7px}
      #testBotFunctionList .botFunctionRow{padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.03);font-size:14px;line-height:1.4}
      @media(max-width:560px){#testHumanRoleList .testHumanRoleRow{grid-template-columns:1fr}#testHumanRoleList .testHumanRoleSelect{width:100%;min-height:52px}}
    </style>
    <div id="testModeCard" class="card" style="border:1px solid rgba(156,39,176,.65);box-shadow:0 0 24px rgba(156,39,176,.12)">
      <div class="title">🧪 TEST VỚI BOT</div>
      <div class="notice" style="margin-bottom:10px">Máy thật vào link này vẫn hiện đúng tên và chơi y như game thật. Host chọn vai cho từng máy cần test; các ghế còn thiếu sẽ được Bot tự lấp.</div>
      <div class="grid2">
        <div><div class="muted" style="margin-bottom:5px">Tổng số người trong ván</div><select id="testPlayerCount" class="input"></select></div>
        <div><div class="muted" style="margin-bottom:5px">Số Bot sẽ thêm</div><div id="testBotCount" class="input" style="display:flex;align-items:center;min-height:44px">—</div></div>
      </div>
      <div style="margin-top:12px">
        <div class="muted" style="margin-bottom:6px">🎭 Host chọn vai cho các MÁY THẬT</div>
        <div id="testHumanRoleList"></div>
      </div>
      <button id="testStartBtn" class="btn green full" style="margin-top:10px">🤖 Thêm Bot & Bắt đầu test</button>
      <button id="stopTestLobbyBtn" class="btn red full" style="margin-top:8px">⛔ Thoát Test & Dừng Bot</button>
      <div id="testRoleHint" class="muted" style="font-size:12px;margin-top:8px"></div>
    </div>
`;

const TEST_SCRIPT = `
<script>
(function(){
  const ROLE_TABLE={
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
  const rolePickById={};
  const botRoleMap={};
  let stopping=false;
  let lastHumanRoleSignature='';
  let showBotFunctions=false;

  function realPlayers(){
    if(typeof players==='undefined'||!Array.isArray(players))return [];
    return players.filter(p=>!p.isBot && p.connected!==false && p.leftGame!==true);
  }

  function countRoleSlots(n){
    const map={};
    const roles=(typeof roleComposition!=='undefined'&&Array.isArray(roleComposition)&&roleComposition.length===n)?roleComposition:null;
    if(roles){for(const r of roles)map[r]=(map[r]||0)+1;return map;}
    if(n===6)return {'Sói':2,'Tiên tri':1,'Bảo vệ':1,'Dân':2};
    if(n===7)return {'Sói':2,'Tiên tri':1,'Bảo vệ':1,'Phù thủy':1,'Dân':2};
    if(n===8)return {'Sói':2,'Tiên tri':1,'Bảo vệ':1,'Phù thủy':1,'Thợ săn':1,'Dân':2};
    if(n===9)return {'Sói':2,'Tiên tri':1,'Bảo vệ':1,'Phù thủy':1,'Thợ săn':1,'Dân':3};
    const wolves=n>=13?4:3;const base=wolves+5;
    return {'Sói':wolves,'Tiên tri':1,'Bảo vệ':1,'Phù thủy':1,'Thợ săn':1,'Cupid':1,'Dân':n-base};
  }

  function roleOptions(n,selected){
    const slots=countRoleSlots(n);const allowed=ROLE_TABLE[n]||[];
    let html='<option value="Random">🎲 Random</option>';
    for(const r of allowed){
      const qty=slots[r]||1;
      html+='<option value="'+r.replace(/"/g,'&quot;')+'"'+(selected===r?' selected':'')+'>'+r+(qty>1?' ×'+qty:'')+'</option>';
    }
    return html;
  }

  function humanSignature(n,humans){return n+'|'+humans.map(p=>p.id+':'+p.name+':'+(p.connected===false?'0':'1')).join('|');}

  function renderHumanRoleList(force=false){
    const list=document.getElementById('testHumanRoleList');
    const count=document.getElementById('testPlayerCount');
    const botCount=document.getElementById('testBotCount');
    if(!list||!count)return;
    const n=Number(count.value||10);const humans=realPlayers();
    for(const id of Object.keys(rolePickById))if(!humans.some(p=>p.id===id))delete rolePickById[id];
    const bots=n-humans.length;
    if(botCount){botCount.textContent=bots>=0?('🤖 '+bots+' Bot'):('⚠️ Dư '+Math.abs(bots)+' máy thật');botCount.style.color=bots>=0?'':'#ff7b87';}
    const sig=humanSignature(n,humans);
    const active=document.activeElement;
    const choosingRole=!!(active&&active.classList&&active.classList.contains('testHumanRoleSelect'));
    if(!force&&sig===lastHumanRoleSignature)return;
    if(!force&&choosingRole)return;
    lastHumanRoleSignature=sig;
    if(!humans.length){list.innerHTML='<div class="muted">Chưa có máy thật trong phòng.</div>';updateHint();return;}
    list.innerHTML=humans.map(p=>{
      const chosen=rolePickById[p.id]||'Random';
      const tag=p.id===meId?' <b>• Bạn</b>':(p.id===room?.hostId?' 👑':'');
      return '<div class="testHumanRoleRow"><div><b>'+esc(p.name)+'</b>'+tag+'<div class="muted" style="font-size:11px">📱 Máy thật</div></div><select class="input testHumanRoleSelect" aria-label="Chọn vai cho '+esc(p.name)+'" data-player-id="'+p.id+'">'+roleOptions(n,chosen)+'</select></div>';
    }).join('');
    list.querySelectorAll('.testHumanRoleSelect').forEach(sel=>{
      sel.addEventListener('change',()=>{rolePickById[sel.dataset.playerId]=sel.value;updateHint();});
      sel.addEventListener('focus',()=>{sel.dataset.choosing='1';});
      sel.addEventListener('blur',()=>{delete sel.dataset.choosing;});
    });
    updateHint();
  }

  function updateHint(){
    const count=document.getElementById('testPlayerCount');const h=document.getElementById('testRoleHint');if(!count||!h)return;
    const n=Number(count.value),humans=realPlayers(),bots=n-humans.length;
    const picks=humans.map(p=>({name:p.name,role:rolePickById[p.id]||'Random'})).filter(x=>x.role!=='Random');
    h.textContent=(n<10?'Bàn '+n+' người không có Cupid. ':'')+humans.length+' máy thật + '+Math.max(0,bots)+' Bot.'+(picks.length?' Vai đã khóa: '+picks.map(x=>x.name+' = '+x.role).join(', ')+'.':'');
  }

  function initTestControls(){
    const count=document.getElementById('testPlayerCount');const btn=document.getElementById('testStartBtn');
    if(!count||!btn)return;
    if(!count.options.length){for(let n=6;n<=15;n++){const o=document.createElement('option');o.value=String(n);o.textContent=n+' người';count.appendChild(o)}count.value='10';}
    if(!count.dataset.bound){
      count.dataset.bound='1';
      count.addEventListener('change',()=>{lastHumanRoleSignature='';renderHumanRoleList(true);updateHint();});
      btn.addEventListener('click',()=>{
        if(typeof isHost!=='undefined'&&!isHost){if(typeof toast==='function')toast('Chỉ Host mới bắt đầu Test Mode.');return;}
        const n=Number(count.value),humans=realPlayers();
        if(humans.length>n){if(typeof toast==='function')toast('Đang có '+humans.length+' máy thật, vượt số slot '+n+'.');return;}
        const assignments={};
        for(const p of humans){const r=rolePickById[p.id]||'Random';if(r!=='Random')assignments[p.id]=r;}
        btn.disabled=true;btn.textContent='⏳ Đang thêm Bot...';
        socket.emit('startTestGame',{count:n,roleAssignments:assignments});
        setTimeout(()=>{if(typeof room==='undefined'||!room?.started){btn.disabled=false;btn.textContent='🤖 Thêm Bot & Bắt đầu test'}},3500);
      });
    }
    renderHumanRoleList(false);updateHint();
  }

  function stopCurrentTest(){
    if(typeof isHost!=='undefined'&&!isHost){if(typeof toast==='function')toast('Chỉ Host mới dừng toàn bộ Test Mode.');return;}
    if(!confirm('Dừng ván test, xoá toàn bộ Bot và đưa các máy test ra khỏi phòng?'))return;
    stopping=true;if(typeof toast==='function')toast('⏳ Đang dừng Test Mode...');socket.emit('stopTestGame');
  }

  function renderBotFunctionPanel(){
    const panel=document.getElementById('testBotFunctionPanel');
    const list=document.getElementById('testBotFunctionList');
    const btn=document.getElementById('toggleBotFunctionBtn');
    if(!panel||!list||!btn)return;
    const host=typeof isHost!=='undefined'&&isHost;
    const started=typeof room!=='undefined'&&!!room?.started;
    panel.classList.toggle('hidden',!(host&&started));
    if(!(host&&started))return;
    btn.textContent=showBotFunctions?'🙈 Ẩn chức năng Bot':'👁 Hiện chức năng Bot';
    list.classList.toggle('hidden',!showBotFunctions);
    if(!showBotFunctions)return;
    const bots=(typeof players!=='undefined'&&Array.isArray(players)?players:[]).filter(p=>p.isBot);
    if(!bots.length){list.innerHTML='<div class="muted">Chưa có Bot.</div>';return;}
    list.innerHTML=bots.map(p=>{
      const role=botRoleMap[p.id]||'Chưa rõ';
      return '<div class="botFunctionRow"><b>'+esc(p.name)+'</b> — <b>'+esc(role)+'</b></div>';
    }).join('');
  }

  function addBotFunctionPanel(){
    const old=document.getElementById('gameLeaveBtn');
    if(!old)return;
    let panel=document.getElementById('testBotFunctionPanel');
    if(!panel){
      panel=document.createElement('div');
      panel.id='testBotFunctionPanel';
      panel.className='hidden';
      panel.innerHTML='<button id="toggleBotFunctionBtn" class="btn full" type="button">👁 Hiện chức năng Bot</button><div id="testBotFunctionList" class="hidden"></div>';
      old.parentNode.insertBefore(panel,old);
      document.getElementById('toggleBotFunctionBtn').onclick=()=>{showBotFunctions=!showBotFunctions;renderBotFunctionPanel();};
    }
    renderBotFunctionPanel();
  }

  socket.on('testRoleMap',d=>{
    for(const k of Object.keys(botRoleMap))delete botRoleMap[k];
    for(const p of d?.players||[])if(p?.isBot)botRoleMap[p.id]=p.role;
    renderBotFunctionPanel();
  });

  socket.on('testStopped',d=>{
    stopping=false;showBotFunctions=false;for(const k of Object.keys(botRoleMap))delete botRoleMap[k];
    try{sessionStorage.removeItem('masoi_joined_session')}catch(e){}
    try{socket.emit('leaveRoom')}catch(e){}
    setTimeout(()=>{
      try{if(typeof resetLocal==='function')resetLocal()}catch(e){}
      try{if(typeof showScreen==='function')showScreen('joinScreen')}catch(e){}
      if(typeof toast==='function')toast('✅ '+(d?.message||'Đã dừng Test Mode.'));
    },180);
  });

  socket.on('testBotEvent',d=>{
    if(typeof isHost!=='undefined'&&!isHost)return;
    const text=d?.text||'';if(!text)return;
    if(typeof addEvent==='function')addEvent(text);
  });

  socket.on('actionError',()=>{
    const btn=document.getElementById('testStartBtn');
    if(btn){btn.disabled=false;btn.textContent='🤖 Thêm Bot & Bắt đầu test';}
  });

  function addGameStopButton(){
    const old=document.getElementById('gameLeaveBtn');
    if(!old)return;
    let b=document.getElementById('stopTestGameBtn');
    if(!b){b=document.createElement('button');b.id='stopTestGameBtn';b.className='btn red full';b.textContent='⛔ Thoát Test & Dừng Bot';b.style.marginBottom='8px';b.onclick=stopCurrentTest;old.parentNode.insertBefore(b,old);}
    b.classList.toggle('hidden',!(typeof isHost!=='undefined'&&isHost));
  }

  function syncTestUI(){
    initTestControls();addBotFunctionPanel();addGameStopButton();
    const card=document.getElementById('testModeCard');
    if(card)card.classList.toggle('hidden',!!(typeof room!=='undefined'&&room?.started)||!(typeof isHost!=='undefined'&&isHost));
    const normalStart=document.getElementById('startBtn');if(normalStart&&typeof isHost!=='undefined'&&isHost)normalStart.classList.add('hidden');
    const hint=document.getElementById('readyHint');
    if(hint&&typeof isHost!=='undefined'&&isHost&&!(typeof room!=='undefined'&&room?.started))hint.textContent='🧪 Các máy thật cứ vào phòng bình thường. Host chọn vai từng máy ở TEST VỚI BOT rồi bắt đầu.';
    const stopLobby=document.getElementById('stopTestLobbyBtn');if(stopLobby&&!stopLobby.dataset.bound){stopLobby.dataset.bound='1';stopLobby.onclick=stopCurrentTest;}
  }

  if(typeof renderAll==='function'){
    const baseRender=renderAll;
    renderAll=function(){const out=baseRender.apply(this,arguments);setTimeout(syncTestUI,0);return out;};
  }
  document.addEventListener('DOMContentLoaded',syncTestUI);
  setInterval(()=>{
    const active=document.activeElement;
    if(active&&active.classList&&active.classList.contains('testHumanRoleSelect')){updateHint();return;}
    syncTestUI();
  },1200);
})();
</script>
`;

function inject(html){
  let out=String(html);
  if(!out.includes('<base '))out=out.replace(/<head([^>]*)>/i,'<head$1>\n<base href="https://masoi15.netlify.app/">');
  out=out.replaceAll('https://masoi-jbjs.onrender.com',TEST_SERVER);
  out=out.replace(/<meta property="og:title"[^>]*>/i,'<meta property="og:title" content="🧪 Ma Sói Bot Test">');
  out=out.replace(/<title>[^<]*<\/title>/i,'<title>🧪 Ma Sói Bot Test</title>');
  const readyMarker=/(<div class="card">\s*<div id="readyHint"[\s\S]*?<button id="readyBtn")/i;
  if(readyMarker.test(out))out=out.replace(readyMarker,TEST_CARD+'$1');
  else{const lobbyEnd=out.indexOf('</section>',out.indexOf('id="lobbyScreen"'));if(lobbyEnd>0)out=out.slice(0,lobbyEnd)+TEST_CARD+out.slice(lobbyEnd);}
  out=out.replace('</body>',TEST_SCRIPT+'\n</body>');
  return out;
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/health'){res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});return res.end('OK');}
    if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(302,{Location:PROD_UI.replace(/\/$/,'')+req.url});return res.end();}
    const r=await fetch(PROD_UI,{headers:{'user-agent':'Mozilla/5.0 MaSoiTestProxy/2.2'}});
    if(!r.ok)throw new Error('Production UI HTTP '+r.status);
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store, no-cache, must-revalidate','access-control-allow-origin':'*'});
    res.end(inject(await r.text()));
  }catch(err){res.writeHead(500,{'content-type':'text/plain; charset=utf-8'});res.end('Không tải được giao diện test: '+err.message);}
});
server.listen(PORT,()=>console.log('Bot UI listening on',PORT));
