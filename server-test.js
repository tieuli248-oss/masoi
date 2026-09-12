// ============================================================
// MA SOI BOT TEST SERVER - ISOLATED FROM PRODUCTION
// ------------------------------------------------------------
// Chạy bằng: node server-test.js
// File này KHÔNG sửa server.js production.
// Nó nạp server-core.js, thêm Test Mode + bot, rồi để server.js
// áp toàn bộ patch production hiện tại (Witch 50/10, Couple, vote...).
// ============================================================

const fs = require("fs");
const path = require("path");

const corePath = path.join(__dirname, "server-core.js");
let testCore = fs.readFileSync(corePath, "utf8");

function patchOnce(oldText, newText, label) {
    if (!testCore.includes(oldText)) {
        throw new Error(`[TEST] Không tìm thấy đoạn patch: ${label}`);
    }
    testCore = testCore.replace(oldText, newText);
}

// ============================================================
// TEST CLIENT - served directly by Render at /
// ============================================================
const TEST_HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>🧪 Ma Sói Bot Test</title>
<script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
<style>
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#261736,#08070b 55%);color:#f5f5f5;font-family:Arial,sans-serif;min-height:100vh}.wrap{width:min(760px,94%);margin:auto;padding:18px 0 60px}.card{background:#15121d;border:1px solid #332943;border-radius:18px;padding:16px;margin:12px 0;box-shadow:0 12px 35px #0008}h1{font-size:24px;margin:0 0 6px}.muted{color:#aaa;font-size:13px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}input,select,button{width:100%;border:1px solid #40364d;border-radius:12px;padding:12px;background:#201a29;color:#fff;font-size:15px}button{cursor:pointer;font-weight:800}button.primary{background:#7c3aed;border-color:#8b5cf6}.danger{background:#8b1d2c}.ok{background:#165c3b}.hidden{display:none!important}.status{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.pill{padding:7px 10px;border-radius:999px;background:#24202c;border:1px solid #3b3346;font-size:13px}.players{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.p{padding:12px;border:1px solid #3c3346;border-radius:14px;background:#1d1824;min-height:72px}.p.dead{opacity:.45}.p.me{outline:2px solid #8b5cf6}.p.clickable{cursor:pointer;border-color:#8661b0}.name{font-weight:900}.role{font-size:12px;color:#d4b8ff;margin-top:5px}.log{height:210px;overflow:auto;background:#0c0a10;border-radius:12px;padding:10px;font-size:13px;line-height:1.5}.timer{font-size:30px;font-weight:900;text-align:center}.phase{text-align:center;font-size:17px;font-weight:900}.lover{color:#ff7aaa;font-weight:800}.warn{color:#ffca66}.green{color:#75e4a7}.red{color:#ff7b87}.choice{outline:2px solid #ff6fae}.small{font-size:12px}@media(max-width:560px){.row,.row3{grid-template-columns:1fr}.players{grid-template-columns:1fr 1fr}}
</style>
</head>
<body><div class="wrap">
<div class="card"><h1>🧪 MA SÓI — BOT TEST</h1><div class="muted">Bản test riêng. Bạn chọn vai của mình, các vai còn lại được random cho bot.</div><div id="conn" class="status"><span class="pill">Đang kết nối...</span></div></div>

<div id="joinCard" class="card">
<h3>1. Vào phòng test</h3>
<input id="name" placeholder="Tên của bạn" maxlength="20" value="Quyên">
<button id="joinBtn" class="primary" style="margin-top:10px">VÀO TEST</button>
</div>

<div id="setupCard" class="card hidden">
<h3>2. Tạo ván bot</h3>
<div class="row"><div><div class="muted">Số người</div><select id="count"></select></div><div><div class="muted">Vai của tôi</div><select id="role"></select></div></div>
<label style="display:flex;gap:8px;align-items:center;margin:12px 0"><input id="showBotRole" type="checkbox" style="width:auto"> <span>Hiện role bot để debug</span></label>
<button id="startBtn" class="primary">▶ BẮT ĐẦU TEST</button>
<div class="muted" style="margin-top:8px">Bot tự lấp đủ ghế, tự cắn và tự vote. Cupid/Hunter có cơ chế auto của server.</div>
</div>

<div id="gameCard" class="card hidden">
<div class="phase" id="phase">Đang chờ...</div><div class="timer" id="timer">--</div>
<div class="status"><span class="pill">Vai: <b id="myRole">?</b></span><span class="pill" id="loverPill">💘 Chưa có Couple</span></div>
<div id="actionHelp" class="muted" style="margin:10px 0">Chọn mục tiêu theo vai của bạn.</div>
<div id="specialBtns"></div>
<div class="players" id="players"></div>
</div>

