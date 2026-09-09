const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const ROLE_INFO = {
    wolf: {
        name: "Ma Sói",
        icon: "🐺"
    },
    seer: {
        name: "Tiên Tri",
        icon: "🔮"
    },
    witch: {
        name: "Phù Thủy",
        icon: "🧙"
    },
    hunter: {
        name: "Thợ Săn",
        icon: "🔫"
    },
    villager: {
        name: "Dân Làng",
        icon: "👨"
    }
};

const ROOM_NAMES = [
    "Làng Trăng Máu",
    "Làng Trăng Tím",
    "Làng Rừng Sương",
    "Làng Huyết Nguyệt",
    "Làng Đêm Sương",
    "Làng Bí Ẩn",
    "Làng Sói Đêm",
    "Làng Miller",
    "Làng Ánh Trăng",
    "Làng Bóng Tối",
    "Làng Sương Mù",
    "Làng Hoang Vắng",
    "Làng Đêm Đen",
    "Làng Nguyệt Thực",
    "Làng Hoa Máu"
];

app.get("/", (req, res) => {
    res.send("🐺 MA SÓI SERVER ONLINE!");
});

function randomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
}

function createRoomCode() {
    let code;

    do {
        code = randomCode();
    } while (rooms.has(code));

    return code;
}

function randomRoomName() {
    return ROOM_NAMES[
        Math.floor(Math.random() * ROOM_NAMES.length)
    ];
}

function shuffle(array) {
    const a = [...array];

    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [a[i], a[j]] = [a[j], a[i]];
    }

    return a;
}

function generateRoles(count) {
    const roles = [];

    const wolfCount =
        Math.max(2, Math.floor(count / 4));

    for (let i = 0; i < wolfCount; i++) {
        roles.push("wolf");
    }

    if (count >= 6) {
        roles.push("seer");
        roles.push("witch");
    }

    if (count >= 8) {
        roles.push("hunter");
    }

    while (roles.length < count) {
        roles.push("villager");
    }

    return shuffle(roles);
}

function publicPlayers(room) {
    return Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        isHost: p.id === room.host
    }));
}

function publicDeaths(room) {
    return room.deaths.map(d => ({
        name: d.name,
        role: d.role,
        reason: d.reason
    }));
}

function publicRoom(room) {
    return {
        code: room.code,
        name: room.name,
        maxPlayers: room.maxPlayers,
        phase: room.phase,
        step: room.step,
        day: room.day,
        players: publicPlayers(room),
        deaths: publicDeaths(room),
        logs: room.logs,
        votesCount: Object.keys(room.votes).length
    };
}

function sendRoom(room) {
    io.to(room.code).emit("roomState", publicRoom(room));
}

function addLog(room, text) {
    room.logs.push(text);

    if (room.logs.length > 100) {
        room.logs.shift();
    }
}

function getRoom(socket) {
    const code = socket.data.room;

    if (!code) return null;

    return rooms.get(code) || null;
}

function getAlivePlayers(room) {
    return Array.from(room.players.values())
        .filter(p => p.alive);
}

function getPlayer(room, id) {
    return room.players.get(id);
}

function isAlive(room, id) {
    const player = getPlayer(room, id);

    return !!player && player.alive;
}

function aliveWolves(room) {
    return getAlivePlayers(room)
        .filter(p => p.role === "wolf");
}

function checkWinner(room) {
    const alive = getAlivePlayers(room);

    const wolves =
        alive.filter(p => p.role === "wolf").length;

    const others =
        alive.filter(p => p.role !== "wolf").length;

    if (wolves === 0) {
        return "villagers";
    }

    if (wolves >= others) {
        return "wolves";
    }

    return null;
}

function endGame(room, winner) {
    room.phase = "ended";
    room.step = "ended";

    if (winner === "wolves") {
        addLog(
            room,
            "🐺 PHE MA SÓI CHIẾN THẮNG!"
        );
    } else {
        addLog(
            room,
            "🏘️ PHE DÂN LÀNG CHIẾN THẮNG!"
        );
    }

    io.to(room.code).emit("gameEnded", {
        winner,
        players: Array.from(room.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            alive: p.alive
        })),
        logs: room.logs
    });

    sendRoom(room);
}

