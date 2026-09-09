const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: true,
        methods: ["GET", "POST"]
    }
});

// =========================
// CẤU HÌNH
// =========================

const PORT = process.env.PORT || 3000;
const ROOM_CODE = "MASOI";

const ACCOUNTS = {
    Quantro: {
        password: "19001080",
        type: "host"
    },

    nguoichoi: {
        password: "123456",
        type: "player"
    }
};

// =========================
// PHÒNG GAME
// =========================

const room = {
    code: ROOM_CODE,
    hostId: null,

    started: false,
    phase: "lobby",

    wolfCount: 1,

    players: [],

    votes: {},
    nightActions: [],

    voice: {
        active: false,
        playerId: null,
        round: 1,
        seconds: 30,
        timer: null,
        order: [],
        index: 0
    }
};

// =========================
// TRANG KIỂM TRA SERVER
// =========================

app.get("/", (req, res) => {
    res.json({
        ok: true,
        service: "Ma Sói Online",
        room: ROOM_CODE
    });
});

app.get("/health", (req, res) => {
    res.json({
        ok: true
    });
});

// =========================
// HELPER
// =========================

function getPlayer(id) {
    return room.players.find(p => p.id === id);
}

function getAlivePlayers() {
    return room.players.filter(p => p.alive);
}

function getWolfPlayers() {
    return room.players.filter(
        p => p.role === "Sói" && p.alive
    );
}

function publicPlayers() {
    return room.players.map(p => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        isHost: p.id === room.hostId
    }));
}

function sendRoomUpdate() {
    io.emit("roomUpdate", {
        room: {
            code: room.code,
            phase: room.phase,
            started: room.started,
            wolfCount: room.wolfCount,
            hostId: room.hostId
        },
        players: publicPlayers()
    });
}

function log(message) {
    io.emit("gameLog", {
        message
    });
}

function error(socket, message) {
    socket.emit("errorMessage", {
        message
    });
}

// =========================
// KIỂM TRA THẮNG
// =========================

function checkWinner() {
    const alive = getAlivePlayers();

    const wolves = alive.filter(
        p => p.role === "Sói"
    );

    const villagers = alive.filter(
        p => p.role !== "Sói"
    );

    if (wolves.length === 0) {
        endGame("🎉 Dân làng thắng!");
        return true;
    }

    if (wolves.length >= villagers.length) {
        endGame("🐺 Sói thắng!");
        return true;
    }

    return false;
}

// =========================
// KẾT THÚC GAME
// =========================

function endGame(message) {
    room.started = false;
    room.phase = "ended";

    if (room.voice.timer) {
        clearInterval(room.voice.timer);
        room.voice.timer = null;
    }

    io.emit("gameEnded", {
        message
    });
}

// =========================
// PHÂN VAI
// =========================

function assignRoles() {
    const shuffled = [...room.players];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [shuffled[i], shuffled[j]] =
            [shuffled[j], shuffled[i]];
    }

    room.players.forEach(p => {
        p.role = "Dân làng";
    });

    for (let i = 0; i < room.wolfCount; i++) {
        if (shuffled[i]) {
            shuffled[i].role = "Sói";
        }
    }

    let index = room.wolfCount;

    if (shuffled[index]) {
        shuffled[index].role = "Tiên tri";
        index++;
    }

    if (shuffled[index]) {
        shuffled[index].role = "Bảo vệ";
        index++;
    }

    if (shuffled[index]) {
        shuffled[index].role = "Thợ săn";
    }
}

// =========================
// SOCKET.IO
// =========================

