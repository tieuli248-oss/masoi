// ============================================================
// MA SOI BOT TEST SERVER - MULTI HUMAN TEST MODE
// Production server.js/server-core.js remain unchanged.
// ============================================================
const fs = require('fs');
const path = require('path');

const corePath = path.join(__dirname, 'server-core.js');
let testCore = fs.readFileSync(corePath, 'utf8');

function patchOnce(oldText, newText, label){
  if(!testCore.includes(oldText)) throw new Error('[TEST] Missing patch anchor: '+label);
  testCore = testCore.replace(oldText,newText);
}

// Old public test URL is retired: browsers go to the single bot-ui URL.
patchOnce(
`    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    res.end("🐺 Ma Sói Online Server OK");`,
`    if (rawUrl === "/" || rawUrl.startsWith("/?") || rawUrl === "/index.html") {
        res.writeHead(302, { "Location": "https://masoi-bot-ui.onrender.com", "Cache-Control": "no-store" });
        return res.end();
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    res.end("🧪 Ma Sói Bot backend OK");`,
'retire old public test url'
);

// Force roles selected by Host for any real test devices. Remaining roles stay random.
patchOnce(
`    shuffledPlayers.forEach(
        (player, index) => {`,
`    if (room.testMode && room.testRoleAssignments) {
        const assignments = Object.entries(room.testRoleAssignments)
            .filter(([playerId, role]) => !!findPlayer(playerId) && !!role);
        let fixedPos = 0;
        for (const [playerId, role] of assignments) {
            const playerIndex = shuffledPlayers.findIndex((p, i) => i >= fixedPos && p.id === playerId);
            const roleIndex = shuffledRoles.findIndex((r, i) => i >= fixedPos && r === role);
            if (playerIndex < 0 || roleIndex < 0) continue;
            [shuffledPlayers[fixedPos], shuffledPlayers[playerIndex]] = [shuffledPlayers[playerIndex], shuffledPlayers[fixedPos]];
            [shuffledRoles[fixedPos], shuffledRoles[roleIndex]] = [shuffledRoles[roleIndex], shuffledRoles[fixedPos]];
            fixedPos++;
        }
    }

    shuffledPlayers.forEach(
        (player, index) => {`,
'lock selected roles for real test devices'
);

