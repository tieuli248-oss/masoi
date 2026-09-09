const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"]
});

const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(__dirname));

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        message: "Ma Sói server is running"
    });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "masoi-online.html"));
});

/* =========================================================
   TÀI KHOẢN
========================================================= */

const USERS = {
    quantro: {
        password: "321",
        accountType: "QuanTro"
    },

    nguoichoi: {
        password: "123",
        accountType: "nguoichoi"
    }
};

/*
    Chỉ duy nhất 1 phiên Quản trò được đăng nhập.
*/
let moderatorSocketId = null;

/* =========================================================
   ROOM
========================================================= */

const rooms = new Map();

let roomCounter = 1;

function createRoom() {
    const roomId = "room-" + roomCounter++;

    const room = {
        id: roomId,

        moderatorSocketId: null,

        players: [],

        phase: "lobby",

        started: false,

        timer: {
            type: null,
            duration: 0,
            remaining: 0,
            speakerId: null
        },

        nightNumber: 0,

        currentSpeakerIndex: -1,

        nightActions: {
            wolfKill: null,
            seerInspect: null,
            guardProtect: null,
            witchSave: false,
            witchPoison: null
        },

        votes: {},

        logs: []
    };

    rooms.set(roomId, room);

    return room;
}

/* =========================================================
   ROLE
========================================================= */

const ROLE_INFO = {
    "Sói": {
        team: "wolf",
        nightAction: true
    },

    "Tiên tri": {
        team: "villager",
        nightAction: true
    },

    "Bảo vệ": {
        team: "villager",
        nightAction: true
    },

    "Phù thủy": {
        team: "villager",
        nightAction: true
    },

    "Dân làng": {
        team: "villager",
        nightAction: false
    }
};

/* =========================================================
   HÀM CHUNG
========================================================= */

function findRoomForPlayer() {
    for (const room of rooms.values()) {
        if (
            room.moderatorSocketId &&
            room.phase === "lobby"
        ) {
            return room;
        }
    }

    return null;
}

function getPlayer(room, socketId) {
    return room.players.find(
        player => player.id === socketId
    );
}

function getAlivePlayers(room) {
    return room.players.filter(
        player => player.alive && !player.isModerator
    );
}

function getAliveAllPlayers(room) {
    return room.players.filter(
        player => player.alive
    );
}

function getAliveWolves(room) {
    return room.players.filter(
        player =>
            player.alive &&
            player.role === "Sói"
    );
}

function getPlayerCount(room) {
    return room.players.filter(
        player => !player.isModerator
    ).length;
}

function addLog(room, message) {
    const log = {
        message,
        time: Date.now()
    };

    room.logs.push(log);

    if (room.logs.length > 200) {
        room.logs.shift();
    }

    io.to(room.id).emit("gameLog", log);
}

function publicPlayer(player) {
    return {
        id: player.id,
        name: player.name,
        alive: player.alive,
        isModerator: player.isModerator === true
    };
}

function publicPlayers(room) {
    return room.players.map(publicPlayer);
}

function sendPlayers(room) {
    io.to(room.id).emit(
        "playersUpdate",
        publicPlayers(room)
    );

    io.to(room.id).emit("roomUpdate", {
        roomId: room.id,
        phase: room.phase,
        players: publicPlayers(room),
        playerCount: getPlayerCount(room)
    });
}

function sendRoomState(room) {
    io.to(room.id).emit("roomUpdate", {
        roomId: room.id,
        phase: room.phase,
        started: room.started,
        players: publicPlayers(room),
        playerCount: getPlayerCount(room),

        timer: {
            type: room.timer.type,
            duration: room.timer.duration,
            remaining: room.timer.remaining,
            speakerId: room.timer.speakerId
        },

        nightNumber: room.nightNumber
    });
}

/* =========================================================
   GỬI TRẠNG THÁI TIMER
========================================================= */

function broadcastTimer(room) {
    io.to(room.id).emit("phaseChanged", {
        phase: room.phase,

        timer: {
            type: room.timer.type,
            duration: room.timer.duration,
            remaining: room.timer.remaining,
            speakerId: room.timer.speakerId
        },

        nightNumber: room.nightNumber
    });
}

/* =========================================================
   DỪNG TIMER
========================================================= */

function clearRoomTimer(room) {
    if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
    }

    room.timer.type = null;
    room.timer.duration = 0;
    room.timer.remaining = 0;
    room.timer.speakerId = null;
}