io.on("connection", socket => {

    console.log("Kết nối:", socket.id);

    // =====================
    // ĐĂNG NHẬP
    // =====================

    socket.on("authenticate", data => {

        if (!data || !data.id || !data.password) {
            return error(
                socket,
                "Vui lòng nhập ID và mật khẩu."
            );
        }

        const account = ACCOUNTS[data.id];

        if (!account) {
            return error(
                socket,
                "ID không tồn tại."
            );
        }

        if (account.password !== data.password) {
            return error(
                socket,
                "Sai mật khẩu."
            );
        }

        socket.accountId = data.id;
        socket.accountType = account.type;

        socket.emit("authenticateSuccess", {
            accountType: account.type
        });

        console.log(
            `${data.id} đăng nhập thành công`
        );
    });

    // =====================
    // VÀO PHÒNG
    // =====================

    socket.on("joinLobby", data => {

        if (!socket.accountId) {
            return error(
                socket,
                "Bạn chưa đăng nhập."
            );
        }

        if (room.started) {
            return error(
                socket,
                "Game đã bắt đầu."
            );
        }

        const name = String(
            data?.name || ""
        ).trim();

        if (name.length < 2) {
            return error(
                socket,
                "Tên phải có ít nhất 2 ký tự."
            );
        }

        if (name.length > 20) {
            return error(
                socket,
                "Tên tối đa 20 ký tự."
            );
        }

        const oldPlayer = room.players.find(
            p => p.id === socket.id
        );

        if (oldPlayer) {
            return;
        }

        const duplicate = room.players.find(
            p => p.name.toLowerCase() === name.toLowerCase()
        );

        if (duplicate) {
            return error(
                socket,
                "Tên người chơi đã tồn tại."
            );
        }

        const player = {
            id: socket.id,
            accountId: socket.accountId,
            name,
            role: null,
            alive: true
        };

        room.players.push(player);

        socket.join(ROOM_CODE);

        if (
            socket.accountType === "host" &&
            !room.hostId
        ) {
            room.hostId = socket.id;
        }

        socket.emit("loginSuccess", {
            accountType: socket.accountType,
            room: {
                code: ROOM_CODE
            },
            isHost: socket.id === room.hostId,
            players: publicPlayers()
        });

        sendRoomUpdate();

        io.emit("playersUpdate", {
            players: publicPlayers()
        });

        console.log(
            `${name} đã vào phòng`
        );
    });

    // =====================
    // BẮT ĐẦU GAME
    // =====================

    socket.on("startGame", data => {

        if (socket.id !== room.hostId) {
            return error(
                socket,
                "Chỉ quản trò mới được bắt đầu game."
            );
        }

        if (room.started) {
            return error(
                socket,
                "Game đã bắt đầu."
            );
        }

        if (room.players.length < 4) {
            return error(
                socket,
                "Cần ít nhất 4 người chơi."
            );
        }

        const wolfCount =
            Number(data?.wolfCount) || 1;

        if (wolfCount < 1 || wolfCount > 4) {
            return error(
                socket,
                "Số Sói phải từ 1 đến 4."
            );
        }

        if (wolfCount >= room.players.length) {
            return error(
                socket,
                "Số Sói quá nhiều."
            );
        }

        room.wolfCount = wolfCount;
        room.started = true;
        room.phase = "night";

        room.votes = {};
        room.nightActions = [];

        room.players.forEach(p => {
            p.alive = true;
            p.role = null;
        });

        assignRoles();

        // Gửi vai riêng cho từng người
        room.players.forEach(p => {

            const targetSocket =
                io.sockets.sockets.get(p.id);

            if (!targetSocket) return;

            targetSocket.emit("roleAssigned", {
                role: p.role
            });

            targetSocket.emit("gameStarted", {
                room: {
                    code: ROOM_CODE,
                    phase: room.phase
                },
                players: publicPlayers(),
                role: p.role
            });
        });

        io.emit("phaseChanged", {
            phase: "night",
            players: publicPlayers(),
            message: "🌙 Đêm bắt đầu."
        });

        log("🌙 Đêm đầu tiên bắt đầu.");

        sendRoomUpdate();

        console.log(
            "GAME START:",
            room.players.map(p => ({
                name: p.name,
                role: p.role
            }))
        );
    });

    // =====================
    // SÓI CẮN
    // =====================

    socket.on("wolfKill", data => {

        if (!room.started) {
            return error(
                socket,
                "Game chưa bắt đầu."
            );
        }

        if (room.phase !== "night") {
            return error(
                socket,
                "Hiện tại không phải ban đêm."
            );
        }

        const wolf = getPlayer(socket.id);

        if (!wolf || wolf.role !== "Sói") {
            return error(
                socket,
                "Bạn không phải Sói."
            );
        }

        if (!wolf.alive) {
            return error(
                socket,
                "Bạn đã chết."
            );
        }

        const target = getPlayer(
            data?.targetId
        );

        if (!target) {
            return error(
                socket,
                "Không tìm thấy người chơi."
            );
        }

        if (!target.alive) {
            return error(
                socket,
                "Người này đã chết."
            );
        }

        if (target.role === "Sói") {
            return error(
                socket,
                "Không thể cắn Sói."
            );
        }

        // Xóa lựa chọn cũ của Sói này
        room.nightActions =
            room.nightActions.filter(
                a => a.wolfId !== socket.id
            );

        room.nightActions.push({
            wolfId: socket.id,
            wolfName: wolf.name,
            targetId: target.id,
            targetName: target.name
        });

        // QUẢN TRÒ THẤY AI CẮN AI
        const hostSocket =
            io.sockets.sockets.get(room.hostId);

        if (hostSocket) {
            hostSocket.emit("gameLog", {
                message:
                    `🐺 ${wolf.name} cắn ${target.name}`
            });
        }

        socket.emit("gameLog", {
            message:
                `🐺 Bạn đã chọn cắn ${target.name}`
        });

        console.log(
            `SÓI ${wolf.name} CẮN ${target.name}`
        );
    });

    // =====================
    // BỎ PHIẾU
    // =====================

    socket.on("vote", data => {

        if (!room.started) {
            return error(
                socket,
                "Game chưa bắt đầu."
            );
        }

        if (room.phase !== "dayVote") {
            return error(
                socket,
                "Chưa đến thời gian bỏ phiếu."
            );
        }

        const voter = getPlayer(socket.id);

        if (!voter || !voter.alive) {
            return error(
                socket,
                "Bạn không thể bỏ phiếu."
            );
        }

        const target = getPlayer(
            data?.targetId
        );

        if (!target || !target.alive) {
            return error(
                socket,
                "Người được chọn không hợp lệ."
            );
        }

        if (target.id === voter.id) {
            return error(
                socket,
                "Không thể tự vote chính mình."
            );
        }

        room.votes[socket.id] = {
            voterId: socket.id,
            voterName: voter.name,
            targetId: target.id,
            targetName: target.name
        };

        const voteList =
            Object.values(room.votes).map(v => ({
                voterName: v.voterName,
                targetName: v.targetName
            }));

        io.emit("voteUpdate", {
            votes: voteList
        });

        log(
            `🗳️ ${voter.name} đã bỏ phiếu.`
        );

        // Kiểm tra đủ phiếu
        const aliveCount =
            getAlivePlayers().length;

        const voteCount =
            Object.keys(room.votes).length;

        if (voteCount >= aliveCount) {
            resolveVotes();
        }
    });

    // =====================
    // XỬ LÝ PHIẾU
    // =====================

    function resolveVotes() {

        const counts = {};

        Object.values(room.votes).forEach(v => {

            if (!counts[v.targetId]) {
                counts[v.targetId] = 0;
            }

            counts[v.targetId]++;
        });

        let max = 0;
        let winners = [];

        Object.entries(counts).forEach(
            ([id, count]) => {

                if (count > max) {
                    max = count;
                    winners = [id];
                }
                else if (count === max) {
                    winners.push(id);
                }
            }
        );

        let message =
            "🗳️ Kết quả bỏ phiếu: không ai bị loại.";

        let eliminated = null;

        // Hòa phiếu
        if (winners.length === 1) {

            eliminated =
                getPlayer(winners[0]);

            if (eliminated) {
                eliminated.alive = false;

                message =
                    `⚰️ ${eliminated.name} bị loại với ${max} phiếu.`;
            }
        }
        else {
            message =
                "⚖️ Hòa phiếu, không ai bị loại.";
        }

        io.emit("voteResult", {
            players: publicPlayers(),
            votes: Object.values(room.votes),
            message
        });

        io.emit("playersUpdate", {
            players: publicPlayers()
        });

        log(message);

        room.votes = {};

        if (checkWinner()) {
            return;
        }

        // Nếu chưa thắng -> đêm
        room.phase = "night";

        io.emit("phaseChanged", {
            phase: "night",
            players: publicPlayers(),
            message: "🌙 Đêm mới bắt đầu."
        });

        sendRoomUpdate();
    }

    // =====================
    // CHUYỂN PHASE
    // =====================

    socket.on("nextPhase", data => {

        if (socket.id !== room.hostId) {
            return error(
                socket,
                "Chỉ quản trò mới được chuyển phase."
            );
        }

        if (!room.started) {
            return;
        }

        // ĐÊM -> NGÀY
        if (room.phase === "night") {

            processNight();

            if (!room.started) return;

            room.phase = "daySpeech";

            startVoiceRound();

            io.emit("phaseChanged", {
                phase: "daySpeech",
                players: publicPlayers(),
                message: "☀️ Ban ngày bắt đầu."
            });

            sendRoomUpdate();

            return;
        }

        // NGÀY NÓI -> VOTE
        if (room.phase === "daySpeech") {

            stopVoice();

            room.phase = "dayVote";

            room.votes = {};

            io.emit("phaseChanged", {
                phase: "dayVote",
                players: publicPlayers(),
                message: "🗳️ Bắt đầu bỏ phiếu."
            });

            sendRoomUpdate();

            return;
        }

        // VOTE -> ĐÊM
        if (room.phase === "dayVote") {

            if (
                Object.keys(room.votes).length > 0
            ) {
                resolveVotes();
                return;
            }

            room.phase = "night";

            io.emit("phaseChanged", {
                phase: "night",
                players: publicPlayers(),
                message: "🌙 Đêm bắt đầu."
            });

            sendRoomUpdate();
        }
    });

    // =====================
    // XỬ LÝ BAN ĐÊM
    // =====================

    function processNight() {

        const actions = room.nightActions;

        if (!actions.length) {

            io.emit("nightResult", {
                players: publicPlayers(),
                message:
                    "🌙 Đêm nay không có ai bị cắn."
            });

            return;
        }

        // Lấy mục tiêu được nhiều Sói chọn nhất
        const targets = {};

        actions.forEach(a => {

            if (!targets[a.targetId]) {
                targets[a.targetId] = {
                    count: 0,
                    name: a.targetName
                };
            }

            targets[a.targetId].count++;
        });

        let selectedId = null;
        let highest = 0;

        Object.entries(targets).forEach(
            ([id, data]) => {

                if (data.count > highest) {
                    highest = data.count;
                    selectedId = id;
                }
            }
        );

        const victim = getPlayer(selectedId);

        if (!victim) return;

        victim.alive = false;

        const message =
            `🌙 ${victim.name} đã bị Sói cắn và chết.`;

        io.emit("nightResult", {
            players: publicPlayers(),
            message
        });

        log(message);

        // Người chết thấy thông tin cắn
        const deadSocket =
            io.sockets.sockets.get(victim.id);

        if (deadSocket) {

            deadSocket.emit("dead", {
                nightActions: actions.map(a => ({
                    text:
                        `🐺 ${a.wolfName} cắn ${a.targetName}`
                }))
            });
        }

        io.emit("playersUpdate", {
            players: publicPlayers()
        });

        room.nightActions = [];

        checkWinner();
    }

    // =====================
    // VOICE
    // =====================

    function startVoiceRound() {

        stopVoice();

        const alive =
            getAlivePlayers();

        room.voice.order =
            alive.map(p => p.id);

        room.voice.index = 0;
        room.voice.round = 1;

        startCurrentSpeaker();
    }

    function startCurrentSpeaker() {

        const order =
            room.voice.order;

        if (!order.length) {
            moveToVoteAfterVoice();
            return;
        }

        if (room.voice.round > 2) {
            moveToVoteAfterVoice();
            return;
        }

        if (
            room.voice.index >= order.length
        ) {

            room.voice.index = 0;
            room.voice.round++;

            if (room.voice.round > 2) {
                moveToVoteAfterVoice();
                return;
            }
        }

        const playerId =
            order[room.voice.index];

        const player =
            getPlayer(playerId);

        if (!player || !player.alive) {

            room.voice.index++;

            startCurrentSpeaker();

            return;
        }

        room.voice.active = true;
        room.voice.playerId = player.id;
        room.voice.seconds = 30;

        io.emit("voiceTurn", {
            playerId: player.id,
            playerName: player.name,
            round: room.voice.round,
            seconds: 30
        });

        io.emit("voiceStatus", {
            message:
                `🎤 ${player.name} đang nói - 30 giây`
        });

        room.voice.timer =
            setInterval(() => {

                room.voice.seconds--;

                io.emit("voiceTick", {
                    seconds:
                        room.voice.seconds
                });

                if (
                    room.voice.seconds <= 0
                ) {
                    finishCurrentSpeaker();
                }

            }, 1000);
    }

    function finishCurrentSpeaker() {

        if (room.voice.timer) {
            clearInterval(room.voice.timer);
            room.voice.timer = null;
        }

        room.voice.active = false;

        io.emit("voiceEnded");

        room.voice.index++;

        setTimeout(() => {
            startCurrentSpeaker();
        }, 300);
    }

    function moveToVoteAfterVoice() {

        room.voice.active = false;
        room.voice.playerId = null;

        io.emit("voiceEnded");

        room.phase = "dayVote";
        room.votes = {};

        io.emit("phaseChanged", {
            phase: "dayVote",
            players: publicPlayers(),
            message:
                "🗳️ Đã nói xong 2 vòng. Bắt đầu bỏ phiếu."
        });

        sendRoomUpdate();
    }

    // =====================
    // VOICE START
    // =====================

    socket.on("voiceStart", data => {

        if (!room.started) return;

        if (room.phase !== "daySpeech") {
            return error(
                socket,
                "Chưa đến giờ nói."
            );
        }

        if (
            room.voice.playerId !== socket.id
        ) {
            return error(
                socket,
                "Chưa đến lượt bạn nói."
            );
        }

        socket.emit("voiceStatus", {
            message: "🎤 Micro đã bật."
        });
    });

    // =====================
    // VOICE STOP
    // =====================

    socket.on("voiceStop", data => {

        if (
            room.voice.playerId !== socket.id
        ) {
            return;
        }

        finishCurrentSpeaker();
    });

    // =====================
    // WEBRTC SIGNAL
    // =====================

    socket.on("voiceSignal", data => {

        if (!data || !data.targetId) {
            return;
        }

        const targetSocket =
            io.sockets.sockets.get(
                data.targetId
            );

        if (!targetSocket) {
            return;
        }

        targetSocket.emit("voiceSignal", {
            fromId: socket.id,
            signal: data.signal
        });
    });

    // =====================
    // KẾT THÚC GAME
    // =====================

    socket.on("endGame", data => {

        if (socket.id !== room.hostId) {
            return error(
                socket,
                "Chỉ quản trò mới được kết thúc game."
            );
        }

        endGame(
            "🛑 Quản trò đã kết thúc game."
        );
    });

    // =====================
    // NGẮT KẾT NỐI
    // =====================

    socket.on("disconnect", () => {

        console.log(
            "Ngắt kết nối:",
            socket.id
        );

        const index =
            room.players.findIndex(
                p => p.id === socket.id
            );

        if (index === -1) {
            return;
        }

        const player =
            room.players[index];

        room.players.splice(index, 1);

        // Nếu host thoát
        if (room.hostId === socket.id) {

            room.hostId =
                room.players.length
                    ? room.players[0].id
                    : null;

            if (room.hostId) {

                const newHost =
                    io.sockets.sockets.get(
                        room.hostId
                    );

                if (newHost) {
                    newHost.accountType = "host";

                    newHost.emit(
                        "gameLog",
                        {
                            message:
                                "👑 Bạn đã trở thành quản trò."
                        }
                    );
                }
            }
        }

        // Nếu đang nói
        if (
            room.voice.playerId === socket.id
        ) {
            finishCurrentSpeaker();
        }

        io.emit("playersUpdate", {
            players: publicPlayers()
        });

        sendRoomUpdate();

        console.log(
            `${player.name} đã rời phòng`
        );
    });
});

// =========================
// CHẠY SERVER
// =========================

server.listen(PORT, () => {

    console.log(
        `Ma Sói Server đang chạy tại port ${PORT}`
    );
});
