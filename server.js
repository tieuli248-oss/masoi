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
   ACCOUNTS
========================================================= */

const USERS = {
    quantro: {
        password: "321",
        accountType: "Quantro"
    },

    nguoichoi: {
        password: "nguoichoi",
        accountType: "nguoichoi"
    }
};

let moderatorSocketId = null;

/* =========================================================
   ROOMS
========================================================= */

const rooms = new Map();

let roomCounter = 1;

function createRoom() {
    const room = {
        id: `room-${roomCounter++}`,

        moderatorSocketId: null,

        players: [],

        started: false,

        /*
            PHASE TÊN PHẢI KHỚP VỚI HTML HIỆN TẠI:

            lobby
            night
            daySpeech
            dayVote
            ended
        */
        phase: "lobby",

        nightNumber: 0,

        currentSpeakerIndex: -1,

        speakingPlayers: [],

        timerInterval: null,

        timer: {
            type: null,
            duration: 0,
            remaining: 0,
            speakerId: null
        },

        nightActions: {
            wolfKill: null,
            seerInspect: null,
            guardProtect: null,
            witchSave: false,
            witchPoison: null
        },

        votes: {},

        logs: [],

        wolfVoiceMembers: new Set()
    };

    rooms.set(room.id, room);

    return room;
}

/* =========================================================
   ROLES
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
   HELPERS
========================================================= */

function getRoom(socket) {
    if (!socket.data.roomId) return null;

    return rooms.get(socket.data.roomId) || null;
}

function getPlayer(room, socketId) {
    if (!room) return null;

    return room.players.find(
        player => player.id === socketId
    ) || null;
}

function getAlivePlayers(room) {
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

function getPlayerCount(room) {
    return room.players.length;
}

function addLog(room, message) {
    if (!room) return;

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

function sendPlayers(room) {
    if (!room) return;

    const list = publicPlayers(room);

    io.to(room.id).emit(
        "playersUpdate",
        {
            players: list
        }
    );

    io.to(room.id).emit(
        "roomUpdate",
        {
            room: room.id,
            code: room.id,

            phase: room.phase,

            started: room.started,

            players: list,

            playerCount: room.players.length
        }
    );
}

function clearTimer(room) {
    if (!room) return;

    if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
    }

    room.timer = {
        type: null,
        duration: 0,
        remaining: 0,
        speakerId: null
    };
}

function emitPhase(room, extra = {}) {
    if (!room) return;

    io.to(room.id).emit(
        "phaseChanged",
        {
            phase: room.phase,

            players: publicPlayers(room),

            room: room.id,

            code: room.id,

            nightNumber: room.nightNumber,

            timer: {
                type: room.timer.type,
                duration: room.timer.duration,
                remaining: room.timer.remaining,
                speakerId: room.timer.speakerId
            },

            ...extra
        }
    );
}

function findLobbyRoom() {
    for (const room of rooms.values()) {
        if (
            room.moderatorSocketId &&
            !room.started &&
            room.phase === "lobby"
        ) {
            return room;
        }
    }

    return null;
}

function playerEmit(socketId, event, data) {
    io.to(socketId).emit(event, data);
}

/* =========================================================
   ROLE ASSIGNMENT

   QUẢN TRÒ VẪN LÀ NGƯỜI CHƠI
========================================================= */

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

function assignRoles(room) {
    const players = [...room.players];

    if (players.length < 4) {
        return false;
    }

    const count = players.length;

    let roles = [];

    const wolfCount =
        count >= 10
            ? Math.max(
                2,
                Math.floor(count / 4)
            )
            : 1;

    for (
        let i = 0;
        i < wolfCount;
        i++
    ) {
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
            player.role =
                roles[index];

            player.alive = true;
        }
    );

    return true;
}

/* =========================================================
   GAME START
========================================================= */