/* =========================================================
   ĐÊM
   - Tổng thời gian: 60 giây
   - Sói / Tiên tri / Bảo vệ / Phù thủy cùng hành động
========================================================= */

function startNight(room) {
    if (!room.started) return;

    clearRoomTimer(room);

    room.phase = "night";
    room.nightNumber++;

    room.nightActions = {
        wolfKill: null,
        seerInspect: null,
        guardProtect: null,
        witchSave: false,
        witchPoison: null
    };

    room.votes = {};

    room.timer.type = "night";
    room.timer.duration = 60;
    room.timer.remaining = 60;

    addLog(
        room,
        `🌙 Đêm ${room.nightNumber} bắt đầu`
    );

    io.to(room.id).emit("phaseChanged", {
        phase: "night",
        nightNumber: room.nightNumber,
        timer: {
            type: "night",
            duration: 60,
            remaining: 60,
            speakerId: null
        }
    });

    sendRoleNightState(room);

    room.timerInterval = setInterval(() => {
        room.timer.remaining--;

        io.to(room.id).emit("voiceTick", {
            roomId: room.id,
            phase: "night",
            remaining: room.timer.remaining
        });

        broadcastTimer(room);

        if (room.timer.remaining <= 0) {
            clearInterval(room.timerInterval);
            room.timerInterval = null;

            resolveNight(room);
        }
    }, 1000);
}

/* =========================================================
   GỬI TRẠNG THÁI HÀNH ĐỘNG ĐÊM CHO TỪNG NGƯỜI
========================================================= */

function sendRoleNightState(room) {
    room.players.forEach(player => {
        if (!player.alive || player.isModerator) {
            return;
        }

        const payload = {
            phase: "night",
            duration: 60,
            remaining: room.timer.remaining,
            role: player.role,
            canAct: false,
            action: null
        };

        if (player.role === "Sói") {
            payload.canAct = true;
            payload.action = "wolfKill";
        }

        if (player.role === "Tiên tri") {
            payload.canAct = true;
            payload.action = "seerInspect";
        }

        if (player.role === "Bảo vệ") {
            payload.canAct = true;
            payload.action = "guardProtect";
        }

        if (player.role === "Phù thủy") {
            payload.canAct = true;
            payload.action = "witch";
        }

        playerSocketEmit(player.id, "nightAction", payload);
    });
}

function playerSocketEmit(socketId, event, data) {
    io.to(socketId).emit(event, data);
}

/* =========================================================
   XỬ LÝ KẾT QUẢ ĐÊM
========================================================= */

function resolveNight(room) {
    if (room.phase !== "night") return;

    const killTargetId = room.nightActions.wolfKill;
    const guardTargetId = room.nightActions.guardProtect;
    const saveTargetId = room.nightActions.witchSave === true
        ? killTargetId
        : null;
    const poisonTargetId = room.nightActions.witchPoison;

    let killedPlayer = null;
    let savedByGuard = false;
    let savedByWitch = false;
    let poisonedPlayer = null;

    if (killTargetId) {
        const target = getPlayer(room, killTargetId);

        if (
            target &&
            target.alive &&
            !target.isModerator
        ) {
            if (guardTargetId === killTargetId) {
                savedByGuard = true;
            } else if (saveTargetId === killTargetId) {
                savedByWitch = true;
            } else {
                target.alive = false;
                killedPlayer = target;
            }
        }
    }

    if (poisonTargetId) {
        const poisonTarget = getPlayer(
            room,
            poisonTargetId
        );

        if (
            poisonTarget &&
            poisonTarget.alive &&
            !poisonTarget.isModerator
        ) {
            poisonTarget.alive = false;
            poisonedPlayer = poisonTarget;
        }
    }

    const result = {
        nightNumber: room.nightNumber,

        killed: killedPlayer
            ? {
                id: killedPlayer.id,
                name: killedPlayer.name
            }
            : null,

        savedByGuard,

        savedByWitch,

        poisoned: poisonedPlayer
            ? {
                id: poisonedPlayer.id,
                name: poisonedPlayer.name
            }
            : null
    };

    io.to(room.id).emit(
        "nightResult",
        result
    );

    room.players.forEach(player => {
        if (!player.alive) {
            playerSocketEmit(player.id, "dead", {
                reason: "night",
                phase: "night"
            });
        }
    });

    sendPlayers(room);

    addLog(
        room,
        "☀️ Trời sáng"
    );

    if (killedPlayer) {
        addLog(
            room,
            `💀 ${killedPlayer.name} đã chết trong đêm`
        );
    }

    if (poisonedPlayer) {
        addLog(
            room,
            `☠️ ${poisonedPlayer.name} đã chết vì thuốc độc`
        );
    }

    const winner = checkWinner(room);

    if (winner) {
        endGameInternal(room, winner);
        return;
    }

    startDaySpeaking(room);
}