const TEST_HELPERS = `
/* =========================================================
   TEST MODE / SERVER-SIDE BOTS
========================================================= */
function testAllowedRoles(count) {
    return [...new Set(getRoleComposition(count))];
}

function testBotPlayer(index) {
    const stamp = Date.now() + "-" + index + "-" + Math.random().toString(36).slice(2, 8);
    return {
        id: "BOT-" + stamp,
        name: "🤖 Bot " + String(index).padStart(2, "0"),
        deviceId: "test-bot-" + stamp,
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
        isBot: true,
        _testGuardNight: null,
        _testSeerNight: null,
        _testWitchPoisonNight: null,
        _testWitchSaveNight: null
    };
}

function testHostPlayer(){
    return findPlayer(room.hostId) || null;
}

function testEmitHostEvent(text){
    if (!text) return;
    const host = testHostPlayer();
    if (!host) return;
    try { storeEventHistory(text, [host], "event"); } catch (_) {}
    try { io.to(host.id).emit("testBotEvent", { text, time: Date.now() }); } catch (_) {}
}

function chooseTestBotTarget(candidates, preferred = null, chance = 0.55) {
    if (!candidates.length) return null;
    if (preferred && candidates.some(p => p.id === preferred.id) && Math.random() < chance) return preferred;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function runTestBotNight() {
    if (!room.testMode || !room.started || room.phase !== "night" || !room.night) return;
    const host = testHostPlayer();

    if (!room.night.witchActionOpen) {
        const botWolves = room.players.filter(p => p.isBot && p.alive && p.role === "Sói");
        const wolfCandidates = alivePlayers().filter(p => p.role !== "Sói");
        if (botWolves.length && wolfCandidates.length) {
            if (room.testBotWolfNight !== room.nightNumber || !findPlayer(room.testBotWolfTargetId)?.alive) {
                const preferred = host?.alive && host.role !== "Sói" ? host : null;
                const target = chooseTestBotTarget(wolfCandidates, preferred, 0.35);
                room.testBotWolfNight = room.nightNumber;
                room.testBotWolfTargetId = target?.id || null;
            }
            const target = findPlayer(room.testBotWolfTargetId);
            if (target?.alive) {
                for (const wolf of botWolves) {
                    if (room.night.wolfVotes.get(wolf.id) !== target.id) {
                        room.night.wolfVotes.set(wolf.id, target.id);
                        testEmitHostEvent("🤖 " + wolf.name + " (Sói) chọn cắn " + target.name + ".");
                    }
                }
                if (typeof sendWolfVoteState === "function") sendWolfVoteState();
            }
        }

        const botGuards = room.players.filter(p => p.isBot && p.alive && p.role === "Bảo vệ");
        for (const guard of botGuards) {
            if (guard._testGuardNight === room.nightNumber) continue;
            const candidates = alivePlayers().filter(p => p.id !== room.night.previousGuardTargetId);
            const target = chooseTestBotTarget(candidates, host?.alive ? host : null, 0.25);
            if (!target) continue;
            room.night.guardTargetId = target.id;
            guard._testGuardNight = room.nightNumber;
            testEmitHostEvent("🤖 " + guard.name + " (Bảo vệ) bảo vệ " + target.name + ".");
        }

        const botSeers = room.players.filter(p => p.isBot && p.alive && p.role === "Tiên tri");
        for (const seer of botSeers) {
            if (seer._testSeerNight === room.nightNumber) continue;
            const candidates = alivePlayers().filter(p => p.id !== seer.id);
            const target = chooseTestBotTarget(candidates, null);
            if (!target) continue;
            seer.seerUsedNight = true;
            seer._testSeerNight = room.nightNumber;
            const result = target.role === "Dân" ? "THIỆN" : "KHÔNG RÕ";
            testEmitHostEvent("🤖 " + seer.name + " (Tiên tri) soi " + target.name + " → " + result + ".");
        }
    }

    const botWitches = room.players.filter(p => p.isBot && p.alive && p.role === "Phù thủy");
    for (const witch of botWitches) {
        if (!room.night.witchActionOpen) continue;
        if (room.night.witchActionMode === "poison" && !witch.used.witchPoison && witch._testWitchPoisonNight !== room.nightNumber) {
            witch._testWitchPoisonNight = room.nightNumber;
            if (Math.random() < 0.35) {
                const candidates = alivePlayers().filter(p => p.id !== witch.id);
                const target = chooseTestBotTarget(candidates, null);
                if (target) {
                    witch.used.witchPoison = true;
                    room.night.witchPoisonTargetId = target.id;
                    room.night.witchPoisonDraftTargetId = target.id;
                    testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) dùng ĐỘC lên " + target.name + ".");
                }
            } else {
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) bỏ qua bình ĐỘC đêm " + room.nightNumber + ".");
            }
        }
        if (room.night.witchActionMode === "save" && !witch.used.witchSave && witch._testWitchSaveNight !== room.nightNumber) {
            witch._testWitchSaveNight = room.nightNumber;
            const bitten = findPlayer(room.night.wolfTargetId);
            if (bitten?.alive && Math.random() < 0.50) {
                witch.used.witchSave = true;
                room.night.witchSave = true;
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) CỨU " + bitten.name + ".");
            } else {
                testEmitHostEvent("🤖 " + witch.name + " (Phù thủy) không cứu đêm " + room.nightNumber + ".");
            }
        }
    }
}

function runTestBotDayVote() {
    if (!room.testMode || !room.started || room.phase !== "dayVote") return;
    const host = testHostPlayer();
    const bots = room.players.filter(p => p.isBot && p.alive);
    for (const bot of bots) {
        if (room.dayVotes.has(bot.id)) continue;
        const candidates = alivePlayers().filter(p => p.id !== bot.id);
        if (!candidates.length) continue;
        let preferred = null;
        if (bot.role === "Sói") {
            const nonWolves = candidates.filter(p => p.role !== "Sói");
            if (host?.alive && host.role !== "Sói" && nonWolves.some(p => p.id === host.id) && Math.random() < 0.30) preferred = host;
            if (!preferred && nonWolves.length) preferred = nonWolves[Math.floor(Math.random() * nonWolves.length)];
        } else {
            const wolves = candidates.filter(p => p.role === "Sói");
            if (wolves.length && Math.random() < 0.62) preferred = wolves[Math.floor(Math.random() * wolves.length)];
        }
        const target = chooseTestBotTarget(candidates, preferred);
        if (!target) continue;
        room.dayVotes.set(bot.id, target.id);
        bot.dayVoteTargetId = target.id;
        testEmitHostEvent("🤖 " + bot.name + " (" + bot.role + ") bỏ phiếu cho " + target.name + ".");
    }
    if (typeof sendDayVoteState === "function") sendDayVoteState();
    if (typeof broadcastPlayers === "function") broadcastPlayers();
}

const testBotTicker = setInterval(() => {
    try { runTestBotNight(); runTestBotDayVote(); }
    catch (err) { console.error("[TEST BOT]", err); }
}, 1100);
if (typeof testBotTicker.unref === "function") testBotTicker.unref();
`;