function assignRoles(room) {
    const roles = generateRoles(room.players.size);

    const players = Array.from(room.players.values());

    players.forEach((player, index) => {
        player.role = roles[index];
        player.alive = true;
    });
}

function sendRoles(room) {
    for (const player of room.players.values()) {
        io.to(player.id).emit("roleAssigned", {
            role: player.role,
            name: ROLE_INFO[player.role].name,
            icon: ROLE_INFO[player.role].icon,
            description: getRoleDescription(player.role)
        });
    }

    const wolves = Array.from(room.players.values())
        .filter(p => p.role === "wolf")
        .map(p => ({
            id: p.id,
            name: p.name
        }));

    for (const wolf of aliveWolves(room)) {
        io.to(wolf.id).emit("wolfTeam", wolves);
    }
}

function getRoleDescription(role) {
    const descriptions = {
        wolf:
            "Mỗi đêm, Ma Sói chọn một người để tấn công.",

        seer:
            "Mỗi đêm có thể kiểm tra vai trò của một người.",

        witch:
            "Có một bình cứu và một bình độc.",

        hunter:
            "Khi chết, Thợ Săn có thể chọn một người chết cùng.",

        villager:
            "Không có kỹ năng đặc biệt. Hãy tìm Ma Sói."
    };

    return descriptions[role] || "";
}

function startNight(room) {
    room.phase = "night";
    room.step = "wolf";

    room.wolfTarget = null;
    room.seerTarget = null;
    room.witchTarget = null;
    room.witchSave = false;
    room.hunterTarget = null;

    room.witchSaveAvailable = room.witchSaveAvailable !== false;
    room.witchKillAvailable = room.witchKillAvailable !== false;

    addLog(
        room,
        `🌙 Đêm ${room.day} bắt đầu.`
    );

    sendRoom(room);
}

function startDay(room) {
    room.phase = "day";
    room.step = "discussion";

    room.votes = {};

    sendRoom(room);
}

function goToNextNight(room) {
    room.day++;

    startNight(room);
}

function resolveNight(room) {
    const deaths = [];

    /*
       Sói giết
    */
    if (
        room.wolfTarget &&
        !room.witchSave
    ) {
        const target =
            getPlayer(room, room.wolfTarget);

        if (target && target.alive) {
            target.alive = false;

            deaths.push({
                player: target,
                reason:
                    "🐺 Bị Ma Sói tấn công trong đêm."
            });
        }
    }

    /*
       Phù thủy độc
    */
    if (room.witchTarget) {
        const target =
            getPlayer(room, room.witchTarget);

        if (target && target.alive) {
            target.alive = false;

            deaths.push({
                player: target,
                reason:
                    "🧙 Bị Phù Thủy dùng bình độc."
            });
        }
    }

    /*
       Ghi nhận người chết
    */
    for (const d of deaths) {
        room.deaths.push({
            name: d.player.name,
            role: d.player.role,
            reason: d.reason
        });

        addLog(
            room,
            `💀 ${d.player.name} CHẾT — ${d.reason}`
        );
    }

    if (deaths.length === 0) {
        addLog(
            room,
            "☀️ Đêm qua không có ai chết."
        );
    }

    const winner = checkWinner(room);

    if (winner) {
        endGame(room, winner);
        return;
    }

    /*
       Nếu Thợ Săn chết thì cho Thợ Săn bắn.
    */
    const hunterDeath =
        deaths.find(
            d => d.player.role === "hunter"
        );

    if (hunterDeath) {
        room.hunterPending = hunterDeath.player.id;
        room.phase = "night";
        room.step = "hunter";

        io.to(hunterDeath.player.id).emit(
            "hunterTurn"
        );

        sendRoom(room);

        return;
    }

    startDay(room);
}