/* =========================================================
   BAN NGÀY - NÓI CHUYỆN
   MỖI NGƯỜI 30 GIÂY
========================================================= */

function startDaySpeaking(room) {
    clearRoomTimer(room);

    room.phase = "day_speaking";

    const speakers = getAliveAllPlayers(room)
        .filter(player => !player.isModerator);

    room.speakingPlayers = speakers;

    room.currentSpeakerIndex = 0;

    if (speakers.length === 0) {
        startDayVoting(room);
        return;
    }

    startCurrentSpeaker(room);
}

function startCurrentSpeaker(room) {
    clearRoomTimer(room);

    const players = room.speakingPlayers || [];

    if (
        room.currentSpeakerIndex < 0 ||
        room.currentSpeakerIndex >= players.length
    ) {
        startDayVoting(room);
        return;
    }

    const speaker =
        players[room.currentSpeakerIndex];

    if (!speaker || !speaker.alive) {
        room.currentSpeakerIndex++;
        startCurrentSpeaker(room);
        return;
    }

    room.phase = "day_speaking";

    room.timer.type = "speaking";
    room.timer.duration = 30;
    room.timer.remaining = 30;
    room.timer.speakerId = speaker.id;

    addLog(
        room,
        `🗣️ ${speaker.name} bắt đầu nói - 30 giây`
    );

    io.to(room.id).emit("voiceTurn", {
        speakerId: speaker.id,
        speakerName: speaker.name,
        duration: 30
    });

    io.to(room.id).emit("phaseChanged", {
        phase: "day_speaking",

        speakerId: speaker.id,
        speakerName: speaker.name,

        timer: {
            type: "speaking",
            duration: 30,
            remaining: 30,
            speakerId: speaker.id
        }
    });

    room.timerInterval = setInterval(() => {
        room.timer.remaining--;

        io.to(room.id).emit("voiceTick", {
            roomId: room.id,
            phase: "day_speaking",
            speakerId: speaker.id,
            remaining: room.timer.remaining
        });

        if (room.timer.remaining <= 0) {
            clearInterval(room.timerInterval);
            room.timerInterval = null;

            io.to(room.id).emit("voiceEnded", {
                speakerId: speaker.id
            });

            room.currentSpeakerIndex++;

            startCurrentSpeaker(room);
        }
    }, 1000);
}

/* =========================================================
   BỎ QUA NGƯỜI NÓI / TỰ CHUYỂN NGƯỜI
========================================================= */

function nextSpeaker(room) {
    if (room.phase !== "day_speaking") {
        return;
    }

    clearRoomTimer(room);

    io.to(room.id).emit("voiceEnded", {
        speakerId: room.timer.speakerId
    });

    room.currentSpeakerIndex++;

    startCurrentSpeaker(room);
}

/* =========================================================
   VOTE
========================================================= */

function startDayVoting(room) {
    clearRoomTimer(room);

    room.phase = "day_voting";
    room.votes = {};

    const alivePlayers = getAliveAllPlayers(room)
        .filter(player => !player.isModerator);

    io.to(room.id).emit(
        "phaseChanged",
        {
            phase: "day_voting",
            duration: 30
        }
    );

    io.to(room.id).emit(
        "voteStart",
        {
            duration: 30,
            players: alivePlayers.map(publicPlayer)
        }
    );

    addLog(
        room,
        "🗳️ Bắt đầu bỏ phiếu"
    );
}

/* =========================================================
   KẾT QUẢ VOTE
========================================================= */