patchOnce(
`io.on(
    "connection",`,
TEST_HELPERS + `\nio.on(\n    "connection",`,
'inject multi-human bot helpers'
);

const TEST_EVENTS = `

        socket.on("startTestGame", data => {
            if (room.started) {
                socket.emit("actionError", { message: "Ván đang chạy. Hãy dừng test trước." });
                return;
            }
            const starter = findPlayer(socket.data.playerId);
            if (!starter) {
                socket.emit("actionError", { message: "Bạn chưa vào phòng test." });
                return;
            }
            if (starter.id !== room.hostId) {
                socket.emit("actionError", { message: "Chỉ Host mới được cấu hình và bắt đầu Test Mode." });
                return;
            }

            const count = Number(data?.count || 10);
            if (!ALLOWED_SIZES.includes(count)) {
                socket.emit("actionError", { message: "Số người phải từ 6 đến 15." });
                return;
            }

            const humans = room.players.filter(p => !p.isBot && p.connected !== false && p.leftGame !== true);
            if (humans.length > count) {
                socket.emit("actionError", { message: "Đang có " + humans.length + " máy thật, nhiều hơn bàn " + count + " người." });
                return;
            }

            const composition = getRoleComposition(count);
            const remainingCounts = {};
            for (const role of composition) remainingCounts[role] = (remainingCounts[role] || 0) + 1;

            const requested = data?.roleAssignments && typeof data.roleAssignments === "object" ? data.roleAssignments : {};
            const cleanAssignments = {};
            for (const human of humans) {
                const role = String(requested[human.id] || "").trim();
                if (!role || role === "Random") continue;
                if (!testAllowedRoles(count).includes(role)) {
                    socket.emit("actionError", { message: role + " không có trong bàn " + count + " người." });
                    return;
                }
                if (!remainingCounts[role]) {
                    socket.emit("actionError", { message: "Không đủ slot vai " + role + " cho các máy thật đã chọn." });
                    return;
                }
                remainingCounts[role]--;
                cleanAssignments[human.id] = role;
            }

            room.players = humans;
            for (const human of humans) {
                human.connected = true;
                human.leftGame = false;
                human.ready = true;
                human.alive = true;
                human.role = null;
                human.loverId = null;
                human.deathReasons = [];
                human.used = { witchSave: false, witchPoison: false };
                human.seerUsedNight = false;
                human.dayVoteTargetId = null;
                human.isBot = false;
            }

            room.hostId = starter.id;
            room.testMode = true;
            room.testHumanId = starter.id;
            room.testRoleAssignments = cleanAssignments;
            room.testBotWolfNight = null;
            room.testBotWolfTargetId = null;

            const botsNeeded = count - humans.length;
            for (let i = 1; i <= botsNeeded; i++) room.players.push(testBotPlayer(i));
            room.targetPlayerCount = count;

            const result = startGame();
            if (!result?.ok) {
                socket.emit("actionError", { message: result?.message || "Không thể bắt đầu Test Mode." });
                return;
            }

            socket.emit("testRoleMap", {
                count,
                humanCount: humans.length,
                botCount: botsNeeded,
                players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role, isBot: !!p.isBot }))
            });
            testEmitHostEvent("🧪 Host " + starter.name + " bắt đầu bàn test " + count + " người: " + humans.length + " máy thật + " + botsNeeded + " Bot.");
            addAdminLog("TEST MODE MULTI: " + humans.length + " humans, " + botsNeeded + " bots, table " + count + ".");
        });

        socket.on("stopTestGame", () => {
            const player = findPlayer(socket.data.playerId);
            if (!player || player.id !== room.hostId) {
                socket.emit("actionError", { message: "Chỉ Host mới được dừng toàn bộ Test Mode." });
                return;
            }
            const humans = room.players.filter(p => !p.isBot);
            io.emit("testStopped", { message: "Host đã dừng Test Mode." });
            room.players = humans;
            room.testMode = false;
            room.testHumanId = null;
            room.testRoleAssignments = {};
            room.testBotWolfNight = null;
            room.testBotWolfTargetId = null;
            resetRoom("HOST STOP TEST MODE");
            addAdminLog("TEST MODE stopped by host " + player.name + ".");
        });
`;

patchOnce(
`        socket.emit("audioConfigChanged", publicAudioConfig());`,
`        socket.emit("audioConfigChanged", publicAudioConfig());` + TEST_EVENTS,
'inject start/stop test events'
);

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function(file, ...args){
    try { if (path.resolve(String(file)) === path.resolve(corePath)) return testCore; } catch (_) {}
    return originalReadFileSync.call(fs, file, ...args);
};
try { require('./server.js'); }
finally { fs.readFileSync = originalReadFileSync; }
