const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: "*",
    methods: ["GET", "POST"]
}));

app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"]
});

const PORT =
    process.env.PORT || 3000;


/* =========================================================
   SERVER TEST
========================================================= */

app.get("/", (req, res) => {
    res.send("🐺 Ma Sói Online Server OK");
});


/* =========================================================
   GAME DUY NHẤT
========================================================= */

const game = {

    hostSocketId: null,

    players: new Map(),

    started: false,
    gameOver: false,

    phase: "lobby",

    nightNumber: 0,

    timer: null,
    phaseEndsAt: null,

    speakingQueue: [],
    speakingIndex: 0,

    wolfVotes: new Map(),
    dayVotes: new Map(),

    nightActions: {
        wolfTargetId: null,

        seerTargetId: null,
        seerUsed: false,

        guardTargetId: null,

        witchSave: false,
        witchPoisonTargetId: null
    },

    witch: {
        saveUsed: false,
        poisonUsed: false
    },

    logs: []
};


/* =========================================================
   UTILITY
========================================================= */

function shuffle(array) {
    return [...array].sort(
        () => Math.random() - 0.5
    );
}


function getPlayerBySocket(socketId) {
    return [
        ...game.players.values()
    ].find(
        player =>
            player.socketId === socketId
    ) || null;
}


function getPlayer(playerId) {
    return (
        game.players.get(playerId) ||
        null
    );
}


function alivePlayers() {
    return [
        ...game.players.values()
    ].filter(
        player =>
            player.alive
    );
}


function aliveByRole(role) {
    return alivePlayers().filter(
        player =>
            player.role === role
    );
}


function publicPlayer(player) {
    return {
        id: player.id,
        name: player.name,
        alive: player.alive,
        isHost: player.isHost
    };
}


function publicPlayers() {
    return [
        ...game.players.values()
    ].map(publicPlayer);
}


function publicRoom() {
    return {

        id: "main_room",

        started:
            game.started,

        gameOver:
            game.gameOver,

        phase:
            game.phase,

        nightNumber:
            game.nightNumber,

        players:
            publicPlayers(),

        logs:
            game.logs.slice(-60)
    };
}


function addLog(text) {

    game.logs.push({
        text,
        time: Date.now()
    });

    if (
        game.logs.length > 100
    ) {
        game.logs.shift();
    }
}


function broadcastRoom() {

    io.to("main_room").emit(
        "roomUpdate",
        {
            room:
                publicRoom(),

            players:
                publicPlayers()
        }
    );
}


function broadcastPlayers() {

    io.to("main_room").emit(
        "playersUpdate",
        {
            players:
                publicPlayers()
        }
    );
}


/* =========================================================
   TIMER
========================================================= */

function stopTimer() {

    if (game.timer) {

        clearInterval(
            game.timer
        );

        game.timer = null;
    }

    game.phaseEndsAt =
        null;
}


function remainingTime() {

    if (
        !game.phaseEndsAt
    ) {
        return 0;
    }

    return Math.max(
        0,
        Math.ceil(
            (
                game.phaseEndsAt -
                Date.now()
            ) / 1000
        )
    );
}


function startTimer(
    seconds,
    callback
) {

    stopTimer();

    game.phaseEndsAt =
        Date.now() +
        seconds * 1000;

    io.to("main_room").emit(
        "phaseTimer",
        {
            seconds,
            remaining:
                seconds
        }
    );

    game.timer =
        setInterval(
            () => {

                const remaining =
                    remainingTime();

                io.to("main_room")
                    .emit(
                        "phaseTimer",
                        {
                            seconds,
                            remaining
                        }
                    );

                if (
                    remaining <= 0
                ) {

                    stopTimer();

                    callback();
                }

            },
            250
        );
}


/* =========================================================
   ROLE CONFIG
========================================================= */