function resolveDayVote(room) {
    if (room.phase !== "day_voting") {
        return;
    }

    const count = {};

    Object.values(room.votes).forEach(
        targetId => {
            if (!count[targetId]) {
                count[targetId] = 0;
            }

            count[targetId]++;
        }
    );

    let topTargetId = null;
    let topCount = 0;
    let tie = false;

    for (const targetId of Object.keys(count)) {
        const voteCount = count[targetId];

        if (voteCount > topCount) {
            topCount = voteCount;
            topTargetId = targetId;
            tie = false;
        } else if (
            voteCount === topCount &&
            voteCount > 0
        ) {
            tie = true;
        }
    }

    let eliminated = null;

    if (
        topTargetId &&
        !tie
    ) {
        eliminated = getPlayer(
            room,
            topTargetId
        );

        if (
            eliminated &&
            eliminated.alive &&
            !eliminated.isModerator
        ) {
            eliminated.alive = false;
        } else {
            eliminated = null;
        }
    }

    const voteList = Object.entries(count)
        .map(([targetId, votes]) => {
            const target = getPlayer(
                room,
                targetId
            );

            return {
                targetId,
                targetName:
                    target
                        ? target.name
                        : "Không rõ",
                count: votes
            };
        })
        .sort((a, b) =>
            b.count - a.count
        );

    io.to(room.id).emit(
        "voteResult",
        {
            votes: voteList,

            tie,

            eliminated: eliminated
                ? {
                    id: eliminated.id,
                    name: eliminated.name
                }
                : null
        }
    );

    if (eliminated) {
        addLog(
            room,
            `⚖️ ${eliminated.name} bị treo`
        );

        playerSocketEmit(
            eliminated.id,
            "dead",
            {
                reason: "vote",
                phase: "day_voting"
            }
        );
    } else if (tie) {
        addLog(
            room,
            "⚠️ Hòa phiếu - không ai bị treo"
        );
    }

    sendPlayers(room);

    const winner = checkWinner(room);

    if (winner) {
        endGameInternal(room, winner);
        return;
    }

    /*
        Sau vote → đêm tiếp theo
    */
    setTimeout(() => {
        if (room.started) {
            startNight(room);
        }
    }, 3000);
}

/* =========================================================
   CHECK THẮNG
========================================================= */

function checkWinner(room) {
    const alivePlayers =
        getAliveAllPlayers(room)
            .filter(player => !player.isModerator);

    const aliveWolves =
        alivePlayers.filter(
            player => player.role === "Sói"
        );

    const aliveVillagers =
        alivePlayers.filter(
            player => player.role !== "Sói"
        );

    if (aliveWolves.length === 0) {
        return "Dân làng";
    }

    if (
        aliveWolves.length >=
        aliveVillagers.length
    ) {
        return "Sói";
    }

    return null;
}

/* =========================================================
   KẾT THÚC GAME
========================================================= */

function endGameInternal(room, winner) {
    clearRoomTimer(room);

    room.started = false;
    room.phase = "ended";

    const results =
        room.players.map(player => ({
            id: player.id,
            name: player.name,
            alive: player.alive,
            role: player.role
        }));

    io.to(room.id).emit(
        "gameEnded",
        {
            winner,
            players: results
        }
    );

    addLog(
        room,
        `🏆 Phe thắng: ${winner}`
    );
}

/* =========================================================
   RANDOM ROLE
========================================================= */

function assignRoles(room) {
    const players = room.players.filter(
        player => !player.isModerator
    );

    const count = players.length;

    if (count < 4) {
        return false;
    }

    let roles = [];

    /*
        Có thể chỉnh tỉ lệ role ở đây.
    */

    const wolfCount =
        count >= 10
            ? Math.max(
                2,
                Math.floor(count / 4)
            )
            : 1;

    for (let i = 0; i < wolfCount; i++) {
        roles.push("Sói");
    }

    if (count >= 5) {
        roles.push("Tiên tri");
    }

    if (count >= 6) {
        roles.push("Bảo vệ");
    }

    if (count >= 7) {
        roles.push("Phù thủy");
    }

    while (roles.length < count) {
        roles.push("Dân làng");
    }

    roles = shuffle(roles);

    players.forEach(
        (player, index) => {
            player.role = roles[index];
            player.alive = true;
        }
    );

    return true;
}

function shuffle(array) {
    const arr = [...array];

    for (
        let i = arr.length - 1;
        i > 0;
        i--
    ) {
        const j = Math.floor(
            Math.random() * (i + 1)
        );

        [arr[i], arr[j]] =
            [arr[j], arr[i]];
    }

    return arr;
}

/* =========================================================
   SOCKET.IO
========================================================= */