function resolveHunter(room, targetId) {
    const hunterId = room.hunterPending;

    const hunter = getPlayer(room, hunterId);

    if (!hunter) {
        startDay(room);
        return;
    }

    const target = getPlayer(room, targetId);

    if (
        !target ||
        !target.alive ||
        target.id === hunter.id
    ) {
        return;
    }

    target.alive = false;

    room.deaths.push({
        name: target.name,
        role: target.role,
        reason:
            "🔫 Bị Thợ Săn kéo chết cùng."
    });

    addLog(
        room,
        `💀 ${target.name} CHẾT — 🔫 Bị Thợ Săn kéo chết cùng.`
    );

    room.hunterPending = null;

    const winner = checkWinner(room);

    if (winner) {
        endGame(room, winner);
        return;
    }

    startDay(room);
}

function finishVote(room) {
    const counts = {};

    Object.values(room.votes).forEach(targetId => {
        counts[targetId] =
            (counts[targetId] || 0) + 1;
    });

    let targetId = null;
    let highest = 0;

    for (const [id, count] of Object.entries(counts)) {
        if (count > highest) {
            highest = count;
            targetId = id;
        }
    }

    if (!targetId) {
        addLog(
            room,
            "🗳️ Không có ai bị loại."
        );

        goToNextNight(room);
        return;
    }

    const target = getPlayer(room, targetId);

    if (!target || !target.alive) {
        goToNextNight(room);
        return;
    }

    target.alive = false;

    const reason =
        "🗳️ Bị dân làng bỏ phiếu loại.";

    room.deaths.push({
        name: target.name,
        role: target.role,
        reason
    });

    addLog(
        room,
        `💀 ${target.name} CHẾT — ${reason}`
    );

    const winner = checkWinner(room);

    if (winner) {
        endGame(room, winner);
        return;
    }

    /*
       Nếu người bị vote là Thợ Săn
       thì cho bắn ngay.
    */
    if (target.role === "hunter") {
        room.hunterPending = target.id;
        room.phase = "day";
        room.step = "hunter";

        io.to(target.id).emit("hunterTurn");

        sendRoom(room);
        return;
    }

    goToNextNight(room);
}