function getRoleConfiguration(
    count
) {

    let wolves = 0;

    const roles = [];


    /*
     * 6 - 7
     * 2 Sói
     * 1 Tiên tri
     * 1 Bảo vệ
     * 1 Phù thủy
     */

    if (
        count >= 6 &&
        count <= 7
    ) {

        wolves = 2;

        roles.push(
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy"
        );
    }


    /*
     * 8 - 9
     * 2 Sói
     * 1 Tiên tri
     * 1 Bảo vệ
     *
     * Ở đây thêm Phù thủy
     * để game đủ vai.
     */

    else if (
        count >= 8 &&
        count <= 9
    ) {

        wolves = 2;

        roles.push(
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy"
        );
    }


    /*
     * 10
     * 2 Sói
     *
     * 11
     * 3 Sói
     */

    else if (
        count >= 10 &&
        count <= 11
    ) {

        wolves =
            count === 10
                ? 2
                : 3;

        roles.push(
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy"
        );
    }


    /*
     * 12 - 14
     */

    else if (
        count >= 12 &&
        count <= 14
    ) {

        wolves = 3;

        roles.push(
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn"
        );
    }


    /*
     * 15
     * 3 Sói
     *
     * 16 - 17
     * 4 Sói
     */

    else if (
        count >= 15 &&
        count <= 17
    ) {

        wolves =
            count === 15
                ? 3
                : 4;

        roles.push(
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        );
    }


    /*
     * 18 - 20
     */

    else if (
        count >= 18 &&
        count <= 20
    ) {

        wolves = 4;

        roles.push(
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid",
            "Già làng"
        );
    }


    for (
        let i = 0;
        i < wolves;
        i++
    ) {

        roles.unshift(
            "Sói"
        );
    }


    while (
        roles.length < count
    ) {

        roles.push(
            "Dân làng"
        );
    }


    return shuffle(
        roles.slice(
            0,
            count
        )
    );
}


function assignRoles() {

    const players =
        shuffle(
            [
                ...game.players.values()
            ]
        );

    const roles =
        getRoleConfiguration(
            players.length
        );


    players.forEach(
        (player, index) => {

            player.role =
                roles[index];

            player.alive =
                true;
        }
    );
}


function sendRoles() {

    for (
        const player
        of game.players.values()
    ) {

        const socket =
            io.sockets.sockets.get(
                player.socketId
            );

        if (!socket) {
            continue;
        }

        socket.emit(
            "roleAssigned",
            {
                role:
                    player.role
            }
        );
    }
}


/* =========================================================
   WIN CHECK
========================================================= */

function checkWinner() {

    const alive =
        alivePlayers();

    const wolves =
        alive.filter(
            player =>
                player.role ===
                "Sói"
        );

    const others =
        alive.filter(
            player =>
                player.role !==
                "Sói"
        );


    if (
        wolves.length === 0
    ) {

        endGame(
            "🎉 Dân làng thắng!"
        );

        return true;
    }


    if (
        wolves.length >=
        others.length
    ) {

        endGame(
            "🐺 Sói thắng!"
        );

        return true;
    }


    return false;
}


/* =========================================================
   END GAME
========================================================= */

function endGame(message) {

    if (
        game.gameOver
    ) {
        return;
    }

    stopTimer();

    game.started =
        false;

    game.gameOver =
        true;

    game.phase =
        "gameOver";


    addLog(message);


    io.to("main_room").emit(
        "gameEnded",
        {

            message,

            players:
                [
                    ...game.players.values()
                ].map(
                    player => ({
                        ...publicPlayer(
                            player
                        ),

                        role:
                            player.role
                    })
                )
        }
    );


    broadcastRoom();
}


/* =========================================================
   KILL PLAYER
========================================================= */

function killPlayer(
    player,
    reason = ""
) {

    if (
        !player ||
        !player.alive
    ) {
        return;
    }

    player.alive =
        false;


    addLog(
        `☠️ ${player.name} đã chết${reason ? ` (${reason})` : ""}.`
    );


    io.to(
        player.socketId
    ).emit(
        "dead",
        {
            playerId:
                player.id,

            message:
                "Bạn đã chết."
        }
    );


    broadcastPlayers();
}


/* =========================================================
   NIGHT RESET
========================================================= */

