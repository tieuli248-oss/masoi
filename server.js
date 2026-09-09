const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ===============================
// TÀI KHOẢN
// ===============================

const HOST_ID = "QuanTro";
const HOST_PASSWORD = "0909313631981962";

const PLAYER_ID = "nguoichoi";
const PLAYER_PASSWORD = "123456";

// ===============================
// PHÒNG DUY NHẤT
// ===============================

const room = {
    name: "MA SÓI - PHÒNG CHÍNH",

    maxPlayers: 10,

    phase: "lobby",
    // lobby
    // role
    // night
    // day
    // ended

    round: 0,

    host: null,

    players: new Map(),

    logs: [],

    dayChat: [],

    wolfChat: [],

    votes: new Map(),

    nightKill: null
};

app.use(express.static(path.join(__dirname, "public")));

// ===============================
// HÀM HỖ TRỢ
// ===============================

function addLog(text) {
    room.logs.push({
        text,
        time: new Date().toLocaleTimeString("vi-VN")
    });

    if (room.logs.length > 100) {
        room.logs.shift();
    }
}

function getPublicPlayer(player) {
    return {
        id: player.id,
        name: player.name,
        alive: player.alive,
        connected: player.connected,
        isBot: player.isBot
    };
}

function getPublicState() {

    return {
        roomName: room.name,

        maxPlayers: room.maxPlayers,

        phase: room.phase,

        round: room.round,

        hostName: room.host
            ? room.host.name
            : null,

        players: [...room.players.values()]
            .map(getPublicPlayer),

        deaths: [...room.players.values()]
            .filter(p => !p.alive)
            .map(getPublicPlayer),

        logs: room.logs.slice(-50)
    };
}

function broadcastState() {
    io.emit("state", getPublicState());
}

function getAlivePlayers() {
    return [...room.players.values()]
        .filter(p => p.alive);
}

function getAliveRealPlayers() {
    return [...room.players.values()]
        .filter(p => p.alive && !p.isBot);
}

// ===============================
// CHIA VAI
// ===============================

function assignRoles() {

    const players = [...room.players.values()];

    const count = players.length;

    let wolfCount;

    if (count <= 7) {
        wolfCount = 2;
    }
    else if (count <= 10) {
        wolfCount = 2;
    }
    else if (count <= 14) {
        wolfCount = 3;
    }
    else if (count <= 18) {
        wolfCount = 4;
    }
    else if (count <= 22) {
        wolfCount = 5;
    }
    else {
        wolfCount = 6;
    }

    const roles = [];

    for (let i = 0; i < wolfCount; i++) {
        roles.push("wolf");
    }

    roles.push("seer");
    roles.push("doctor");

    while (roles.length < count) {
        roles.push("villager");
    }

    // Trộn vai
    roles.sort(() => Math.random() - 0.5);

    players.forEach((player, index) => {

        player.role = roles[index];

        player.alive = true;

    });
}

// ===============================
// KIỂM TRA THẮNG
// ===============================

function checkWinner() {

    const alive = getAlivePlayers();

    const wolves = alive.filter(
        p => p.role === "wolf"
    );

    const villagers = alive.filter(
        p => p.role !== "wolf"
    );

    if (wolves.length === 0) {

        room.phase = "ended";

        addLog("🏆 DÂN LÀNG THẮNG!");

        io.emit("winner", {
            winner: "villagers"
        });

        return true;
    }

    if (wolves.length >= villagers.length) {

        room.phase = "ended";

        addLog("🐺 SÓI THẮNG!");

        io.emit("winner", {
            winner: "wolves"
        });

        return true;
    }

    return false;
}

// ===============================
// SOCKET
// ===============================