io.on("connection", socket => {

    console.log(
        "🟢 Người chơi kết nối:",
        socket.id
    );

    /*
       TẠO PHÒNG
    */
    socket.on("createRoom", data => {

        const name =
            String(data?.name || "").trim();

        const maxPlayers =
            Number(data?.maxPlayers || 6);

        if (!name) {
            socket.emit(
                "errorMessage",
                "Vui lòng nhập tên!"
            );
            return;
        }

        if (
            maxPlayers < 6 ||
            maxPlayers > 30
        ) {
            socket.emit(
                "errorMessage",
                "Số người phải từ 6 đến 30."
            );
            return;
        }

        const code = createRoomCode();

        const room = {
            code,
            name: randomRoomName(),
            maxPlayers,

            host: socket.id,

            phase: "lobby",
            step: "lobby",
            day: 0,

            players: new Map(),

            logs: [],
            deaths: [],
            votes: {},

            wolfTarget: null,
            seerTarget: null,
            witchTarget: null,
            witchSave: false,

            witchSaveAvailable: true,
            witchKillAvailable: true,

            hunterPending: null
        };

        room.players.set(socket.id, {
            id: socket.id,
            name,
            role: null,
            alive: true
        });

        rooms.set(code, room);

        socket.join(code);
        socket.data.room = code;

        addLog(
            room,
            `👑 ${name} đã tạo phòng.`
        );

        socket.emit(
            "roomCreated",
            {
                code,
                name: room.name,
                host: true
            }
        );

        sendRoom(room);

        console.log(
            `🏠 Tạo phòng ${code}`
        );
    });

    /*
       THAM GIA PHÒNG
    */
    socket.on("joinRoom", data => {

        const name =
            String(data?.name || "").trim();

        const code =
            String(data?.room || "")
                .trim()
                .toUpperCase();

        if (!name || !code) {
            socket.emit(
                "errorMessage",
                "Vui lòng nhập tên và mã phòng!"
            );
            return;
        }

        const room = rooms.get(code);

        if (!room) {
            socket.emit(
                "errorMessage",
                "Không tìm thấy phòng!"
            );
            return;
        }

        if (room.phase !== "lobby") {
            socket.emit(
                "errorMessage",
                "Game đã bắt đầu!"
            );
            return;
        }

        if (
            room.players.size >=
            room.maxPlayers
        ) {
            socket.emit(
                "errorMessage",
                "Phòng đã đủ người!"
            );
            return;
        }

        const duplicate =
            Array.from(room.players.values())
                .some(
                    p =>
                        p.name.toLowerCase() ===
                        name.toLowerCase()
                );

        if (duplicate) {
            socket.emit(
                "errorMessage",
                "Tên này đã có trong phòng!"
            );
            return;
        }

        room.players.set(socket.id, {
            id: socket.id,
            name,
            role: null,
            alive: true
        });

        socket.join(code);
        socket.data.room = code;

        addLog(
            room,
            `👤 ${name} đã vào phòng.`
        );

        socket.emit(
            "roomJoined",
            {
                code,
                name: room.name,
                host: false
            }
        );

        sendRoom(room);

        console.log(
            `👤 ${name} vào phòng ${code}`
        );
    });

    /*
       BẮT ĐẦU GAME
    */
    socket.on("startGame", () => {

        const room = getRoom(socket);

        if (!room) return;

        if (room.host !== socket.id) {
            socket.emit(
                "errorMessage",
                "Chỉ quản trò mới có thể bắt đầu!"
            );
            return;
        }

        if (room.players.size < 6) {
            socket.emit(
                "errorMessage",
                "Cần ít nhất 6 người chơi!"
            );
            return;
        }

        assignRoles(room);

        room.day = 1;
        room.phase = "role";
        room.step = "role";

        room.deaths = [];
        room.votes = {};

        room.wolfTarget = null;
        room.seerTarget = null;
        room.witchTarget = null;
        room.witchSave = false;

        room.witchSaveAvailable = true;
        room.witchKillAvailable = true;

        addLog(
            room,
            "🎭 Quản trò đã chia vai."
        );

        sendRoles(room);

        io.to(room.code).emit(
            "rolePhase"
        );

        sendRoom(room);
    });

    /*
       NGƯỜI CHƠI ĐÃ XEM VAI
    */
    socket.on("roleReady", () => {

        const room = getRoom(socket);

        if (!room) return;

        if (room.host !== socket.id) return;

        startNight(room);
    });

    /*
       SÓI CHỌN
    */
    socket.on("wolfAction", targetId => {

        const room = getRoom(socket);

        if (!room) return;

        const player = getPlayer(
            room,
            socket.id
        );

        if (
            !player ||
            !player.alive ||
            player.role !== "wolf"
        ) {
            return;
        }

        if (room.phase !== "night") return;
        if (room.step !== "wolf") return;

        const target = getPlayer(
            room,
            targetId
        );

        if (
            !target ||
            !target.alive ||
            target.role === "wolf"
        ) {
            socket.emit(
                "errorMessage",
                "Mục tiêu không hợp lệ!"
            );
            return;
        }

        room.wolfTarget = target.id;

        addLog(
            room,
            "🐺 Ma Sói đã chọn mục tiêu."
        );

        room.step = "seer";

        sendRoom(room);
    });

    /*
       TIÊN TRI
    */
    socket.on("seerAction", targetId => {

        const room = getRoom(socket);

        if (!room) return;

        const player = getPlayer(
            room,
            socket.id
        );

        if (
            !player ||
            !player.alive ||
            player.role !== "seer"
        ) {
            return;
        }

        if (
            room.phase !== "night" ||
            room.step !== "seer"
        ) {
            return;
        }

        const target = getPlayer(
            room,
            targetId
        );

        if (
            !target ||
            !target.alive ||
            target.id === player.id
        ) {
            return;
        }

        room.seerTarget = target.id;

        socket.emit(
            "seerResult",
            {
                targetId: target.id,
                targetName: target.name,
                isWolf: target.role === "wolf"
            }
        );

        room.step = "witch";

        sendRoom(room);
    });

    /*
       PHÙ THỦY NHẬN THÔNG TIN
    */
    socket.on("requestWitchInfo", () => {

        const room = getRoom(socket);

        if (!room) return;

        const player = getPlayer(
            room,
            socket.id
        );

        if (
            !player ||
            player.role !== "witch"
        ) {
            return;
        }

        if (
            room.phase !== "night" ||
            room.step !== "witch"
        ) {
            return;
        }

        let target = null;

        if (room.wolfTarget) {
            target =
                getPlayer(
                    room,
                    room.wolfTarget
                );
        }

        socket.emit(
            "witchInfo",
            {
                target: target
                    ? {
                        id: target.id,
                        name: target.name
                    }
                    : null,

                saveAvailable:
                    room.witchSaveAvailable,

                killAvailable:
                    room.witchKillAvailable
            }
        );
    });

    /*
       PHÙ THỦY CỨU
    */
    socket.on("witchSave", () => {

        const room = getRoom(socket);

        if (!room) return;

        const player =
            getPlayer(room, socket.id);

        if (
            !player ||
            player.role !== "witch"
        ) {
            return;
        }

        if (!room.witchSaveAvailable) {
            socket.emit(
                "errorMessage",
                "Bạn đã dùng bình cứu!"
            );
            return;
        }

        if (
            room.phase !== "night" ||
            room.step !== "witch"
        ) {
            return;
        }

        room.witchSave = true;
        room.witchSaveAvailable = false;

        addLog(
            room,
            "🧙 Phù Thủy đã dùng bình cứu."
        );

        room.step = "end_night";

        sendRoom(room);
    });

    /*
       PHÙ THỦY GIẾT
    */
    socket.on("witchKill", targetId => {

        const room = getRoom(socket);

        if (!room) return;

        const player =
            getPlayer(room, socket.id);

        if (
            !player ||
            player.role !== "witch"
        ) {
            return;
        }

        if (!room.witchKillAvailable) {
            socket.emit(
                "errorMessage",
                "Bạn đã dùng bình độc!"
            );
            return;
        }

        const target =
            getPlayer(room, targetId);

        if (
            !target ||
            !target.alive ||
            target.id === socket.id
        ) {
            return;
        }

        room.witchTarget = target.id;
        room.witchKillAvailable = false;

        addLog(
            room,
            "🧙 Phù Thủy đã dùng bình độc."
        );

        room.step = "end_night";

        sendRoom(room);
    });

    /*
       PHÙ THỦY BỎ QUA
    */
    socket.on("witchSkip", () => {

        const room = getRoom(socket);

        if (!room) return;

        const player =
            getPlayer(room, socket.id);

        if (
            !player ||
            player.role !== "witch"
        ) {
            return;
        }

        if (
            room.phase !== "night" ||
            room.step !== "witch"
        ) {
            return;
        }

        room.step = "end_night";

        sendRoom(room);
    });

    /*
       QUẢN TRÒ BỎ QUA BƯỚC
    */
    socket.on("hostSkip", step => {

        const room = getRoom(socket);

        if (!room) return;

        if (room.host !== socket.id) return;

        if (room.phase !== "night") return;

        if (step === "wolf") {
            room.wolfTarget = null;
            room.step = "seer";
        }

        else if (step === "seer") {
            room.step = "witch";
        }

        else if (step === "witch") {
            room.step = "end_night";
        }

        sendRoom(room);
    });

    /*
       BÌNH MINH
    */
    socket.on("resolveNight", () => {

        const room = getRoom(socket);

        if (!room) return;

        if (room.host !== socket.id) return;

        if (
            room.phase !== "night" ||
            room.step !== "end_night"
        ) {
            return;
        }

        resolveNight(room);
    });

    /*
       BẮT ĐẦU VOTE
    */
    socket.on("startVote", () => {

        const room = getRoom(socket);

        if (!room) return;

        if (room.host !== socket.id) return;

        if (
            room.phase !== "day" ||
            room.step !== "discussion"
        ) {
            return;
        }

        room.step = "vote";
        room.votes = {};

        addLog(
            room,
            "🗳️ Quản trò đã bắt đầu bỏ phiếu."
        );

        sendRoom(room);
    });

    /*
       VOTE
    */
    socket.on("vote", targetId => {

        const room = getRoom(socket);

        if (!room) return;

        const voter =
            getPlayer(room, socket.id);

        const target =
            getPlayer(room, targetId);

        if (
            !voter ||
            !voter.alive
        ) {
            socket.emit(
                "errorMessage",
                "Bạn không thể bỏ phiếu."
            );
            return;
        }

        if (
            !target ||
            !target.alive ||
            target.id === voter.id
        ) {
            socket.emit(
                "errorMessage",
                "Mục tiêu không hợp lệ."
            );
            return;
        }

        if (
            room.phase !== "day" ||
            room.step !== "vote"
        ) {
            return;
        }

        room.votes[voter.id] = target.id;

        io.to(room.code).emit(
            "voteUpdate",
            {
                count:
                    Object.keys(room.votes).length
            }
        );

        sendRoom(room);
    });

    /*
       CHỐT PHIẾU
    */
    socket.on("finishVote", () => {

        const room = getRoom(socket);

        if (!room) return;

        if (room.host !== socket.id) return;

        if (
            room.phase !== "day" ||
            room.step !== "vote"
        ) {
            return;
        }

        finishVote(room);
    });

    /*
       THỢ SĂN
    */
    socket.on("hunterShoot", targetId => {

        const room = getRoom(socket);

        if (!room) return;

        if (room.hunterPending !== socket.id) {
            return;
        }

        const target =
            getPlayer(room, targetId);

        if (
            !target ||
            !target.alive ||
            target.id === socket.id
        ) {
            return;
        }

        resolveHunter(room, targetId);
    });

    socket.on("hunterSkip", () => {

        const room = getRoom(socket);

        if (!room) return;

        if (room.hunterPending !== socket.id) {
            return;
        }

        room.hunterPending = null;

        const winner = checkWinner(room);

        if (winner) {
            endGame(room, winner);
            return;
        }

        startDay(room);
    });

    /*
       CHƠI LẠI
    */
    socket.on("restartGame", () => {

        const room = getRoom(socket);

        if (!room) return;

        if (room.host !== socket.id) return;

        room.phase = "lobby";
        room.step = "lobby";
        room.day = 0;

        room.logs = [];
        room.deaths = [];
        room.votes = {};

        room.wolfTarget = null;
        room.seerTarget = null;
        room.witchTarget = null;
        room.witchSave = false;

        room.witchSaveAvailable = true;
        room.witchKillAvailable = true;

        room.hunterPending = null;

        for (const player of room.players.values()) {
            player.role = null;
            player.alive = true;
        }

        addLog(
            room,
            "🔄 Quản trò tạo ván mới."
        );

        io.to(room.code).emit(
            "backToLobby"
        );

        sendRoom(room);
    });

    /*
       CHAT
    */
    socket.on("chat", message => {

        const room = getRoom(socket);

        if (!room) return;

        const player =
            getPlayer(room, socket.id);

        if (!player) return;

        const text =
            String(message || "")
                .trim()
                .substring(0, 300);

        if (!text) return;

        io.to(room.code).emit(
            "chat",
            {
                name: player.name,
                message: text
            }
        );
    });

    /*
       NGẮT KẾT NỐI
    */
    socket.on("disconnect", () => {

        console.log(
            "🔴 Người chơi thoát:",
            socket.id
        );

        const room = getRoom(socket);

        if (!room) return;

        const player =
            getPlayer(room, socket.id);

        if (!player) return;

        room.players.delete(socket.id);

        addLog(
            room,
            `🚪 ${player.name} đã rời phòng.`
        );

        if (room.players.size === 0) {
            rooms.delete(room.code);

            console.log(
                `🗑️ Xóa phòng ${room.code}`
            );

            return;
        }

        /*
           Nếu host thoát,
           chuyển host cho người còn lại.
        */
        if (room.host === socket.id) {

            const newHost =
                room.players.keys().next().value;

            room.host = newHost;

            io.to(room.code).emit(
                "newHost",
                newHost
            );

            addLog(
                room,
                "👑 Quản trò mới đã được chọn."
            );
        }

        sendRoom(room);
    });
});

server.listen(PORT, () => {

    console.log(
        `🐺 Ma Sói Server đang chạy tại port ${PORT}`
    );

});