function resetNight() {

    game.wolfVotes.clear();

    game.nightActions = {

        wolfTargetId:
            null,

        seerTargetId:
            null,

        seerUsed:
            false,

        guardTargetId:
            null,

        witchSave:
            false,

        witchPoisonTargetId:
            null
    };
}


/* =========================================================
   NIGHT
========================================================= */

function beginNight() {

    if (
        !game.started ||
        game.gameOver
    ) {
        return;
    }


    if (
        checkWinner()
    ) {
        return;
    }


    resetNight();


    game.nightNumber += 1;

    game.phase =
        "night";


    addLog(
        `🌙 Đêm ${game.nightNumber} bắt đầu.`
    );


    io.to("main_room").emit(
        "phaseChanged",
        {
            phase:
                "night",

            nightNumber:
                game.nightNumber,

            players:
                publicPlayers()
        }
    );


    /*
     * Chỉ Sói nhận được thông báo
     * về kênh đêm.
     */

    for (
        const wolf
        of aliveByRole("Sói")
    ) {

        io.to(
            wolf.socketId
        ).emit(
            "wolfNightStarted",
            {
                nightNumber:
                    game.nightNumber
            }
        );
    }


    startTimer(
        60,
        () => {
            resolveNight();
        }
    );
}


function resolveNight() {

    if (
        !game.started ||
        game.gameOver
    ) {
        return;
    }


    const wolfTarget =
        getPlayer(
            game.nightActions
                .wolfTargetId
        );


    const guardTarget =
        getPlayer(
            game.nightActions
                .guardTargetId
        );


    const poisonTarget =
        getPlayer(
            game.nightActions
                .witchPoisonTargetId
        );


    const deaths = [];


    /*
     * Sói cắn
     */

    if (
        wolfTarget &&
        wolfTarget.alive &&
        (!guardTarget ||
            guardTarget.id !==
            wolfTarget.id) &&
        !game.nightActions
            .witchSave
    ) {

        killPlayer(
            wolfTarget,
            "bị Sói cắn"
        );

        deaths.push(
            wolfTarget
        );
    }


    /*
     * Phù thủy độc
     */

    if (
        poisonTarget &&
        poisonTarget.alive
    ) {

        if (
            !deaths.some(
                player =>
                    player.id ===
                    poisonTarget.id
            )
        ) {

            killPlayer(
                poisonTarget,
                "bị Phù thủy hạ độc"
            );

            deaths.push(
                poisonTarget
            );
        }
    }


    io.to("main_room").emit(
        "nightResult",
        {

            message:
                deaths.length
                    ? `☠️ Đêm qua có ${deaths.length} người chết.`
                    : "🌙 Đêm qua không có ai chết.",

            deaths:
                deaths.map(
                    player => ({
                        id:
                            player.id,

                        name:
                            player.name
                    })
                ),

            players:
                publicPlayers()
        }
    );


    if (
        checkWinner()
    ) {
        return;
    }


    setTimeout(
        () => beginDay(),
        2500
    );
}


/* =========================================================
   DAY SPEECH
========================================================= */

function beginDay() {

    if (
        !game.started ||
        game.gameOver
    ) {
        return;
    }


    game.phase =
        "daySpeech";


    game.speakingQueue =
        shuffle(
            alivePlayers()
                .map(
                    player =>
                        player.id
                )
        );


    game.speakingIndex =
        0;


    addLog(
        "☀️ Bắt đầu ban ngày."
    );


    /*
     * Chuyển sang ngày:
     * người sống chat chung.
     */

    io.to("main_room").emit(
        "phaseChanged",
        {
            phase:
                "daySpeech",

            players:
                publicPlayers()
        }
    );


    startNextSpeaker();
}