function startGame(room) {
    if (!room) return;

    clearTimer(room);

    if (room.players.length < 4) {
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
    room.currentSpeakerIndex = -1;

    room.players.forEach(player => {
        player.alive = true;
    });

    io.to(room.id).emit(
        "gameStarted",
        {
            room: room.id,
            code: room.id,
            playerCount: room.players.length
        }
    );

    /*
        QUẢN TRÒ CŨNG NHẬN ROLE
    */
    room.players.forEach(player => {
        playerEmit(
            player.id,
            "roleAssigned",
            {
                role: player.role,

                roleInfo:
                    ROLE_INFO[
                        player.role
                    ],

                isModerator:
                    player.isModerator === true
            }
        );
    });

    sendPlayers(room);

    addLog(
        room,
        "🎮 Game bắt đầu"
    );

    setTimeout(() => {
        if (
            room.started &&
            room.phase === "night"
        ) {
            startNight(room);
        }
    }, 1500);
}

/* =========================================================
   NIGHT
   60 GIÂY
========================================================= */

function startNight(room) {
    if (!room || !room.started) {
        return;
    }

    clearTimer(room);

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

    room.timer = {
        type: "night",
        duration: 60,
        remaining: 60,
        speakerId: null
    };

    addLog(
        room,
        `🌙 Đêm ${room.nightNumber} bắt đầu - 60 giây`
    );

    emitPhase(room);

    /*
        Gửi trạng thái hành động đêm
    */
    room.players.forEach(player => {
        if (!player.alive) return;

        playerEmit(
            player.id,
            "nightAction",
            {
                phase: "night",

                duration: 60,

                remaining: 60,

                role: player.role,

                canAct:
                    !!ROLE_INFO[
                        player.role
                    ]?.nightAction,

                action:
                    player.role === "Sói"
                        ? "wolfKill"
                        : player.role === "Tiên tri"
                            ? "seerInspect"
                            : player.role === "Bảo vệ"
                                ? "guardProtect"
                                : player.role === "Phù thủy"
                                    ? "witch"
                                    : null
            }
        );
    });

    room.timerInterval = setInterval(() => {
        if (!room.started) {
            clearTimer(room);
            return;
        }

        if (room.phase !== "night") {
            clearTimer(room);
            return;
        }

        room.timer.remaining--;

        io.to(room.id).emit(
            "voiceTick",
            {
                roomId: room.id,
                phase: "night",
                remaining:
                    room.timer.remaining
            }
        );

        emitPhase(room);

        if (
            room.timer.remaining <= 0
        ) {
            clearTimer(room);

            resolveNight(room);
        }
    }, 1000);
}

/* =========================================================
   RESOLVE NIGHT
========================================================= */

function resolveNight(room) {
    if (!room || !room.started) {
        return;
    }

    if (room.phase !== "night") {
        return;
    }

    const wolfTargetId =
        room.nightActions.wolfKill;

    const guardTargetId =
        room.nightActions.guardProtect;

    const witchSave =
        room.nightActions.witchSave === true;

    const poisonTargetId =
        room.nightActions.witchPoison;

    let killedPlayer = null;
    let poisonedPlayer = null;

    let savedByGuard = false;
    let savedByWitch = false;

    /*
        Sói giết
    */
    if (wolfTargetId) {
        const target =
            getPlayer(
                room,
                wolfTargetId
            );

        if (
            target &&
            target.alive
        ) {
            if (
                guardTargetId ===
                target.id
            ) {
                savedByGuard = true;
            } else if (
                witchSave
            ) {
                savedByWitch = true;
            } else {
                target.alive = false;

                killedPlayer =
                    target;
            }
        }
    }

    /*
        Phù thủy độc
    */
    if (poisonTargetId) {
        const target =
            getPlayer(
                room,
                poisonTargetId
            );

        if (
            target &&
            target.alive
        ) {
            target.alive = false;

            poisonedPlayer =
                target;
        }
    }

    /*
        Gửi dead riêng cho người chết
    */
    if (killedPlayer) {
        playerEmit(
            killedPlayer.id,
            "dead",
            {
                reason: "night",
                phase: "night"
            }
        );
    }

    if (poisonedPlayer) {
        playerEmit(
            poisonedPlayer.id,
            "dead",
            {
                reason: "poison",
                phase: "night"
            }
        );
    }

    const result = {
        nightNumber:
            room.nightNumber,

        killed:
            killedPlayer
                ? {
                    id:
                        killedPlayer.id,
                    name:
                        killedPlayer.name
                }
                : null,

        poisoned:
            poisonedPlayer
                ? {
                    id:
                        poisonedPlayer.id,
                    name:
                        poisonedPlayer.name
                }
                : null,

        savedByGuard,

        savedByWitch,

        players:
            publicPlayers(room)
    };

    io.to(room.id).emit(
        "nightResult",
        result
    );

    if (killedPlayer) {
        addLog(
            room,
            `💀 ${killedPlayer.name} chết trong đêm`
        );
    }

    if (poisonedPlayer) {
        addLog(
            room,
            `☠️ ${poisonedPlayer.name} chết vì thuốc độc`
        );
    }

    if (
        savedByGuard ||
        savedByWitch
    ) {
        addLog(
            room,
            "🛡️ Mục tiêu của Sói đã được cứu"
        );
    }

    sendPlayers(room);

    const winner =
        checkWinner(room);

    if (winner) {
        endGameInternal(
            room,
            winner
        );

        return;
    }

    /*
        Chờ một chút để người chơi thấy kết quả
        rồi chuyển sang ban ngày
    */
    setTimeout(() => {
        if (
            room.started &&
            room.phase === "night"
        ) {
            startDaySpeech(room);
        }
    }, 3000);
}

/* =========================================================
   DAY SPEECH
   MỖI NGƯỜI 30 GIÂY
========================================================= */

function startDaySpeech(room) {
    if (!room || !room.started) {
        return;
    }

    clearTimer(room);

    room.phase = "daySpeech";

    room.speakingPlayers =
        room.players.filter(
            player =>
                player.alive
        );

    room.currentSpeakerIndex = 0;

    addLog(
        room,
        "☀️ Ban ngày bắt đầu"
    );

    startCurrentSpeaker(room);
}

function startCurrentSpeaker(room) {
    if (!room || !room.started) {
        return;
    }

    clearTimer(room);

    /*
        Tìm người còn sống tiếp theo
    */
    while (
        room.currentSpeakerIndex <
        room.speakingPlayers.length
    ) {
        const player =
            room.speakingPlayers[
                room.currentSpeakerIndex
            ];

        if (
            player &&
            player.alive
        ) {
            break;
        }

        room.currentSpeakerIndex++;
    }

    /*
        Không còn ai nói
        → vote
    */
    if (
        room.currentSpeakerIndex >=
        room.speakingPlayers.length
    ) {
        startDayVote(room);
        return;
    }

    const speaker =
        room.speakingPlayers[
            room.currentSpeakerIndex
        ];

    room.phase = "daySpeech";

    room.timer = {
        type: "speaking",
        duration: 30,
        remaining: 30,
        speakerId: speaker.id
    };

    addLog(
        room,
        `🗣️ ${speaker.name} có 30 giây để nói`
    );

    io.to(room.id).emit(
        "voiceTurn",
        {
            speakerId:
                speaker.id,

            speakerName:
                speaker.name,

            duration: 30
        }
    );

    emitPhase(
        room,
        {
            speakerId:
                speaker.id,

            speakerName:
                speaker.name
        }
    );

    room.timerInterval =
        setInterval(() => {

            if (
                !room.started ||
                room.phase !==
                    "daySpeech"
            ) {
                clearTimer(room);
                return;
            }

            /*
                Nếu người đang nói đã chết
                → chuyển ngay
            */
            if (
                !speaker.alive
            ) {
                clearTimer(room);

                io.to(room.id).emit(
                    "voiceEnded",
                    {
                        speakerId:
                            speaker.id
                    }
                );

                room.currentSpeakerIndex++;

                startCurrentSpeaker(
                    room
                );

                return;
            }

            room.timer.remaining--;

            io.to(room.id).emit(
                "voiceTick",
                {
                    roomId:
                        room.id,

                    phase:
                        "daySpeech",

                    speakerId:
                        speaker.id,

                    remaining:
                        room.timer.remaining
                }
            );

            emitPhase(
                room,
                {
                    speakerId:
                        speaker.id,

                    speakerName:
                        speaker.name
                }
            );

            if (
                room.timer.remaining <= 0
            ) {
                clearTimer(room);

                io.to(room.id).emit(
                    "voiceEnded",
                    {
                        speakerId:
                            speaker.id
                    }
                );

                room.currentSpeakerIndex++;

                startCurrentSpeaker(
                    room
                );
            }

        }, 1000);
}

/* =========================================================
   NEXT SPEAKER
========================================================= */

function nextSpeaker(room) {
    if (!room) return;

    if (
        room.phase !==
        "daySpeech"
    ) {
        return;
    }

    const currentSpeakerId =
        room.timer.speakerId;

    clearTimer(room);

    if (currentSpeakerId) {
        io.to(room.id).emit(
            "voiceEnded",
            {
                speakerId:
                    currentSpeakerId
            }
        );
    }

    room.currentSpeakerIndex++;

    startCurrentSpeaker(room);
}

/* =========================================================
   DAY VOTE
========================================================= */

function startDayVote(room) {
    if (!room || !room.started) {
        return;
    }

    clearTimer(room);

    room.phase = "dayVote";

    room.votes = {};

    const alivePlayers =
        getAlivePlayers(room);

    addLog(
        room,
        "🗳️ Bắt đầu bỏ phiếu"
    );

    emitPhase(
        room,
        {
            players:
                publicPlayers(room)
        }
    );

    io.to(room.id).emit(
        "voteStart",
        {
            duration: 30,

            players:
                alivePlayers.map(
                    publicPlayer
                )
        }
    );

    /*
        Vote tối đa 30 giây.
        Nếu tất cả vote sớm → chốt ngay.
    */
    room.timer = {
        type: "vote",
        duration: 30,
        remaining: 30,
        speakerId: null
    };

    room.timerInterval =
        setInterval(() => {

            if (
                !room.started ||
                room.phase !==
                    "dayVote"
            ) {
                clearTimer(room);
                return;
            }

            room.timer.remaining--;

            emitPhase(room);

            if (
                room.timer.remaining <= 0
            ) {
                clearTimer(room);

                resolveDayVote(room);
            }

        }, 1000);
}

/* =========================================================
   RESOLVE VOTE
========================================================= */

function resolveDayVote(room) {
    if (!room || !room.started) {
        return;
    }

    if (
        room.phase !== "dayVote"
    ) {
        return;
    }

    clearTimer(room);

    const count = {};

    Object.values(
        room.votes
    ).forEach(targetId => {

        if (!count[targetId]) {
            count[targetId] = 0;
        }

        count[targetId]++;
    });

    let maxVotes = 0;

    let topTargets = [];

    Object.entries(
        count
    ).forEach(
        ([targetId, voteCount]) => {

            if (
                voteCount > maxVotes
            ) {
                maxVotes =
                    voteCount;

                topTargets = [
                    targetId
                ];
            } else if (
                voteCount ===
                maxVotes &&
                voteCount > 0
            ) {
                topTargets.push(
                    targetId
                );
            }
        }
    );

    let eliminated = null;

    /*
        Có 1 người cao phiếu
    */
    if (
        topTargets.length === 1 &&
        maxVotes > 0
    ) {

        const target =
            getPlayer(
                room,
                topTargets[0]
            );

        if (
            target &&
            target.alive
        ) {
            target.alive = false;

            eliminated =
                target;

            playerEmit(
                target.id,
                "dead",
                {
                    reason: "vote",
                    phase: "dayVote"
                }
            );
        }
    }

    const voteList =
        Object.entries(
            count
        )
            .map(
                ([targetId, voteCount]) => {

                    const target =
                        getPlayer(
                            room,
                            targetId
                        );

                    return {
                        targetId,

                        targetName:
                            target
                                ? target.name
                                : "Không rõ",

                        count:
                            voteCount
                    };
                }
            )
            .sort(
                (a, b) =>
                    b.count -
                    a.count
            );

    io.to(room.id).emit(
        "voteResult",
        {
            votes: voteList,

            tie:
                topTargets.length > 1,

            eliminated:
                eliminated
                    ? {
                        id:
                            eliminated.id,

                        name:
                            eliminated.name
                    }
                    : null,

            players:
                publicPlayers(room)
        }
    );

    if (eliminated) {
        addLog(
            room,
            `⚖️ ${eliminated.name} bị loại`
        );
    } else if (
        topTargets.length > 1
    ) {
        addLog(
            room,
            "⚠️ Hòa phiếu - không ai bị loại"
        );
    } else {
        addLog(
            room,
            "⚠️ Không có phiếu hợp lệ"
        );
    }

    sendPlayers(room);

    const winner =
        checkWinner(room);

    if (winner) {
        endGameInternal(
            room,
            winner
        );

        return;
    }

    /*
        Sau vote → ĐÊM TIẾP THEO
    */
    setTimeout(() => {

        if (
            room.started &&
            room.phase ===
                "dayVote"
        ) {
            startNight(room);
        }

    }, 3000);
}

/* =========================================================
   CHECK WINNER
========================================================= */

function checkWinner(room) {
    if (!room) return null;

    const alive =
        getAlivePlayers(room);

    const wolves =
        alive.filter(
            player =>
                player.role === "Sói"
        );

    const villagers =
        alive.filter(
            player =>
                player.role !== "Sói"
        );

    if (
        wolves.length === 0
    ) {
        return "Dân làng";
    }

    if (
        wolves.length >=
        villagers.length
    ) {
        return "Sói";
    }

    return null;
}

/* =========================================================
   END GAME
========================================================= */

function endGameInternal(
    room,
    winner
) {
    if (!room) return;

    clearTimer(room);

    room.started = false;
    room.phase = "ended";

    const results =
        room.players.map(
            player => ({
                id:
                    player.id,

                name:
                    player.name,

                alive:
                    player.alive,

                role:
                    player.role,

                isModerator:
                    player.isModerator === true
            })
        );

    io.to(room.id).emit(
        "gameEnded",
        {
            winner,

            players:
                results
        }
    );

    emitPhase(
        room
    );

    addLog(
        room,
        `🏆 Game kết thúc - ${winner}`
    );
}

/* =========================================================
   SOCKET.IO
========================================================= */

io.on(
    "connection",
    socket => {

        console.log(
            "Connected:",
            socket.id
        );

        /* =================================================
           AUTHENTICATE
        ================================================= */

        socket.on(
            "authenticate",
            ({ id, password } = {}) => {

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
                    user.password !==
                        password
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
                    CHỈ 1 QUẢN TRÒ
                */
                if (
                    user.accountType ===
                    "Quantro"
                ) {

                    if (
                        moderatorSocketId &&
                        moderatorSocketId !==
                            socket.id
                    ) {

                        socket.emit(
                            "errorMessage",
                            {
                                message:
                                    "Quản trò đang đăng nhập ở thiết bị khác."
                            }
                        );

                        setTimeout(
                            () => {
                                socket.disconnect(
                                    true
                                );
                            },
                            500
                        );

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

        /* =================================================
           JOIN LOBBY
        ================================================= */

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

                /*
                    QUẢN TRÒ
                */

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
                        room =
                            createRoom();

                        room.moderatorSocketId =
                            socket.id;

                        room.players.push({
                            id:
                                socket.id,

                            name,

                            userId:
                                socket.data.userId,

                            role: null,

                            alive: true,

                            isModerator:
                                true
                        });
                    }

                    /*
                        Nếu đã có phòng
                        cập nhật tên Quản trò
                    */
                    const moderator =
                        getPlayer(
                            room,
                            socket.id
                        );

                    if (moderator) {
                        moderator.name =
                            name;
                    }

                    room.moderatorSocketId =
                        socket.id;

                    socket.join(
                        room.id
                    );

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

                            code:
                                room.id,

                            isHost: true,

                            isModerator: true,

                            name
                        }
                    );

                    sendPlayers(room);

                    emitPhase(room);

                    addLog(
                        room,
                        `👑 ${name} đã vào phòng với quyền Quản trò`
                    );

                    return;
                }

                /*
                    NGƯỜI CHƠI
                */

                const room =
                    findLobbyRoom();

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

                if (
                    room.started ||
                    room.phase !== "lobby"
                ) {
                    socket.emit(
                        "errorMessage",
                        {
                            message:
                                "Game đã bắt đầu, không thể vào."
                        }
                    );

                    return;
                }

                if (
                    room.players.length >=
                    20
                ) {
                    socket.emit(
                        "errorMessage",
                        {
                            message:
                                "Phòng đã đủ 20 người."
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
                    id:
                        socket.id,

                    name,

                    userId:
                        socket.data.userId,

                    role: null,

                    alive: true,

                    isModerator: false
                };

                room.players.push(
                    player
                );

                socket.join(
                    room.id
                );

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

                        code:
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

                emitPhase(room);
            }
        );

        /* =================================================
           START GAME
        ================================================= */

        socket.on(
            "startGame",
            () => {

                const room =
                    getRoom(socket);

                if (!room) {
                    return;
                }

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

                if (
                    room.players.length < 4
                ) {
                    socket.emit(
                        "errorMessage",
                        {
                            message:
                                "Cần ít nhất 4 người chơi."
                        }
                    );

                    return;
                }

                startGame(room);
            }
        );

        /* =================================================
           WOLF KILL
        ================================================= */

        socket.on(
            "wolfKill",
            ({ targetId } = {}) => {

                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "night"
                ) {
                    return;
                }

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (!player) return;

                if (
                    !player.alive ||
                    player.role !==
                        "Sói"
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
                    !target.alive ||
                    target.id ===
                        socket.id
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

                addLog(
                    room,
                    `🐺 Sói đã chọn ${target.name}`
                );
            }
        );

        /* =================================================
           SEER
        ================================================= */

        socket.on(
            "seerInspect",
            ({ targetId } = {}) => {

                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "night"
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
                    !player.alive ||
                    player.role !==
                        "Tiên tri"
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

        /* =================================================
           GUARD
        ================================================= */

        socket.on(
            "guardProtect",
            ({ targetId } = {}) => {

                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "night"
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
                    !player.alive ||
                    player.role !==
                        "Bảo vệ"
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
                    !target.alive
                ) {
                    return;
                }

                room.nightActions.guardProtect =
                    target.id;
            }
        );

        /* =================================================
           WITCH SAVE
        ================================================= */

        socket.on(
            "witchSave",
            () => {

                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "night"
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
                    !player.alive ||
                    player.role !==
                        "Phù thủy"
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
            }
        );

        /* =================================================
           WITCH POISON
        ================================================= */

        socket.on(
            "witchPoison",
            ({ targetId } = {}) => {

                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "night"
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
                    !player.alive ||
                    player.role !==
                        "Phù thủy"
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
                    !target.alive
                ) {
                    return;
                }

                room.nightActions.witchPoison =
                    target.id;
            }
        );

        /* =================================================
           VOTE
        ================================================= */

        socket.on(
            "vote",
            ({ targetId } = {}) => {

                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "dayVote"
                ) {
                    return;
                }

                const voter =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (
                    !voter ||
                    !voter.alive
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
                    !target.alive ||
                    target.id ===
                        voter.id
                ) {
                    return;
                }

                room.votes[
                    voter.id
                ] = target.id;

                socket.emit(
                    "voteUpdate",
                    {
                        targetId:
                            target.id,

                        targetName:
                            target.name,

                        votes:
                            Object.entries(
                                room.votes
                            ).map(
                                ([voterId, votedId]) => ({
                                    voterId,

                                    targetId:
                                        votedId
                                })
                            )
                    }
                );

                /*
                    Tất cả người sống đã vote
                    → chốt ngay
                */
                const aliveCount =
                    getAlivePlayers(
                        room
                    ).length;

                const votedCount =
                    Object.keys(
                        room.votes
                    ).length;

                if (
                    votedCount >=
                    aliveCount
                ) {
                    resolveDayVote(room);
                }
            }
        );

        /* =================================================
           NEXT PHASE
           QUẢN TRÒ CÓ THỂ BỎ QUA
        ================================================= */

        socket.on(
            "nextPhase",
            () => {

                const room =
                    getRoom(socket);

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
                                "Chỉ Quản trò mới có quyền điều khiển."
                        }
                    );

                    return;
                }

                if (
                    room.phase ===
                    "night"
                ) {
                    resolveNight(room);
                    return;
                }

                if (
                    room.phase ===
                    "daySpeech"
                ) {
                    nextSpeaker(room);
                    return;
                }

                if (
                    room.phase ===
                    "dayVote"
                ) {
                    resolveDayVote(room);
                    return;
                }
            }
        );

        /* =================================================
           END GAME
        ================================================= */

        socket.on(
            "endGame",
            () => {

                const room =
                    getRoom(socket);

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

        /* =================================================
           DAY VOICE
        ================================================= */

        socket.on(
            "voiceStart",
            () => {

                const room =
                    getRoom(socket);

                if (!room) return;

                if (
                    room.phase !==
                    "daySpeech"
                ) {
                    return;
                }

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

                        speakerId:
                            socket.id
                    }
                );
            }
        );

        socket.on(
            "voiceStop",
            () => {

                const room =
                    getRoom(socket);

                if (!room) return;

                io.to(room.id).emit(
                    "voiceStatus",
                    {
                        speaking: false,

                        speakerId:
                            socket.id
                    }
                );
            }
        );

        /* =================================================
           WOLF VOICE
        ================================================= */

        socket.on(
            "wolfVoiceJoin",
            () => {

                const room =
                    getRoom(socket);

                if (!room) return;

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (
                    !player ||
                    !player.alive ||
                    player.role !==
                        "Sói"
                ) {
                    return;
                }

                room.wolfVoiceMembers.add(
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
        );

        socket.on(
            "wolfVoiceLeave",
            () => {

                const room =
                    getRoom(socket);

                if (!room) return;

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
        );

        socket.on(
            "wolfVoiceStatus",
            ({ speaking } = {}) => {

                const room =
                    getRoom(socket);

                if (!room) return;

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (
                    !player ||
                    player.role !==
                        "Sói"
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
            ({
                targetId,
                signal
            } = {}) => {

                const room =
                    getRoom(socket);

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
                    !target
                ) {
                    return;
                }

                if (
                    sender.role !==
                        "Sói" ||
                    target.role !==
                        "Sói" ||
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

        /* =================================================
           READY
        ================================================= */

        socket.on(
            "player:ready",
            () => {

                const room =
                    getRoom(socket);

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
                        room:
                            room.id,

                        code:
                            room.id,

                        phase:
                            room.phase,

                        players:
                            publicPlayers(room)
                    }
                );
            }
        );

        /* =================================================
           DISCONNECT
        ================================================= */

        socket.on(
            "disconnect",
            reason => {

                console.log(
                    "Disconnected:",
                    socket.id,
                    reason
                );

                const room =
                    getRoom(socket);

                /*
                    QUẢN TRÒ THOÁT
                */
                if (
                    socket.data.isModerator
                ) {

                    if (
                        moderatorSocketId ===
                        socket.id
                    ) {
                        moderatorSocketId =
                            null;
                    }

                    if (room) {

                        room.moderatorSocketId =
                            null;

                        /*
                            Không chuyển quyền
                            cho người khác.
                        */
                        if (
                            room.started
                        ) {
                            clearTimer(room);

                            room.started =
                                false;

                            room.phase =
                                "waiting_moderator";

                            io.to(room.id).emit(
                                "phaseChanged",
                                {
                                    phase:
                                        "waiting_moderator",

                                    players:
                                        publicPlayers(room)
                                }
                            );

                            io.to(room.id).emit(
                                "errorMessage",
                                {
                                    message:
                                        "Quản trò đã thoát. Game đã tạm dừng."
                                }
                            );
                        }

                        sendPlayers(room);
                    }

                    return;
                }

                /*
                    NGƯỜI CHƠI THOÁT
                */
                if (!room) {
                    return;
                }

                const index =
                    room.players.findIndex(
                        player =>
                            player.id ===
                            socket.id
                    );

                if (
                    index === -1
                ) {
                    return;
                }

                const player =
                    room.players[index];

                /*
                    Nếu đang là người nói
                    → bỏ qua người này.
                */
                if (
                    room.phase ===
                    "daySpeech" &&
                    room.timer.speakerId ===
                        socket.id
                ) {

                    clearTimer(room);

                    io.to(room.id).emit(
                        "voiceEnded",
                        {
                            speakerId:
                                socket.id
                        }
                    );

                    room.players.splice(
                        index,
                        1
                    );

                    room.speakingPlayers =
                        room.speakingPlayers.filter(
                            p =>
                                p.id !==
                                socket.id
                        );

                    if (
                        room.currentSpeakerIndex >=
                        room.speakingPlayers.length
                    ) {
                        startDayVote(room);
                    } else {
                        startCurrentSpeaker(
                            room
                        );
                    }

                } else {

                    room.players.splice(
                        index,
                        1
                    );

                    /*
                        Nếu người chơi đã vote
                        thì xóa vote của họ.
                    */
                    delete room.votes[
                        socket.id
                    ];

                    /*
                        Nếu người chơi là Sói
                        thì rời voice.
                    */
                    room.wolfVoiceMembers.delete(
                        socket.id
                    );

                    sendPlayers(room);
                }

                addLog(
                    room,
                    `🚪 ${player.name} đã rời game`
                );

                /*
                    Nếu còn quá ít người
                    thì kiểm tra thắng.
                */
                if (
                    room.started
                ) {
                    const winner =
                        checkWinner(room);

                    if (winner) {
                        endGameInternal(
                            room,
                            winner
                        );
                    }
                }

                /*
                    Nếu phòng trống
                    → xóa phòng
                */
                if (
                    room.players.length ===
                    0
                ) {
                    clearTimer(room);

                    rooms.delete(
                        room.id
                    );
                }
            }
        );
    }
);

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