io.on("connection", socket => {

    console.log(
        "Client connected:",
        socket.id
    );

    /* =====================================================
       AUTHENTICATE
    ===================================================== */

    socket.on(
        "authenticate",
        ({ id, password }) => {

            if (
                !id ||
                !password
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Vui lòng nhập ID và mật khẩu."
                    }
                );

                return;
            }

            const user =
                USERS[id];

            if (
                !user ||
                user.password !== password
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Sai ID hoặc mật khẩu."
                    }
                );

                return;
            }

            /*
                CHẶN 2 QUẢN TRÒ ĐĂNG NHẬP CÙNG LÚC
            */

            if (
                user.accountType === "Quantro"
            ) {

                if (
                    moderatorSocketId &&
                    moderatorSocketId !== socket.id
                ) {
                    socket.emit(
                        "errorMessage",
                        {
                            message:
                                "Quản trò đang đăng nhập ở thiết bị khác."
                        }
                    );

                    setTimeout(() => {
                        socket.disconnect(true);
                    }, 500);

                    return;
                }

                moderatorSocketId =
                    socket.id;

                socket.data.isModerator =
                    true;
            } else {
                socket.data.isModerator =
                    false;
            }

            socket.data.authenticated =
                true;

            socket.data.userId =
                id;

            socket.data.accountType =
                user.accountType;

            socket.emit(
                "authenticateSuccess",
                {
                    id,
                    accountType:
                        user.accountType
                }
            );

            console.log(
                `${id} authenticated`
            );
        }
    );

    /* =====================================================
       JOIN LOBBY
    ===================================================== */

    socket.on(
        "joinLobby",
        ({ name } = {}) => {

            if (
                !socket.data.authenticated
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Bạn chưa đăng nhập."
                    }
                );

                return;
            }

            name =
                String(name || "")
                    .trim()
                    .slice(0, 30);

            if (!name) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Vui lòng nhập tên."
                    }
                );

                return;
            }

            /* =============================================
               QUẢN TRÒ
            ============================================= */

            if (
                socket.data.isModerator
            ) {

                let room =
                    Array.from(
                        rooms.values()
                    ).find(
                        r =>
                            r.moderatorSocketId ===
                            socket.id
                    );

                if (!room) {
                    room = createRoom();

                    room.moderatorSocketId =
                        socket.id;

                    const moderator = {
                        id: socket.id,
                        name,
                        userId:
                            socket.data.userId,
                        role: null,
                        alive: true,
                        isModerator: true
                    };

                    room.players.push(
                        moderator
                    );
                }

                socket.join(room.id);

                socket.data.roomId =
                    room.id;

                socket.emit(
                    "loginSuccess",
                    {
                        id:
                            socket.data.userId,
                        accountType:
                            "Quantro",
                        room:
                            room.id,
                        isHost: true,
                        isModerator: true,
                        name
                    }
                );

                sendPlayers(room);
                sendRoomState(room);

                addLog(
                    room,
                    `👑 Quản trò ${name} đã vào phòng`
                );

                return;
            }

            /* =============================================
               NGƯỜI CHƠI
            ============================================= */

            let room =
                findRoomForPlayer();

            if (!room) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Chưa có phòng của Quản trò."
                    }
                );

                return;
            }

            /*
                Không cho vào giữa ván
            */

            if (
                room.started ||
                room.phase !== "lobby"
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Ván game đã bắt đầu, không thể tham gia."
                    }
                );

                return;
            }

            const playerCount =
                getPlayerCount(room);

            if (playerCount >= 20) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Phòng đã đủ người."
                    }
                );

                return;
            }

            const duplicateName =
                room.players.some(
                    player =>
                        player.name
                            .toLowerCase() ===
                        name.toLowerCase()
                );

            if (duplicateName) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Tên người chơi đã tồn tại."
                    }
                );

                return;
            }

            const player = {
                id: socket.id,
                name,
                userId:
                    socket.data.userId,
                role: null,
                alive: true,
                isModerator: false
            };

            room.players.push(player);

            socket.join(room.id);

            socket.data.roomId =
                room.id;

            socket.emit(
                "loginSuccess",
                {
                    id:
                        socket.data.userId,
                    accountType:
                        "nguoichoi",
                    room:
                        room.id,
                    isHost: false,
                    isModerator: false,
                    name
                }
            );

            addLog(
                room,
                `👤 ${name} đã vào phòng`
            );

            sendPlayers(room);
            sendRoomState(room);
        }
    );

    /* =====================================================
       START GAME
    ===================================================== */

    socket.on(
        "startGame",
        () => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                !socket.data.isModerator ||
                room.moderatorSocketId !==
                    socket.id
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Chỉ Quản trò mới được bắt đầu game."
                    }
                );

                return;
            }

            if (room.started) {
                return;
            }

            const count =
                getPlayerCount(room);

            if (count < 4) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Cần ít nhất 4 người chơi."
                    }
                );

                return;
            }

            const success =
                assignRoles(room);

            if (!success) {
                return;
            }

            room.started = true;
            room.phase = "night";
            room.nightNumber = 0;

            room.players.forEach(player => {
                player.alive = true;
            });

            io.to(room.id).emit(
                "gameStarted",
                {
                    room: room.id,
                    playerCount: count
                }
            );

            /*
                Gửi role riêng tư
            */

            room.players.forEach(player => {

                if (player.isModerator) {
                    playerSocketEmit(
                        player.id,
                        "roleAssigned",
                        {
                            role: null,
                            isModerator: true
                        }
                    );

                    return;
                }

                playerSocketEmit(
                    player.id,
                    "roleAssigned",
                    {
                        role: player.role,
                        roleInfo:
                            ROLE_INFO[
                                player.role
                            ]
                    }
                );
            });

            addLog(
                room,
                "🎮 Game bắt đầu"
            );

            sendPlayers(room);

            setTimeout(() => {
                startNight(room);
            }, 1500);
        }
    );

    /* =====================================================
       SÓI GIẾT
    ===================================================== */

    socket.on(
        "wolfKill",
        ({ targetId } = {}) => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                room.phase !== "night"
            ) return;

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (
                !player ||
                player.isModerator ||
                !player.alive ||
                player.role !== "Sói"
            ) {
                return;
            }

            const target =
                getPlayer(
                    room,
                    targetId
                );

            if (
                !target ||
                target.isModerator ||
                !target.alive
            ) {
                return;
            }

            room.nightActions.wolfKill =
                target.id;

            socket.emit(
                "wolfKillConfirmed",
                {
                    targetId:
                        target.id,
                    targetName:
                        target.name
                }
            );
        }
    );

    /* =====================================================
       TIÊN TRI SOI
    ===================================================== */

    socket.on(
        "seerInspect",
        ({ targetId } = {}) => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                room.phase !== "night"
            ) return;

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (
                !player ||
                player.isModerator ||
                !player.alive ||
                player.role !== "Tiên tri"
            ) {
                return;
            }

            const target =
                getPlayer(
                    room,
                    targetId
                );

            if (
                !target ||
                target.isModerator ||
                !target.alive
            ) {
                return;
            }

            room.nightActions.seerInspect =
                target.id;

            socket.emit(
                "seerResult",
                {
                    targetId:
                        target.id,
                    targetName:
                        target.name,

                    isWolf:
                        target.role ===
                        "Sói"
                }
            );
        }
    );

    /* =====================================================
       BẢO VỆ
    ===================================================== */

    socket.on(
        "guardProtect",
        ({ targetId } = {}) => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                room.phase !== "night"
            ) return;

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (
                !player ||
                player.isModerator ||
                !player.alive ||
                player.role !== "Bảo vệ"
            ) {
                return;
            }

            const target =
                getPlayer(
                    room,
                    targetId
                );

            if (
                !target ||
                target.isModerator ||
                !target.alive
            ) {
                return;
            }

            room.nightActions.guardProtect =
                target.id;

            socket.emit(
                "guardProtectConfirmed",
                {
                    targetId:
                        target.id,
                    targetName:
                        target.name
                }
            );
        }
    );

    /* =====================================================
       PHÙ THỦY - CỨU
    ===================================================== */

    socket.on(
        "witchSave",
        () => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                room.phase !== "night"
            ) return;

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (
                !player ||
                player.isModerator ||
                !player.alive ||
                player.role !== "Phù thủy"
            ) {
                return;
            }

            if (
                !room.nightActions.wolfKill
            ) {
                return;
            }

            room.nightActions.witchSave =
                true;

            socket.emit(
                "witchSaveConfirmed",
                {
                    ok: true
                }
            );
        }
    );

    /* =====================================================
       PHÙ THỦY - ĐỘC
    ===================================================== */

    socket.on(
        "witchPoison",
        ({ targetId } = {}) => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                room.phase !== "night"
            ) return;

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (
                !player ||
                player.isModerator ||
                !player.alive ||
                player.role !== "Phù thủy"
            ) {
                return;
            }

            const target =
                getPlayer(
                    room,
                    targetId
                );

            if (
                !target ||
                target.isModerator ||
                !target.alive
            ) {
                return;
            }

            room.nightActions.witchPoison =
                target.id;

            socket.emit(
                "witchPoisonConfirmed",
                {
                    targetId:
                        target.id,
                    targetName:
                        target.name
                }
            );
        }
    );

    /* =====================================================
       PLAYER VOTE
    ===================================================== */

    socket.on(
        "vote",
        ({ targetId } = {}) => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                room.phase !== "day_voting"
            ) {
                return;
            }

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (
                !player ||
                player.isModerator ||
                !player.alive
            ) {
                return;
            }

            const target =
                getPlayer(
                    room,
                    targetId
                );

            if (
                !target ||
                target.isModerator ||
                !target.alive
            ) {
                return;
            }

            room.votes[
                player.id
            ] = target.id;

            socket.emit(
                "voteUpdate",
                {
                    targetId:
                        target.id,
                    targetName:
                        target.name
                }
            );

            const alivePlayers =
                getAliveAllPlayers(room)
                    .filter(
                        p =>
                            !p.isModerator
                    );

            const voteCount =
                Object.keys(
                    room.votes
                ).length;

            /*
                Tất cả người còn sống đã vote
                → chốt luôn
            */

            if (
                voteCount >=
                alivePlayers.length
            ) {
                resolveDayVote(room);
            }
        }
    );

    /* =====================================================
       NEXT PHASE
       CHỈ QUẢN TRÒ
    ===================================================== */

    socket.on(
        "nextPhase",
        () => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                !socket.data.isModerator ||
                room.moderatorSocketId !==
                    socket.id
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Chỉ Quản trò mới được chuyển pha."
                    }
                );

                return;
            }

            if (room.phase === "day_speaking") {
                nextSpeaker(room);
                return;
            }

            if (room.phase === "day_voting") {
                resolveDayVote(room);
                return;
            }

            if (room.phase === "night") {
                resolveNight(room);
                return;
            }
        }
    );

    /* =====================================================
       END GAME
    ===================================================== */

    socket.on(
        "endGame",
        () => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                !socket.data.isModerator ||
                room.moderatorSocketId !==
                    socket.id
            ) {
                socket.emit(
                    "errorMessage",
                    {
                        message:
                            "Chỉ Quản trò mới được kết thúc game."
                    }
                );

                return;
            }

            endGameInternal(
                room,
                "Quản trò kết thúc game"
            );
        }
    );

    /* =====================================================
       DAY VOICE
    ===================================================== */

    socket.on(
        "voiceStart",
        () => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                room.phase !== "day_speaking"
            ) return;

            if (
                room.timer.speakerId !==
                socket.id
            ) {
                return;
            }

            io.to(room.id).emit(
                "voiceStatus",
                {
                    speaking: true,
                    speakerId: socket.id
                }
            );
        }
    );

    socket.on(
        "voiceStop",
        () => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            io.to(room.id).emit(
                "voiceStatus",
                {
                    speaking: false,
                    speakerId: socket.id
                }
            );
        }
    );

    /* =====================================================
       WOLF VOICE
    ===================================================== */

    socket.on(
        "wolfVoiceJoin",
        () => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (
                !player ||
                !player.alive ||
                player.role !== "Sói"
            ) {
                return;
            }

            if (
                !room.wolfVoiceMembers
            ) {
                room.wolfVoiceMembers =
                    new Set();
            }

            room.wolfVoiceMembers.add(
                socket.id
            );

            const members =
                Array.from(
                    room.wolfVoiceMembers
                );

            io.to(room.id).emit(
                "wolfVoiceMembers",
                {
                    members
                }
            );
        }
    );

    socket.on(
        "wolfVoiceLeave",
        () => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            if (
                room.wolfVoiceMembers
            ) {
                room.wolfVoiceMembers.delete(
                    socket.id
                );

                io.to(room.id).emit(
                    "wolfVoiceMembers",
                    {
                        members:
                            Array.from(
                                room.wolfVoiceMembers
                            )
                    }
                );

                io.to(room.id).emit(
                    "wolfVoiceLeft",
                    {
                        id:
                            socket.id
                    }
                );
            }
        }
    );

    socket.on(
        "wolfVoiceStatus",
        ({ speaking } = {}) => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (
                !player ||
                player.role !== "Sói"
            ) {
                return;
            }

            io.to(room.id).emit(
                "wolfVoiceStatus",
                {
                    id:
                        socket.id,
                    speaking:
                        speaking === true
                }
            );
        }
    );

    socket.on(
        "wolfVoiceSignal",
        ({ targetId, signal } = {}) => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            const sender =
                getPlayer(
                    room,
                    socket.id
                );

            const target =
                getPlayer(
                    room,
                    targetId
                );

            if (
                !sender ||
                !target ||
                sender.role !== "Sói" ||
                target.role !== "Sói" ||
                !sender.alive ||
                !target.alive
            ) {
                return;
            }

            io.to(target.id).emit(
                "wolfVoiceSignal",
                {
                    fromId:
                        socket.id,

                    senderId:
                        socket.id,

                    targetId:
                        target.id,

                    signal
                }
            );
        }
    );

    /* =====================================================
       PLAYER READY
    ===================================================== */

    socket.on(
        "player:ready",
        () => {

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) return;

            const player =
                getPlayer(
                    room,
                    socket.id
                );

            if (!player) return;

            player.ready = true;

            io.to(room.id).emit(
                "roomUpdate",
                {
                    players:
                        publicPlayers(room),

                    readyPlayers:
                        room.players
                            .filter(
                                p =>
                                    p.ready
                            )
                            .map(
                                p =>
                                    p.id
                            )
                }
            );
        }
    );

    /* =====================================================
       DISCONNECT
    ===================================================== */

    socket.on(
        "disconnect",
        reason => {

            console.log(
                "Client disconnected:",
                socket.id,
                reason
            );

            /*
                QUẢN TRÒ THOÁT
                Không chuyển quyền cho ai khác.
            */

            if (
                socket.data.isModerator &&
                moderatorSocketId ===
                    socket.id
            ) {
                moderatorSocketId = null;
            }

            const room =
                rooms.get(
                    socket.data.roomId
                );

            if (!room) {
                return;
            }

            const playerIndex =
                room.players.findIndex(
                    player =>
                        player.id ===
                        socket.id
                );

            if (
                playerIndex === -1
            ) {
                return;
            }

            const player =
                room.players[
                    playerIndex
                ];

            /*
                QUẢN TRÒ DISCONNECT
            */

            if (
                player.isModerator
            ) {

                room.moderatorSocketId =
                    null;

                /*
                    Không xóa quyền moderator
                    của người khác vì không ai được
                    thăng chức thay.
                */

                io.to(room.id).emit(
                    "errorMessage",
                    {
                        message:
                            "Quản trò đã thoát khỏi phòng."
                    }
                );

                sendPlayers(room);

                /*
                    Dừng game nếu đang chơi
                */

                if (room.started) {
                    clearRoomTimer(room);

                    room.started = false;
                    room.phase =
                        "waiting_moderator";

                    io.to(room.id).emit(
                        "phaseChanged",
                        {
                            phase:
                                "waiting_moderator"
                        }
                    );
                }

                return;
            }

            /*
                NGƯỜI CHƠI DISCONNECT
            */

            room.players.splice(
                playerIndex,
                1
            );

            if (
                room.phase ===
                "day_speaking"
            ) {
                const speakingPlayers =
                    room.speakingPlayers || [];

                const idx =
                    speakingPlayers.findIndex(
                        p =>
                            p.id ===
                            socket.id
                    );

                if (
                    idx !== -1
                ) {
                    speakingPlayers.splice(
                        idx,
                        1
                    );

                    if (
                        idx <=
                        room.currentSpeakerIndex
                    ) {
                        room.currentSpeakerIndex--;
                    }

                    if (
                        room.timer.speakerId ===
                        socket.id
                    ) {
                        room.currentSpeakerIndex++;
                        startCurrentSpeaker(
                            room
                        );
                    }
                }
            }

            if (
                room.wolfVoiceMembers
            ) {
                room.wolfVoiceMembers.delete(
                    socket.id
                );

                io.to(room.id).emit(
                    "wolfVoiceMembers",
                    {
                        members:
                            Array.from(
                                room.wolfVoiceMembers
                            )
                    }
                );
            }

            addLog(
                room,
                `🚪 ${player.name} đã rời phòng`
            );

            sendPlayers(room);

            /*
                Nếu phòng không còn ai,
                xóa phòng.
            */

            const hasModerator =
                room.players.some(
                    p =>
                        p.isModerator
                );

            const hasPlayers =
                room.players.some(
                    p =>
                        !p.isModerator
                );

            if (
                !hasModerator &&
                !hasPlayers
            ) {
                clearRoomTimer(room);

                rooms.delete(
                    room.id
                );
            }
        }
    );
});

/* =========================================================
   START SERVER
========================================================= */

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Ma Soi server running on port ${PORT}`
        );
    }
);