function startNextSpeaker() {

    while (
        game.speakingIndex <
        game.speakingQueue.length
    ) {

        const playerId =
            game.speakingQueue[
                game.speakingIndex
            ];


        const player =
            getPlayer(
                playerId
            );


        if (
            player &&
            player.alive
        ) {

            io.to("main_room").emit(
                "voiceTurn",
                {

                    playerId:
                        player.id,

                    playerName:
                        player.name,

                    round:
                        game.speakingIndex +
                        1,

                    seconds:
                        30
                }
            );


            startTimer(
                30,
                () => {

                    io.to(
                        "main_room"
                    ).emit(
                        "voiceEnded",
                        {
                            playerId:
                                player.id
                        }
                    );


                    game.speakingIndex++;

                    startNextSpeaker();
                }
            );


            return;
        }


        game.speakingIndex++;
    }


    beginDayVote();
}


/* =========================================================
   DAY VOTE
========================================================= */

function beginDayVote() {

    if (
        !game.started ||
        game.gameOver
    ) {
        return;
    }


    game.phase =
        "dayVote";


    game.dayVotes.clear();


    addLog(
        "🗳️ Bắt đầu bỏ phiếu."
    );


    io.to("main_room").emit(
        "phaseChanged",
        {
            phase:
                "dayVote",

            players:
                publicPlayers()
        }
    );


    io.to("main_room").emit(
        "voteUpdate",
        {
            votes: []
        }
    );


    startTimer(
        30,
        () => {
            resolveDayVote();
        }
    );
}


function resolveDayVote() {

    const counts =
        new Map();


    for (
        const targetId
        of game.dayVotes.values()
    ) {

        counts.set(
            targetId,
            (
                counts.get(
                    targetId
                ) || 0
            ) + 1
        );
    }


    let bestTargetId =
        null;

    let bestCount =
        0;

    let tie =
        false;


    for (
        const [targetId, count]
        of counts.entries()
    ) {

        if (
            count >
            bestCount
        ) {

            bestTargetId =
                targetId;

            bestCount =
                count;

            tie =
                false;

        } else if (
            count ===
                bestCount &&
            count > 0
        ) {

            tie =
                true;
        }
    }


    let executed =
        null;


    if (
        bestTargetId &&
        !tie
    ) {

        const target =
            getPlayer(
                bestTargetId
            );


        if (
            target &&
            target.alive
        ) {

            killPlayer(
                target,
                "bị dân làng bỏ phiếu"
            );


            executed = {
                id:
                    target.id,

                name:
                    target.name
            };
        }
    }


    io.to("main_room").emit(
        "voteResult",
        {

            executed,

            players:
                publicPlayers()
        }
    );


    if (
        checkWinner()
    ) {
        return;
    }


    setTimeout(
        () => beginNight(),
        2500
    );
}


/* =========================================================
   CONNECTION
========================================================= */