io.on("connection", socket => {

    console.log("Client:", socket.id);

    // ===========================
    // LOGIN
    // ===========================

    socket.on("login", data => {

        const {
            account,
            password,
            name
        } = data;

        const username = String(name || "")
            .trim()
            .slice(0, 30);

        if (!username) {

            socket.emit(
                "loginError",
                "Vui lòng nhập tên."
            );

            return;
        }

        // ===========================
        // QUẢN TRÒ
        // ===========================

        if (
            account === HOST_ID &&
            password === HOST_PASSWORD
        ) {

            if (
                room.host &&
                room.host.socketId !== socket.id
            ) {

                socket.emit(
                    "loginError",
                    "Đã có Quản Trò trong phòng."
                );

                return;
            }

            room.host = {

                socketId: socket.id,

                name: username
            };

            socket.data.isHost = true;

            socket.emit("loginOk", {
                isHost: true
            });

            addLog(
                `👑 Quản Trò ${username} đã đăng nhập.`
            );

            broadcastState();

            return;
        }

        // ===========================
        // NGƯỜI CHƠI
        // ===========================

        if (
            account === PLAYER_ID &&
            password === PLAYER_PASSWORD
        ) {

            if (
                room.players.size >=
                room.maxPlayers
            ) {

                socket.emit(
                    "loginError",
                    "Phòng đã đủ người."
                );

                return;
            }

            const player = {

                id: socket.id,

                socketId: socket.id,

                name: username,

                role: null,

                alive: true,

                connected: true,

                isBot: false,

                hasVoted: false

            };

            room.players.set(
                socket.id,
                player
            );

            socket.data.playerId =
                socket.id;

            socket.data.isHost = false;

            socket.emit("loginOk", {
                isHost: false
            });

            addLog(
                `👤 ${username} đã vào phòng.`
            );

            broadcastState();

            return;
        }

        socket.emit(
            "loginError",
            "Sai ID hoặc mật khẩu."
        );
    });

    // ===========================
    // QUẢN TRÒ - SET SỐ NGƯỜI
    // ===========================

    socket.on(
        "host:setMaxPlayers",
        count => {

            if (!socket.data.isHost)
                return;

            count = Number(count);

            if (count < 6)
                count = 6;

            if (count > 30)
                count = 30;

            room.maxPlayers = count;

            addLog(
                `👑 Quản Trò đặt tối đa ${count} người.`
            );

            broadcastState();
        }
    );

    // ===========================
    // QUẢN TRÒ - THÊM BOT
    // ===========================

    socket.on(
        "host:addBot",
        name => {

            if (!socket.data.isHost)
                return;

            if (
                room.players.size >=
                room.maxPlayers
            ) {

                socket.emit(
                    "actionError",
                    "Phòng đã đủ người."
                );

                return;
            }

            let botName =
                String(name || "")
                    .trim()
                    .slice(0, 30);

            if (!botName) {

                botName =
                    `Người ảo ${room.players.size + 1}`;
            }

            const id =
                "BOT_" +
                Math.random()
                    .toString(36)
                    .slice(2, 10);

            room.players.set(id, {

                id,

                socketId: null,

                name: botName,

                role: null,

                alive: true,

                connected: true,

                isBot: true,

                hasVoted: false

            });

            addLog(
                `🤖 Đã thêm ${botName}.`
            );

            broadcastState();
        }
    );

    // ===========================
    // QUẢN TRÒ - KICK
    // ===========================

    socket.on(
        "host:kick",
        playerId => {

            if (!socket.data.isHost)
                return;

            const player =
                room.players.get(playerId);

            if (!player)
                return;

            if (player.socketId) {

                io.to(player.socketId)
                    .emit("kicked");
            }

            room.players.delete(playerId);

            addLog(
                `🚪 ${player.name} đã bị kích khỏi phòng.`
            );

            broadcastState();
        }
    );

    // ===========================
    // BẮT ĐẦU GAME
    // ===========================

    socket.on(
        "host:start",
        () => {

            if (!socket.data.isHost)
                return;

            const players =
                [...room.players.values()];

            if (players.length < 6) {

                socket.emit(
                    "actionError",
                    "Cần ít nhất 6 người."
                );

                return;
            }

            if (
                players.length >
                room.maxPlayers
            ) {

                socket.emit(
                    "actionError",
                    "Số người vượt giới hạn."
                );

                return;
            }

            room.round++;

            room.phase = "role";

            room.votes.clear();

            room.nightKill = null;

            room.dayChat = [];

            room.wolfChat = [];

            assignRoles();

            addLog(
                `🎭 Ván ${room.round} bắt đầu.`
            );

            // Gửi vai trò RIÊNG
            for (
                const player
                of players
            ) {

                if (player.socketId) {

                    io.to(player.socketId)
                        .emit(
                            "privateRole",
                            {
                                role: player.role
                            }
                        );
                }
            }

            broadcastState();
        }
    );

    // ===========================
    // XÁC NHẬN NHỚ VAI
    // ===========================

    socket.on(
        "player:readyRole",
        () => {

            if (
                room.phase === "role"
            ) {

                room.phase = "night";

                addLog(
                    "🌙 Ban đêm bắt đầu."
                );

                broadcastState();
            }
        }
    );

    // ===========================
    // CHAT
    // ===========================

    socket.on(
        "player:chat",
        data => {

            const player =
                room.players.get(
                    socket.data.playerId
                );

            if (!player)
                return;

            if (!player.alive)
                return;

            let text =
                String(data.text || "")
                    .trim()
                    .slice(0, 500);

            if (!text)
                return;

            // =======================
            // BAN ĐÊM
            // =======================

            if (
                room.phase === "night"
            ) {

                // CHỈ SÓI
                if (
                    player.role !== "wolf"
                ) {

                    return;
                }

                const message = {

                    name: player.name,

                    text,

                    time:
                        new Date()
                            .toLocaleTimeString(
                                "vi-VN"
                            )
                };

                room.wolfChat.push(
                    message
                );

                // Chỉ gửi cho Sói
                for (
                    const wolf
                    of room.players.values()
                ) {

                    if (
                        wolf.role === "wolf" &&
                        wolf.socketId
                    ) {

                        io.to(wolf.socketId)
                            .emit(
                                "chat",
                                {
                                    channel:
                                        "wolf",

                                    message
                                }
                            );
                    }
                }

                return;
            }

            // =======================
            // BAN NGÀY
            // =======================

            if (
                room.phase === "day"
            ) {

                const message = {

                    name: player.name,

                    text,

                    time:
                        new Date()
                            .toLocaleTimeString(
                                "vi-VN"
                            )
                };

                room.dayChat.push(
                    message
                );

                // Tất cả người còn sống
                for (
                    const p
                    of room.players.values()
                ) {

                    if (
                        p.alive &&
                        p.socketId
                    ) {

                        io.to(p.socketId)
                            .emit(
                                "chat",
                                {
                                    channel:
                                        "day",

                                    message
                                }
                            );
                    }
                }
            }
        }
    );

    // ===========================
    // SÓI CẮN
    // ===========================

    socket.on(
        "wolf:kill",
        targetId => {

            const wolf =
                room.players.get(
                    socket.data.playerId
                );

            if (!wolf)
                return;

            if (
                wolf.role !== "wolf"
            )
                return;

            if (
                room.phase !== "night"
            )
                return;

            const target =
                room.players.get(
                    targetId
                );

            if (!target)
                return;

            if (!target.alive)
                return;

            if (
                target.role === "wolf"
            )
                return;

            room.nightKill =
                target.id;

            // Chỉ thông báo chung
            // không tiết lộ ai cắn ai
            addLog(
                "🐺 Sói đã chọn mục tiêu."
            );

            broadcastState();
        }
    );

    // ===========================
    // TIÊN TRI SOI
    // ===========================

    socket.on(
        "seer:check",
        targetId => {

            const seer =
                room.players.get(
                    socket.data.playerId
                );

            if (!seer)
                return;

            if (
                seer.role !== "seer"
            )
                return;

            if (
                room.phase !== "night"
            )
                return;

            const target =
                room.players.get(
                    targetId
                );

            if (!target)
                return;

            socket.emit(
                "seerResult",
                {
                    name: target.name,

                    isWolf:
                        target.role === "wolf"
                }
            );
        }
    );

    // ===========================
    // VOTE
    // ===========================

    socket.on(
        "player:vote",
        targetId => {

            const player =
                room.players.get(
                    socket.data.playerId
                );

            if (!player)
                return;

            if (!player.alive)
                return;

            if (
                room.phase !== "day"
            )
                return;

            const target =
                room.players.get(
                    targetId
                );

            if (!target)
                return;

            if (!target.alive)
                return;

            if (
                target.id === player.id
            )
                return;

            room.votes.set(
                player.id,
                target.id
            );

            socket.emit(
                "voteSaved"
            );

            const aliveReal =
                getAliveRealPlayers();

            const allVoted =
                aliveReal.every(
                    p =>
                        room.votes.has(
                            p.id
                        )
                );

            if (allVoted) {

                resolveVote();
            }
        }
    );

    // ===========================
    // QUẢN TRÒ CHUYỂN PHASE
    // ===========================

    socket.on(
        "host:nextPhase",
        () => {

            if (!socket.data.isHost)
                return;

            // =======================
            // ĐÊM -> NGÀY
            // =======================

            if (
                room.phase === "night"
            ) {

                if (
                    room.nightKill
                ) {

                    const victim =
                        room.players.get(
                            room.nightKill
                        );

                    if (victim) {

                        victim.alive =
                            false;

                        addLog(
                            `🌅 ${victim.name} đã chết trong đêm.`
                        );
                    }
                }

                room.nightKill =
                    null;

                room.votes.clear();

                if (
                    !checkWinner()
                ) {

                    room.phase = "day";

                    addLog(
                        "☀️ Ban ngày bắt đầu."
                    );
                }

                broadcastState();

                return;
            }

            // =======================
            // NGÀY -> XỬ LÝ VOTE
            // =======================

            if (
                room.phase === "day"
            ) {

                resolveVote();
            }
        }
    );

    // ===========================
    // RESTART
    // ===========================

    socket.on(
        "host:restart",
        () => {

            if (!socket.data.isHost)
                return;

            room.phase = "lobby";

            room.round = 0;

            room.votes.clear();

            room.nightKill = null;

            room.dayChat = [];

            room.wolfChat = [];

            for (
                const player
                of room.players.values()
            ) {

                player.role = null;

                player.alive = true;

                player.hasVoted = false;
            }

            addLog(
                "🔄 Quản Trò đã tạo ván mới."
            );

            broadcastState();
        }
    );

    // ===========================
    // DISCONNECT
    // ===========================

    socket.on(
        "disconnect",
        () => {

            if (
                room.host &&
                room.host.socketId ===
                socket.id
            ) {

                room.host = null;

                addLog(
                    "👑 Quản Trò đã rời phòng."
                );
            }

            const player =
                room.players.get(
                    socket.data.playerId
                );

            if (player) {

                player.connected =
                    false;

                addLog(
                    `🔌 ${player.name} mất kết nối.`
                );
            }

            broadcastState();
        }
    );
});

// ===============================
// XỬ LÝ VOTE
// ===============================

function resolveVote() {

    if (
        room.phase !== "day"
    )
        return;

    const counts = {};

    for (
        const targetId
        of room.votes.values()
    ) {

        counts[targetId] =
            (counts[targetId] || 0) + 1;
    }

    const entries =
        Object.entries(counts)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            );

    if (!entries.length)
        return;

    // Hòa phiếu
    if (
        entries.length > 1 &&
        entries[0][1] ===
        entries[1][1]
    ) {

        addLog(
            "⚖️ Hòa phiếu, không ai bị loại."
        );

    } else {

        const target =
            room.players.get(
                entries[0][0]
            );

        if (target) {

            target.alive = false;

            addLog(
                `🗳️ ${target.name} bị loại với ${entries[0][1]} phiếu.`
            );
        }
    }

    room.votes.clear();

    if (
        checkWinner()
    ) {

        broadcastState();

        return;
    }

    room.phase = "night";

    addLog(
        "🌙 Ban đêm bắt đầu."
    );

    broadcastState();
}

// ===============================
// START SERVER
// ===============================

server.listen(
    PORT,
    () => {

        console.log(
            `🐺 Ma Sói server chạy tại port ${PORT}`
        );
    }
);