<div class="card"><b>📜 Nhật ký test</b><div id="log" class="log" style="margin-top:9px"></div></div>
</div>
<script>
const socket=io({transports:['websocket','polling'],reconnection:true});
let meId=null,myRole=null,players=[],phase='lobby',endsAt=null,loverInfo=null,debugRoles={},cupidFirst=null,hunterOpen=false,witchMode=null;
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function log(t,c=''){const d=document.createElement('div');if(c)d.className=c;d.innerHTML=esc(t);$('log').prepend(d)}
function rolesFor(n){if(n===6)return['Sói','Tiên tri','Bảo vệ','Dân'];if(n===7)return['Sói','Tiên tri','Bảo vệ','Phù thủy','Dân'];if(n===8||n===9)return['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Dân'];return['Sói','Tiên tri','Bảo vệ','Phù thủy','Thợ săn','Cupid','Dân']}
for(let n=6;n<=15;n++){const o=document.createElement('option');o.value=n;o.textContent=n+' người';$('count').appendChild(o)}$('count').value='10';
function refreshRoles(){const n=+$('count').value,old=$('role').value;$('role').innerHTML='';for(const r of rolesFor(n)){const o=document.createElement('option');o.value=r;o.textContent=r;$('role').appendChild(o)}if([...$('role').options].some(o=>o.value===old))$('role').value=old}$('count').onchange=refreshRoles;refreshRoles();
function deviceId(){let x=localStorage.getItem('masoi_test_device');if(!x){x='test-'+Date.now()+'-'+Math.random().toString(36).slice(2);localStorage.setItem('masoi_test_device',x)}return x}
$('joinBtn').onclick=()=>{const name=$('name').value.trim();if(!name)return;localStorage.setItem('masoi_test_name',name);socket.emit('joinRoom',{name,deviceId:deviceId()})};$('name').value=localStorage.getItem('masoi_test_name')||'Quyên';
$('startBtn').onclick=()=>{socket.emit('startTestGame',{count:+$('count').value,role:$('role').value})};
$('showBotRole').onchange=render;
function phaseName(p){return({lobby:'PHÒNG CHỜ',night:'🌙 BAN ĐÊM',daySpeech:'☀️ THẢO LUẬN',dayVote:'🗳️ BỎ PHIẾU',ended:'🏆 KẾT THÚC',intro:'🎭 BẮT ĐẦU'})[p]||p}
function canClick(p){if(!p.alive)return false;if(hunterOpen&&myRole==='Thợ săn'&&p.id!==meId)return true;if(phase==='dayVote'&&p.id!==meId)return true;if(phase!=='night')return false;if(myRole==='Sói')return p.id!==meId;if(myRole==='Tiên tri')return p.id!==meId;if(myRole==='Bảo vệ')return true;if(myRole==='Phù thủy'&&witchMode==='poison')return p.id!==meId;if(myRole==='Cupid'&&!cupidFirst)return true;if(myRole==='Cupid'&&cupidFirst)return p.id!==cupidFirst;return false}
function clickPlayer(id){if(hunterOpen&&myRole==='Thợ săn'){socket.emit('hunterShoot',{targetId:id});return}if(phase==='dayVote'){socket.emit('dayVote',{targetId:id});return}if(phase!=='night')return;if(myRole==='Sói')socket.emit('wolfVote',{targetId:id});else if(myRole==='Tiên tri')socket.emit('seerInspect',{targetId:id});else if(myRole==='Bảo vệ')socket.emit('guardProtect',{targetId:id});else if(myRole==='Phù thủy'&&witchMode==='poison')socket.emit('witchPoison',{targetId:id});else if(myRole==='Cupid'){if(!cupidFirst){cupidFirst=id;log('Cupid: đã chọn người thứ nhất.');render()}else{socket.emit('cupidPair',{firstId:cupidFirst,secondId:id});cupidFirst=null}}}
function render(){ $('phase').textContent=phaseName(phase);$('myRole').textContent=myRole||'?';$('loverPill').textContent=loverInfo?('💘 '+loverInfo.loverName+' — '+(loverInfo.loverRole||'')):'💘 Chưa có Couple';let help='';if(phase==='night'){help=({Sói:'🐺 Chọn người để Sói cắn.', 'Tiên tri':'🔮 Chọn người để soi.', 'Bảo vệ':'🛡️ Chọn người để bảo vệ.', 'Phù thủy':witchMode==='poison'?'☠️ Chọn/đổi mục tiêu độc.':'🧪 Chờ cửa sổ Phù thủy.', 'Cupid':cupidFirst?'💘 Chọn người yêu thứ hai.':'💘 Chọn người yêu thứ nhất.', 'Thợ săn':'🏹 Chờ khi bạn chết để trả thù.', 'Dân':'🌙 Dân ngủ.'})[myRole]||''}else if(phase==='dayVote')help='🗳️ Chọn người bạn muốn treo cổ.';else if(phase==='daySpeech')help='☀️ Quan sát và chuẩn bị vote.';if(hunterOpen)help='🏹 BẠN LÀ THỢ SĂN — chọn người để bắn.';$('actionHelp').textContent=help;const box=$('players');box.innerHTML='';for(const p of players){const d=document.createElement('div');d.className='p'+(!p.alive?' dead':'')+(p.id===meId?' me':'')+(canClick(p)?' clickable':'')+(cupidFirst===p.id?' choice':'');const dbg=$('showBotRole').checked&&debugRoles[p.id]?('<div class="role">DEBUG: '+esc(debugRoles[p.id])+'</div>'):'';d.innerHTML='<div class="name">'+esc(p.name)+(p.id===meId?' 👤':'')+'</div><div class="small">'+(p.alive?'🟢 Sống':'💀 Chết')+(p.connected===false?' · Offline':'')+'</div>'+dbg;if(canClick(p))d.onclick=()=>clickPlayer(p.id);box.appendChild(d)}}
setInterval(()=>{if(!endsAt){$('timer').textContent='--';return}const s=Math.max(0,Math.ceil((endsAt-Date.now())/1000));$('timer').textContent=s+'s'},250);
socket.on('connect',()=>{$('conn').innerHTML='<span class="pill green">● Server test đã kết nối</span>';log('Đã kết nối server test.','green')});socket.on('disconnect',()=>{$('conn').innerHTML='<span class="pill red">● Mất kết nối</span>';log('Mất kết nối server.','red')});
socket.on('enteredGame',d=>{meId=d.yourPlayerId;$('joinCard').classList.add('hidden');if(!d.room?.started)$('setupCard').classList.remove('hidden');else $('gameCard').classList.remove('hidden');log('Đã vào phòng test: '+d.yourName);});
socket.on('roomState',d=>{if(d?.players)players=d.players;if(d?.phase)phase=d.phase;render()});socket.on('playersUpdated',d=>{players=d?.players||players;render()});socket.on('phaseChanged',d=>{phase=d.phase;if(d.players)players=d.players;witchMode=null;if(phase!=='night')cupidFirst=null;$('setupCard').classList.add('hidden');$('gameCard').classList.remove('hidden');log('Chuyển pha: '+phaseName(phase));render()});socket.on('phaseTimer',d=>{endsAt=d.endsAt||Date.now()+((d.remaining||0)*1000)});
socket.on('roleAssigned',d=>{myRole=d.role;log('Vai của bạn: '+myRole,'warn');render()});socket.on('testRoleMap',d=>{debugRoles={};for(const p of d.players||[])debugRoles[p.id]=p.role;log('Đã random role cho '+(d.players||[]).length+' người.');render()});
socket.on('loverLinked',d=>{loverInfo=d;log('💘 Người yêu: '+d.loverName+' ('+d.loverRole+')');render()});socket.on('witchActionRequired',d=>{witchMode=d.mode;log(d.message||('Phù thủy: '+d.mode),'warn');const b=$('specialBtns');b.innerHTML='';if(d.mode==='save'&&d.canSave){const x=document.createElement('button');x.className='ok';x.textContent='❤️ CỨU '+(d.targetName||'NGƯỜI BỊ CẮN');x.onclick=()=>socket.emit('witchSave');b.appendChild(x)}render()});socket.on('witchPoisonLocked',d=>{witchMode=null;log(d.message||'Đã khóa bình độc.');render()});
socket.on('hunterActionRequired',d=>{hunterOpen=true;log('🏹 Thợ săn: chọn người để bắn!','warn');render()});socket.on('hunterShotResolved',d=>{hunterOpen=false;log(d.message||'Thợ săn đã bắn.');render()});
socket.on('seerResult',d=>log('🔮 '+(d.targetName||'Mục tiêu')+': '+(d.result||d.message||''),'warn'));socket.on('guardProtectSuccess',d=>log('🛡️ Đã bảo vệ mục tiêu.','green'));socket.on('actionAccepted',d=>{if(d?.message)log(d.message,'green')});socket.on('actionError',d=>log('LỖI: '+(d?.message||'Không thực hiện được'),'red'));socket.on('enterError',d=>log('LỖI VÀO PHÒNG: '+d.message,'red'));socket.on('voteResult',d=>log(d?.message||'Đã chốt vote.'));socket.on('gameEnded',d=>{phase='ended';endsAt=null;log('🏆 '+d.message,'warn');render()});socket.on('gameAutoReset',d=>{phase='lobby';myRole=null;debugRoles={};loverInfo=null;$('gameCard').classList.add('hidden');$('setupCard').classList.remove('hidden');log(d.message||'Đã reset về lobby.');});socket.on('dailyReset',d=>log(d.message||'Daily reset.'));
</script></body></html>`;

// ============================================================
// Serve test client from the Render test service itself.
// ============================================================
patchOnce(
`    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    res.end("🐺 Ma Sói Online Server OK");`,
`    if (rawUrl === "/" || rawUrl.startsWith("/test")) {
        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
        });
        return res.end(${JSON.stringify(TEST_HTML)});
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    res.end("🧪 Ma Sói Bot Test Server OK");`,
"serve test html"
);

// ============================================================
// Force the chosen human role while preserving the normal role table.
// We only reorder the already-random arrays immediately before assignment.
// ============================================================
patchOnce(
`    shuffledPlayers.forEach(
        (player, index) => {`,
`    if (room.testMode && room.testHumanId && room.testSelectedRole) {
        const humanIndex = shuffledPlayers.findIndex(p => p.id === room.testHumanId);
        const roleIndex = shuffledRoles.indexOf(room.testSelectedRole);
        if (humanIndex >= 0 && roleIndex >= 0) {
            [shuffledPlayers[0], shuffledPlayers[humanIndex]] = [shuffledPlayers[humanIndex], shuffledPlayers[0]];
            [shuffledRoles[0], shuffledRoles[roleIndex]] = [shuffledRoles[roleIndex], shuffledRoles[0]];
        }
    }

    shuffledPlayers.forEach(
        (player, index) => {`,
"lock selected human role"
);

// ============================================================
// Test helpers + lightweight smart bot engine.
// Bots are virtual server-side players, never real browser sockets.
// ============================================================
const TEST_HELPERS = `
/* =========================================================
   TEST MODE / SERVER-SIDE BOTS
========================================================= */
function testAllowedRoles(count) {
    return [...new Set(getRoleComposition(count))];
}

function testBotPlayer(index) {
    return {
        id: "BOT-" + Date.now() + "-" + index + "-" + Math.random().toString(36).slice(2, 8),
        name: "🤖 Bot " + String(index).padStart(2, "0"),
        deviceId: "test-bot-" + Date.now() + "-" + index,
        connected: true,
        leftGame: false,
        ready: true,
        alive: true,
        role: null,
        deathReasons: [],
        loverId: null,
        used: { witchSave: false, witchPoison: false },
        seerUsedNight: false,
        dayVoteTargetId: null,
        isBot: true
    };
}

function chooseTestBotTarget(candidates, preferred = null) {
    if (!candidates.length) return null;
    if (preferred && candidates.some(p => p.id === preferred.id) && Math.random() < 0.55) return preferred;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function runTestBotNight() {
    if (!room.testMode || !room.started || room.phase !== "night" || !room.night) return;

    // Wolves coordinate on the same non-wolf target. Prefer the human sometimes
    // when the human is not a wolf, so role interactions are easier to test.
    if (!room.night.witchActionOpen) {
        const botWolves = room.players.filter(p => p.isBot && p.alive && p.role === "Sói");
        const candidates = alivePlayers().filter(p => p.role !== "Sói");
        if (botWolves.length && candidates.length) {
            const human = findPlayer(room.testHumanId);
            const key = room.nightNumber;
            if (room.testBotWolfNight !== key || !findPlayer(room.testBotWolfTargetId)?.alive) {
                const target = chooseTestBotTarget(candidates, human && human.alive && human.role !== "Sói" ? human : null);
                room.testBotWolfNight = key;
                room.testBotWolfTargetId = target?.id || null;
            }
            const target = findPlayer(room.testBotWolfTargetId);
            if (target?.alive) {
                for (const wolf of botWolves) room.night.wolfVotes.set(wolf.id, target.id);
                if (typeof sendWolfVoteState === "function") sendWolfVoteState();
            }
        }
    }
}

function runTestBotDayVote() {
    if (!room.testMode || !room.started || room.phase !== "dayVote") return;
    const human = findPlayer(room.testHumanId);
    const bots = room.players.filter(p => p.isBot && p.alive);
    for (const bot of bots) {
        if (room.dayVotes.has(bot.id)) continue;
        let candidates = alivePlayers().filter(p => p.id !== bot.id);
        if (!candidates.length) continue;
        let preferred = null;
        if (bot.role === "Sói") {
            const nonWolves = candidates.filter(p => p.role !== "Sói");
            if (human?.alive && human.role !== "Sói" && nonWolves.some(p => p.id === human.id) && Math.random() < 0.35) preferred = human;
            if (!preferred && nonWolves.length) preferred = nonWolves[Math.floor(Math.random() * nonWolves.length)];
        } else {
            // Smart-ish village bots: they have a noisy suspicion bias toward wolves,
            // but not perfect certainty, so the test does not become deterministic.
            const wolves = candidates.filter(p => p.role === "Sói");
            if (wolves.length && Math.random() < 0.62) preferred = wolves[Math.floor(Math.random() * wolves.length)];
            else if (human?.alive && human.id !== bot.id && Math.random() < 0.10) preferred = human;
        }
        const target = chooseTestBotTarget(candidates, preferred);
        if (!target) continue;
        room.dayVotes.set(bot.id, target.id);
        bot.dayVoteTargetId = target.id;
    }
    if (typeof sendDayVoteState === "function") sendDayVoteState();
    if (typeof broadcastPlayers === "function") broadcastPlayers();
}

const testBotTicker = setInterval(() => {
    try {
        runTestBotNight();
        runTestBotDayVote();
    } catch (err) {
        console.error("[TEST BOT]", err);
    }
}, 1200);
if (typeof testBotTicker.unref === "function") testBotTicker.unref();
`;

patchOnce(
`io.on(
    "connection",`,
TEST_HELPERS + `\nio.on(\n    "connection",`,
"inject test bot helpers"
);

// ============================================================
// Add a test-only socket event. This exists ONLY in server-test.js.
// ============================================================
const TEST_EVENT = `

        socket.on("startTestGame", data => {
            if (room.started) {
                socket.emit("actionError", { message: "Ván đang chạy. Hãy chờ reset về lobby." });
                return;
            }

            const human = findPlayer(socket.data.playerId);
            if (!human) {
                socket.emit("actionError", { message: "Bạn chưa vào phòng test." });
                return;
            }

            const count = Number(data?.count || 10);
            const selectedRole = String(data?.role || "Dân");
            if (!ALLOWED_SIZES.includes(count)) {
                socket.emit("actionError", { message: "Số người phải từ 6 đến 15." });
                return;
            }

            const validRoles = testAllowedRoles(count);
            if (!validRoles.includes(selectedRole)) {
                socket.emit("actionError", { message: selectedRole + " không có trong bàn " + count + " người." });
                return;
            }

            // Bản test cá nhân: giữ đúng người đang bấm Start, xoá bot/người cũ khỏi lobby.
            room.players = [human];
            human.connected = true;
            human.leftGame = false;
            human.ready = false;
            human.alive = true;
            human.role = null;
            human.loverId = null;
            human.deathReasons = [];
            human.used = { witchSave: false, witchPoison: false };
            human.seerUsedNight = false;
            human.dayVoteTargetId = null;
            human.isBot = false;

            room.hostId = human.id;
            room.testMode = true;
            room.testHumanId = human.id;
            room.testSelectedRole = selectedRole;
            room.testBotWolfNight = null;
            room.testBotWolfTargetId = null;

            for (let i = 1; i < count; i++) room.players.push(testBotPlayer(i));
            room.targetPlayerCount = count;

            const result = startGame();
            if (!result?.ok) {
                socket.emit("actionError", { message: result?.message || "Không thể bắt đầu Test Mode." });
                return;
            }

            socket.emit("testRoleMap", {
                selectedRole,
                count,
                players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role, isBot: !!p.isBot }))
            });
            addAdminLog("TEST MODE: " + human.name + " chọn " + selectedRole + ", bàn " + count + " người.");
        });
`;

patchOnce(
`        socket.emit("audioConfigChanged", publicAudioConfig());`,
`        socket.emit("audioConfigChanged", publicAudioConfig());` + TEST_EVENT,
"inject startTestGame event"
);

// ============================================================
// Let the normal production bootstrap patch our modified core.
// This keeps production rules in sync without duplicating server.js.
// ============================================================
const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function(file, ...args) {
    try {
        if (path.resolve(String(file)) === path.resolve(corePath)) return testCore;
    } catch (_) {}
    return originalReadFileSync.call(fs, file, ...args);
};

try {
    require("./server.js");
} finally {
    fs.readFileSync = originalReadFileSync;
}