io.on(
    "connection",
    socket => {

        console.log(
            "✅ Connected:",
            socket.id
        );


        socket.data.playerId =
            null;

        socket.data.entered =
            false;


        /* =================================================
           ENTER GAME
        ================================================= */

        socket.on(
            "enterGame",
            ({ name }) => {

                if (
                    socket.data.entered
                ) {
                    return;
                }


                const cleanName =
                    String(
                        name || ""
                    )
                        .trim()
                        .slice(
                            0,
                            30
                        );


                if (
                    !cleanName
                ) {

                    socket.emit(
                        "enterError",
                        {
                            message:
                                "Vui lòng nhập tên."
                        }
                    );

                    return;
                }


                /*
                 * GAME ĐANG CHẠY:
                 * người mới không được vào.
                 */

                if (
                    game.started
                ) {

                    socket.emit(
                        "gameInProgress",
                        {
                            message:
                                "⚠️ Phòng đang trong ván game. Vui lòng quay lại sau khi game kết thúc."
                        }
                    );

                    return;
                }


                /*
                 * TỐI ĐA 20 NGƯỜI
                 */

                if (
                    game.players.size >=
                    20
                ) {

                    socket.emit(
                        "enterError",
                        {
                            message:
                                "Phòng đã đủ 20 người."
                        }
                    );

                    return;
                }


                /*
                 * HOST DUY NHẤT
                 *
                 * Người đầu tiên:
                 * Host
                 */

                const isFirstPlayer =
                    game.players.size ===
                    0;


                if (
                    isFirstPlayer
                ) {

                    game.hostSocketId =
                        socket.id;
                }


                const isHost =
                    game.hostSocketId ===
                    socket.id;


                const player = {

                    id:
                        `p_${socket.id}`,

                    socketId:
                        socket.id,

                    name:
                        cleanName,

                    alive:
                        true,

                    role:
                        null,

                    isHost
                };


                game.players.set(
                    player.id,
                    player
                );


                socket.data.playerId =
                    player.id;

                socket.data.entered =
                    true;


                socket.join(
                    "main_room"
                );


                addLog(
                    `${player.name} đã vào phòng.`
                );


                socket.emit(
                    "enteredGame",
                    {

                        yourPlayerId:
                            player.id,

                        yourName:
                            player.name,

                        isHost:

                            player.isHost,

                        room:
                            publicRoom()
                    }
                );


                broadcastRoom();
            }
        );


        /* =================================================
           START GAME
        ================================================= */

        socket.on(
            "startGame",
            () => {

                const player =
                    getPlayerBySocket(
                        socket.id
                    );


                if (
                    !player ||
                    !player.isHost
                ) {

                    socket.emit(
                        "errorMessage",
                        {
                            message:
                                "Chỉ Host mới được bắt đầu game."
                        }
                    );

                    return;
                }


                if (
                    game.started
                ) {
                    return;
                }


                const count =
                    game.players.size;


                if (
                    count < 6
                ) {

                    socket.emit(
                        "errorMessage",
                        {
                            message:
                                "Cần ít nhất 6 người để bắt đầu."
                        }
                    );

                    return;
                }


                if (
                    count > 20
                ) {

                    socket.emit(
                        "errorMessage",
                        {
                            message:
                                "Tối đa 20 người."
                        }
                    );

                    return;
                }


                game.started =
                    true;

                game.gameOver =
                    false;

                game.phase =
                    "night";

                game.nightNumber =
                    0;


                for (
                    const player
                    of game.players.values()
                ) {

                    player.alive =
                        true;

                    player.role =
                        null;
                }


                assignRoles();

                sendRoles();


                io.to("main_room").emit(
                    "gameStarted",
                    {

                        room:
                            publicRoom(),

                        players:
                            publicPlayers()
                    }
                );


                broadcastRoom();


                setTimeout(
                    () => beginNight(),
                    1000
                );
            }
        );


        /* =================================================
           WOLF
        ================================================= */

        socket.on(
            "wolfKill",
            ({ targetId }) => {

                if (
                    !game.started ||
                    game.phase !== "night"
                ) {
                    return;
                }


                const wolf =
                    getPlayerBySocket(
                        socket.id
                    );


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !wolf ||
                    !wolf.alive ||
                    wolf.role !== "Sói"
                ) {
                    return;
                }


                if (
                    !target ||
                    !target.alive ||
                    target.role === "Sói"
                ) {
                    return;
                }


                game.wolfVotes.set(
                    wolf.id,
                    target.id
                );


                const counts =
                    new Map();


                for (
                    const targetId
                    of game.wolfVotes.values()
                ) {

                    counts.set(
                        targetId,
                        (
                            counts.get(
                                targetId
                            ) || 0
                        ) + 1
                    );
                }


                let bestId =
                    null;

                let bestCount =
                    0;


                for (
                    const [id, count]
                    of counts.entries()
                ) {

                    if (
                        count >
                        bestCount
                    ) {

                        bestId =
                            id;

                        bestCount =
                            count;
                    }
                }


                game.nightActions
                    .wolfTargetId =
                    bestId;


                socket.emit(
                    "actionAccepted",
                    {

                        action:
                            "wolfKill",

                        targetId
                    }
                );


                /*
                 * CHỈ SÓI THẤY
                 */

                for (
                    const otherWolf
                    of aliveByRole(
                        "Sói"
                    )
                ) {

                    io.to(
                        otherWolf.socketId
                    ).emit(
                        "wolfVoteUpdate",
                        {

                            votes:
                                [
                                    ...counts
                                        .entries()
                                ].map(
                                    ([id, count]) => ({

                                        targetId:
                                            id,

                                        targetName:
                                            getPlayer(
                                                id
                                            )?.name ||
                                            "",

                                        count
                                    })
                                )
                        }
                    );
                }
            }
        );


        /* =================================================
           SEER
        ================================================= */

        socket.on(
            "seerInspect",
            ({ targetId }) => {

                if (
                    !game.started ||
                    game.phase !== "night"
                ) {
                    return;
                }


                const seer =
                    getPlayerBySocket(
                        socket.id
                    );


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !seer ||
                    !seer.alive ||
                    seer.role !==
                        "Tiên tri"
                ) {
                    return;
                }


                /*
                 * CHỈ 1 LẦN / ĐÊM
                 */

                if (
                    game.nightActions
                        .seerUsed
                ) {

                    socket.emit(
                        "seerError",
                        {
                            message:
                                "🔮 Bạn đã soi 1 người trong đêm này."
                        }
                    );

                    return;
                }


                if (
                    !target ||
                    !target.alive ||
                    target.id ===
                        seer.id
                ) {
                    return;
                }


                game.nightActions
                    .seerUsed =
                    true;


                game.nightActions
                    .seerTargetId =
                    target.id;


                /*
                 * LUẬT SOI:
                 *
                 * Dân làng = Thiện
                 * Tất cả vai khác = Không rõ
                 */

                const result =
                    target.role ===
                        "Dân làng"
                        ? "Thiện"
                        : "Không rõ";


                socket.emit(
                    "seerResult",
                    {

                        targetId:
                            target.id,

                        targetName:
                            target.name,

                        result
                    }
                );
            }
        );


        /* =================================================
           GUARD
        ================================================= */

        socket.on(
            "guardProtect",
            ({ targetId }) => {

                if (
                    !game.started ||
                    game.phase !== "night"
                ) {
                    return;
                }


                const guard =
                    getPlayerBySocket(
                        socket.id
                    );


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !guard ||
                    !guard.alive ||
                    guard.role !==
                        "Bảo vệ"
                ) {
                    return;
                }


                if (
                    !target ||
                    !target.alive
                ) {
                    return;
                }


                game.nightActions
                    .guardTargetId =
                    target.id;


                socket.emit(
                    "actionAccepted",
                    {

                        action:
                            "guardProtect",

                        targetId
                    }
                );
            }
        );


        /* =================================================
           WITCH SAVE
        ================================================= */

        socket.on(
            "witchSave",
            () => {

                if (
                    !game.started ||
                    game.phase !== "night"
                ) {
                    return;
                }


                const witch =
                    getPlayerBySocket(
                        socket.id
                    );


                if (
                    !witch ||
                    !witch.alive ||
                    witch.role !==
                        "Phù thủy"
                ) {
                    return;
                }


                if (
                    game.witch.saveUsed
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "Bạn đã dùng bình cứu."
                        }
                    );

                    return;
                }


                if (
                    !game.nightActions
                        .wolfTargetId
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "Sói chưa chọn mục tiêu."
                        }
                    );

                    return;
                }


                game.witch.saveUsed =
                    true;


                game.nightActions
                    .witchSave =
                    true;


                socket.emit(
                    "actionAccepted",
                    {
                        action:
                            "witchSave"
                    }
                );
            }
        );


        /* =================================================
           WITCH POISON
        ================================================= */

        socket.on(
            "witchPoison",
            ({ targetId }) => {

                if (
                    !game.started ||
                    game.phase !== "night"
                ) {
                    return;
                }


                const witch =
                    getPlayerBySocket(
                        socket.id
                    );


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !witch ||
                    !witch.alive ||
                    witch.role !==
                        "Phù thủy"
                ) {
                    return;
                }


                if (
                    game.witch.poisonUsed
                ) {
                    return;
                }


                if (
                    !target ||
                    !target.alive ||
                    target.id ===
                        witch.id
                ) {
                    return;
                }


                game.witch.poisonUsed =
                    true;


                game.nightActions
                    .witchPoisonTargetId =
                    target.id;


                socket.emit(
                    "actionAccepted",
                    {

                        action:
                            "witchPoison",

                        targetId
                    }
                );
            }
        );


        /* =================================================
           VOTE
        ================================================= */

        socket.on(
            "vote",
            ({ targetId }) => {

                if (
                    !game.started ||
                    game.phase !==
                        "dayVote"
                ) {
                    return;
                }


                const voter =
                    getPlayerBySocket(
                        socket.id
                    );


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !voter ||
                    !voter.alive ||
                    !target ||
                    !target.alive ||
                    target.id ===
                        voter.id
                ) {
                    return;
                }


                game.dayVotes.set(
                    voter.id,
                    target.id
                );


                const votes =
                    [
                        ...game.dayVotes
                            .entries()
                    ].map(
                        ([voterId, targetId]) => ({

                            voterId,

                            voterName:
                                getPlayer(
                                    voterId
                                )?.name ||
                                "",

                            targetId,

                            targetName:
                                getPlayer(
                                    targetId
                                )?.name ||
                                ""
                        })
                    );


                io.to("main_room").emit(
                    "voteUpdate",
                    {
                        votes
                    }
                );
            }
        );


        /* =================================================
           CHAT
        ================================================= */

        socket.on(
            "chatMessage",
            ({ message }) => {

                const player =
                    getPlayerBySocket(
                        socket.id
                    );


                if (
                    !player
                ) {
                    return;
                }


                /*
                 * NGƯỜI CHẾT KHÔNG ĐƯỢC CHAT
                 */

                if (
                    !player.alive
                ) {

                    socket.emit(
                        "chatError",
                        {
                            message:
                                "☠️ Người chết không được chat."
                        }
                    );

                    return;
                }


                const text =
                    String(
                        message || ""
                    )
                        .trim()
                        .slice(
                            0,
                            300
                        );


                if (!text) {
                    return;
                }


                /*
                 * BAN NGÀY
                 *
                 * Tất cả người sống
                 * đều thấy.
                 */

                if (
                    game.phase ===
                        "daySpeech" ||
                    game.phase ===
                        "dayVote"
                ) {

                    io.to(
                        "main_room"
                    ).emit(
                        "chatMessage",
                        {

                            channel:
                                "day",

                            playerId:
                                player.id,

                            playerName:
                                player.name,

                            message:
                                text,

                            time:
                                Date.now()
                        }
                    );

                    return;
                }


                /*
                 * BAN ĐÊM
                 *
                 * CHỈ SÓI.
                 */

                if (
                    game.phase ===
                        "night" &&
                    player.role ===
                        "Sói"
                ) {

                    const payload = {

                        channel:
                            "wolf",

                        playerId:
                            player.id,

                        playerName:
                            player.name,

                        message:
                            text,

                        time:
                            Date.now()
                    };


                    for (
                        const wolf
                        of aliveByRole(
                            "Sói"
                        )
                    ) {

                        io.to(
                            wolf.socketId
                        ).emit(
                            "chatMessage",
                            payload
                        );
                    }


                    return;
                }


                socket.emit(
                    "chatError",
                    {
                        message:
                            "🌙 Ban đêm chỉ Sói được chat với Sói."
                    }
                );
            }
        );


        /* =================================================
           HOST END GAME
        ================================================= */

        socket.on(
            "endGame",
            () => {

                const player =
                    getPlayerBySocket(
                        socket.id
                    );


                if (
                    !player ||
                    !player.isHost
                ) {

                    socket.emit(
                        "errorMessage",
                        {
                            message:
                                "Chỉ Host mới được kết thúc game."
                        }
                    );

                    return;
                }


                if (
                    !game.started
                ) {
                    return;
                }


                endGame(
                    "🛑 Host đã kết thúc game."
                );
            }
        );


        /* =================================================
           HOST FORCE NEXT PHASE
        ================================================= */

        socket.on(
            "forceNextPhase",
            () => {

                const player =
                    getPlayerBySocket(
                        socket.id
                    );


                if (
                    !player ||
                    !player.isHost
                ) {
                    return;
                }


                if (
                    !game.started
                ) {
                    return;
                }


                if (
                    game.phase ===
                        "night"
                ) {

                    stopTimer();

                    resolveNight();

                    return;
                }


                if (
                    game.phase ===
                        "daySpeech"
                ) {

                    stopTimer();

                    game.speakingIndex =
                        game.speakingQueue
                            .length;

                    startNextSpeaker();

                    return;
                }


                if (
                    game.phase ===
                        "dayVote"
                ) {

                    stopTimer();

                    resolveDayVote();
                }
            }
        );


        /* =================================================
           LEAVE ROOM
        ================================================= */

        socket.on(
            "leaveRoom",
            () => {

                const player =
                    getPlayerBySocket(
                        socket.id
                    );


                if (!player) {

                    socket.emit(
                        "leftRoom"
                    );

                    return;
                }


                /*
                 * HOST THOÁT
                 */

                if (
                    player.isHost
                ) {

                    stopTimer();


                    io.to(
                        "main_room"
                    ).emit(
                        "roomClosed",
                        {
                            message:
                                "👑 Host đã thoát. Phòng đã đóng."
                        }
                    );


                    game.players.clear();

                    game.hostSocketId =
                        null;

                    game.started =
                        false;

                    game.gameOver =
                        false;

                    game.phase =
                        "lobby";

                    game.nightNumber =
                        0;

                    game.wolfVotes.clear();

                    game.dayVotes.clear();

                    game.speakingQueue =
                        [];

                    game.speakingIndex =
                        0;

                    game.logs =
                        [];


                    io.socketsLeave(
                        "main_room"
                    );


                    for (
                        const s
                        of io.sockets.sockets.values()
                    ) {

                        if (
                            s.data.playerId
                        ) {

                            s.data.playerId =
                                null;

                            s.data.entered =
                                false;
                        }
                    }


                    socket.emit(
                        "leftRoom"
                    );


                    return;
                }


                /*
                 * PLAYER THƯỜNG THOÁT
                 */

                game.players.delete(
                    player.id
                );


                game.dayVotes.delete(
                    player.id
                );


                game.wolfVotes.delete(
                    player.id
                );


                socket.leave(
                    "main_room"
                );


                socket.data.playerId =
                    null;

                socket.data.entered =
                    false;


                addLog(
                    `${player.name} đã rời phòng.`
                );


                broadcastPlayers();

                broadcastRoom();


                socket.emit(
                    "leftRoom"
                );
            }
        );


        /* =================================================
           DISCONNECT
        ================================================= */

        socket.on(
            "disconnect",
            () => {

                console.log(
                    "❌ Disconnected:",
                    socket.id
                );


                const player =
                    getPlayerBySocket(
                        socket.id
                    );


                if (!player) {
                    return;
                }


                /*
                 * HOST MẤT KẾT NỐI
                 */

                if (
                    player.isHost
                ) {

                    stopTimer();


                    io.to(
                        "main_room"
                    ).emit(
                        "roomClosed",
                        {
                            message:
                                "👑 Host đã mất kết nối. Phòng đã đóng."
                        }
                    );


                    game.players.clear();

                    game.hostSocketId =
                        null;

                    game.started =
                        false;

                    game.gameOver =
                        false;

                    game.phase =
                        "lobby";

                    game.nightNumber =
                        0;

                    game.wolfVotes.clear();

                    game.dayVotes.clear();

                    game.speakingQueue =
                        [];

                    game.speakingIndex =
                        0;

                    game.logs =
                        [];


                    return;
                }


                /*
                 * PLAYER MẤT KẾT NỐI
                 */

                game.players.delete(
                    player.id
                );


                game.dayVotes.delete(
                    player.id
                );


                game.wolfVotes.delete(
                    player.id
                );


                addLog(
                    `${player.name} đã mất kết nối.`
                );


                broadcastPlayers();

                broadcastRoom();
            }
        );
    }
);


/* =========================================================
   START SERVER
========================================================= */

server.listen(
    PORT,
    () => {

        console.log(
            `🐺 Ma Sói Online chạy tại port ${PORT}`
        );

    }
);
