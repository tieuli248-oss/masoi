const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(
    cors({
        origin: "*"
    })
);

app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },

    transports: [
        "websocket",
        "polling"
    ]
});

const PORT =
    process.env.PORT || 3000;


/* =====================================================
   SERVER TEST
===================================================== */

app.get("/", (req, res) => {
    res.send("🐺 Ma Sói Online Server OK");
});


/* =====================================================
   GAME DUY NHẤT
===================================================== */

const game = {

    /*
     * HOST
     *
     * hostSocketId:
     * socket hiện tại của Host.
     *
     * Host disconnect:
     * => null
     *
     *
     * hostPlayerId:
     * ID cố định của Host.
     *
     *
     * hostDeviceId:
     * Device ID dùng để nhận diện Host reconnect.
     */

    hostSocketId: null,

    hostPlayerId: null,

    hostDeviceId: null,


    /*
     * playerId -> player
     */
    players: new Map(),


    /*
     * GAME STATE
     */

    started: false,

    gameOver: false,

    phase: "lobby",

    nightNumber: 0,


    /*
     * TIMER
     */

    timer: null,

    phaseEndsAt: null,


    /*
     * WOLF VOTES
     *
     * wolfPlayerId -> targetPlayerId
     */

    wolfVotes: new Map(),


    /*
     * DAY VOTES
     *
     * voterPlayerId -> targetPlayerId
     */

    dayVotes: new Map(),


    /*
     * NIGHT ACTIONS
     */

    nightActions: {

        wolfTargetId: null,

        seerTargetId: null,

        seerUsed: false,

        guardTargetId: null,

        witchSave: false,

        witchPoisonTargetId: null
    },


    /*
     * WITCH
     */

    witch: {

        saveUsed: false,

        poisonUsed: false
    },


    /*
     * LOG
     */

    logs: []
};


/* =====================================================
   UTILITY
===================================================== */

function cleanDeviceId(deviceId) {

    return String(
        deviceId || ""
    )
        .trim()
        .slice(
            0,
            200
        );
}


function createPlayerId() {

    return (
        "p_" +
        Date.now() +
        "_" +
        Math.random()
            .toString(36)
            .slice(
                2,
                10
            )
    );
}


function shuffle(array) {

    return [...array].sort(
        () =>
            Math.random() - 0.5
    );
}


function getPlayerBySocket(socketId) {

    return [
        ...game.players.values()
    ].find(
        player =>
            player.socketId ===
            socketId
    ) || null;
}


function getPlayer(playerId) {

    return (
        game.players.get(
            playerId
        ) || null
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

    return alivePlayers()
        .filter(
            player =>
                player.role ===
                role
        );
}


/* =====================================================
   PUBLIC DATA
===================================================== */

function publicPlayer(player) {

    return {

        id:
            player.id,

        name:
            player.name,

        alive:
            player.alive,

        isHost:
            player.isHost,

        connected:
            player.connected !== false,

        /*
         * Chỉ hiện lý do chết nếu đã chết.
         */
        deathReasons:
            player.alive

                ? []

                : (
                    player.deathReasons || []
                )
    };
}


function publicPlayers() {

    return [
        ...game.players.values()
    ].map(
        publicPlayer
    );
}


function publicRoom() {

    return {

        id:
            "main_room",

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
            game.logs.slice(
                -60
            )
    };
}


/* =====================================================
   LOG
===================================================== */

function addLog(text) {

    game.logs.push({

        text,

        time:
            Date.now()
    });


    if (
        game.logs.length > 100
    ) {

        game.logs.shift();
    }
}


/* =====================================================
   BROADCAST
===================================================== */

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


/* =====================================================
   RESET GAME CHO VÁN MỚI
===================================================== */

function resetGameForNewRound() {

    stopTimer();


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


    game.witch = {

        saveUsed:
            false,

        poisonUsed:
            false
    };


    /*
     * Giữ nguyên:
     *
     * - playerId
     * - Host
     * - Device ID
     * - name
     * - connected
     *
     * Reset:
     *
     * - role
     * - alive
     * - deathReasons
     */

    for (
        const player
        of game.players.values()
    ) {

        player.alive =
            true;

        player.role =
            null;

        player.deathReasons =
            [];
    }
}


/* =====================================================
   TIMER
===================================================== */

function stopTimer() {

    if (
        game.timer
    ) {

        clearInterval(
            game.timer
        );

        game.timer =
            null;
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


                io.to("main_room").emit(

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


/* =====================================================
   ROLE CONFIGURATION
===================================================== */

function getRoleConfiguration(
    count
) {

    let wolves =
        0;


    const roles =
        [];


    /*
     * 6 - 7
     *
     * 2 Sói
     * Tiên tri
     * Bảo vệ
     * Phù thủy
     * Còn lại Dân làng
     */

    if (
        count >= 6 &&
        count <= 7
    ) {

        wolves =
            2;


        roles.push(

            "Tiên tri",

            "Bảo vệ",

            "Phù thủy"
        );
    }


    /*
     * 8 - 9
     *
     * 2 Sói
     * Tiên tri
     * Bảo vệ
     *
     * 8 = Phù thủy
     * 9 = Thợ săn
     */

    else if (
        count >= 8 &&
        count <= 9
    ) {

        wolves =
            2;


        roles.push(

            "Tiên tri",

            "Bảo vệ"
        );


        roles.push(

            count === 8

                ? "Phù thủy"

                : "Thợ săn"
        );
    }


    /*
     * 10
     *
     * 2 Sói
     *
     * 11
     *
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
     *
     * 3 Sói
     */

    else if (
        count >= 12 &&
        count <= 14
    ) {

        wolves =
            3;


        roles.push(

            "Tiên tri",

            "Bảo vệ",

            "Phù thủy",

            "Thợ săn"
        );
    }


    /*
     * 15
     *
     * 3 Sói
     *
     * 16 - 17
     *
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
     *
     * 4 Sói
     */

    else if (
        count >= 18 &&
        count <= 20
    ) {

        wolves =
            4;


        roles.push(

            "Tiên tri",

            "Bảo vệ",

            "Phù thủy",

            "Thợ săn",

            "Cupid",

            "Già làng"
        );
    }


    /*
     * Thêm Sói
     */

    for (
        let i = 0;
        i < wolves;
        i++
    ) {

        roles.push(
            "Sói"
        );
    }


    /*
     * Thêm Dân làng
     */

    while (
        roles.length <
        count
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

        (
            player,
            index
        ) => {

            player.role =
                roles[index];

            player.alive =
                true;

            player.deathReasons =
                [];
        }
    );
}


function sendRoles() {

    for (
        const player
        of game.players.values()
    ) {

        if (
            !player.socketId
        ) {

            continue;
        }


        const socket =
            io.sockets.sockets.get(
                player.socketId
            );


        if (
            !socket
        ) {

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


/* =====================================================
   WINNER
===================================================== */

function checkWinner() {

    if (
        !game.started
    ) {

        return false;
    }


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


    /*
     * Hết Sói
     * => Dân làng thắng
     */

    if (
        wolves.length === 0
    ) {

        endGame(
            "🎉 Dân làng thắng!"
        );

        return true;
    }


    /*
     * Sói >= phe còn lại
     * => Sói thắng
     */

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


/* =====================================================
   END GAME
===================================================== */

function endGame(
    message
) {

    stopTimer();


    game.started =
        false;


    game.gameOver =
        true;


    game.phase =
        "gameOver";


    addLog(
        message
    );


    const resultPlayers =
        [
            ...game.players.values()
        ].map(

            player => ({

                ...publicPlayer(
                    player
                ),

                role:
                    player.role,

                deathReasons:
                    player.deathReasons ||
                    []
            })
        );


    io.to("main_room").emit(

        "gameEnded",

        {

            message,

            players:
                resultPlayers
        }
    );


    broadcastRoom();
}


/* =====================================================
   KILL PLAYER
===================================================== */

function killPlayer(
    player,
    reasons = []
) {

    if (
        !player ||
        !player.alive
    ) {

        return false;
    }


    /*
     * Cho phép truyền:
     *
     * "lý do"
     *
     * hoặc:
     *
     * ["lý do 1", "lý do 2"]
     */

    const finalReasons =
        Array.isArray(
            reasons
        )

            ? reasons

            : [
                reasons
            ];


    player.alive =
        false;


    player.deathReasons =
        finalReasons.filter(
            Boolean
        );


    addLog(

        `☠️ ${player.name} đã chết${
            player.deathReasons.length
                ? ` (${player.deathReasons.join(" + ")})`
                : ""
        }.`
    );


    /*
     * Nếu player online:
     * gửi thông báo DEAD.
     */

    if (
        player.socketId
    ) {

        io.to(
            player.socketId
        ).emit(

            "dead",

            {

                playerId:
                    player.id,

                message:
                    player.deathReasons.length

                        ? `Bạn đã chết: ${player.deathReasons.join(" + ")}`

                        : "Bạn đã chết.",

                reasons:
                    [
                        ...player.deathReasons
                    ]
            }
        );
    }


    broadcastPlayers();

    broadcastRoom();


    return true;
}


/* =====================================================
   NIGHT
===================================================== */

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


    game.nightNumber++;


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
     * Báo cho Sói sống
     */

    for (
        const wolf
        of aliveByRole("Sói")
    ) {

        if (
            !wolf.socketId
        ) {

            continue;
        }


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


    /*
     * Đêm = 60 giây
     */

    startTimer(
        60,
        resolveNight
    );
}


/* =====================================================
   RESOLVE NIGHT
===================================================== */

function resolveNight() {

    if (
        game.phase !==
        "night"
    ) {

        return;
    }


    stopTimer();


    const wolfTargetId =
        game.nightActions
            .wolfTargetId;


    const guardTargetId =
        game.nightActions
            .guardTargetId;


    const poisonTargetId =
        game.nightActions
            .witchPoisonTargetId;


    const witchSave =
        game.nightActions
            .witchSave;


    /*
     * playerId -> reasons[]
     */

    const deaths =
        new Map();


    function addDeath(
        playerId,
        reason
    ) {

        if (
            !playerId
        ) {

            return;
        }


        const player =
            getPlayer(
                playerId
            );


        if (
            !player ||
            !player.alive
        ) {

            return;
        }


        if (
            !deaths.has(
                playerId
            )
        ) {

            deaths.set(

                playerId,

                []
            );
        }


        deaths
            .get(playerId)
            .push(
                reason
            );
    }


    /* =================================================
       SÓI CẮN
    ================================================= */

    if (
        wolfTargetId
    ) {

        const target =
            getPlayer(
                wolfTargetId
            );


        if (
            target &&
            target.alive
        ) {

            const protectedByGuard =
                guardTargetId ===
                wolfTargetId;


            const savedByWitch =
                witchSave === true;


            if (
                !protectedByGuard &&
                !savedByWitch
            ) {

                addDeath(

                    wolfTargetId,

                    "🐺 Bị Sói cắn"
                );
            }
        }
    }


    /* =================================================
       PHÙ THỦY ĐẦU ĐỘC
    ================================================= */

    if (
        poisonTargetId
    ) {

        const target =
            getPlayer(
                poisonTargetId
            );


        if (
            target &&
            target.alive
        ) {

            /*
             * Guard không chặn độc.
             */

            addDeath(

                poisonTargetId,

                "☠️ Bị Phù thủy đầu độc"
            );
        }
    }


    /* =================================================
       ÁP DỤNG CHẾT
    ================================================= */

    const deathList =
        [];


    for (
        const [
            playerId,
            reasons
        ]
        of deaths.entries()
    ) {

        const player =
            getPlayer(
                playerId
            );


        if (
            !player ||
            !player.alive
        ) {

            continue;
        }


        killPlayer(
            player,
            reasons
        );


        deathList.push({

            id:
                player.id,

            name:
                player.name,

            reasons:
                [
                    ...reasons
                ]
        });
    }


    /* =================================================
       LOG
    ================================================= */

    if (
        deathList.length
    ) {

        addLog(

            `🌙 Kết thúc đêm ${game.nightNumber}: ` +
            deathList
                .map(

                    death =>
                        `${death.name} — ${death.reasons.join(" + ")}`
                )
                .join("; ")
        );

    } else {

        addLog(

            `🌙 Kết thúc đêm ${game.nightNumber}: Không có ai chết.`
        );
    }


    /* =================================================
       GỬI KẾT QUẢ ĐÊM
    ================================================= */

    io.to("main_room").emit(

        "nightResult",

        {

            nightNumber:
                game.nightNumber,

            message:

                deathList.length

                    ? `☠️ Đêm ${game.nightNumber} có ${deathList.length} người chết.`

                    : `🌙 Đêm ${game.nightNumber} không có ai chết.`,

            deaths:
                deathList,

            players:
                publicPlayers()
        }
    );


    broadcastPlayers();

    broadcastRoom();


    /*
     * Kiểm tra thắng
     */

    if (
        checkWinner()
    ) {

        return;
    }


    /*
     * Sang ngày sau 2.5 giây
     */

    setTimeout(

        beginDay,

        2500
    );
}


/* =====================================================
   DAY
===================================================== */

function beginDay() {

    if (

        !game.started ||

        game.gameOver

    ) {

        return;
    }


    game.phase =
        "daySpeech";


    addLog(

        "☀️ Bắt đầu thảo luận. Mọi người có 5 phút để bàn bạc."
    );


    io.to("main_room").emit(

        "phaseChanged",

        {

            phase:
                "daySpeech",

            players:
                publicPlayers()
        }
    );


    /*
     * 5 phút
     * cho toàn bộ người sống.
     */

    startTimer(
        300,
        beginDayVote
    );
}


/* =====================================================
   DAY VOTE
===================================================== */

function beginDayVote() {

    if (

        !game.started ||

        game.gameOver

    ) {

        return;
    }


    stopTimer();


    game.phase =
        "dayVote";


    game.dayVotes.clear();


    addLog(

        "🗳️ Bắt đầu biểu quyết. Mọi người có 30 giây."
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


    /*
     * Reset vote UI
     */

    io.to("main_room").emit(

        "voteUpdate",

        {

            votes: []
        }
    );


    /*
     * Vote = 30 giây
     */

    startTimer(
        30,
        resolveDayVote
    );
}


/* =====================================================
   RESOLVE DAY VOTE
===================================================== */

function resolveDayVote() {

    if (
        game.phase !==
        "dayVote"
    ) {

        return;
    }


    stopTimer();


    /*
     * =================================================
     * AI VOTE AI
     * =================================================
     */

    const voteDetails =
        [];


    /*
     * targetId -> số phiếu
     */

    const voteCounts =
        new Map();


    for (
        const [
            voterId,
            targetId
        ]
        of game.dayVotes.entries()
    ) {

        const voter =
            getPlayer(
                voterId
            );


        const target =
            getPlayer(
                targetId
            );


        /*
         * Vote phải hợp lệ.
         */

        if (
            !voter ||
            !target
        ) {

            continue;
        }


        if (
            !voter.alive ||
            !target.alive
        ) {

            continue;
        }


        /*
         * Không tự vote.
         */

        if (
            voter.id ===
            target.id
        ) {

            continue;
        }


        /*
         * Lưu chi tiết:
         *
         * Ai -> ai
         */

        voteDetails.push({

            voterId:
                voter.id,

            voterName:
                voter.name,

            targetId:
                target.id,

            targetName:
                target.name
        });


        /*
         * Đếm phiếu
         */

        voteCounts.set(

            target.id,

            (
                voteCounts.get(
                    target.id
                ) || 0
            ) + 1
        );
    }


    /*
     * =================================================
     * TÌM MAX
     * =================================================
     */

    let maxVotes =
        0;


    let topTargets =
        [];


    for (
        const [
            targetId,
            count
        ]
        of voteCounts.entries()
    ) {

        if (
            count >
            maxVotes
        ) {

            maxVotes =
                count;


            topTargets =
                [
                    targetId
                ];

        }

        else if (
            count ===
            maxVotes
        ) {

            topTargets.push(
                targetId
            );
        }
    }


    /*
     * =================================================
     * TỔNG PHIẾU
     * =================================================
     */

    const voteSummary =
        [
            ...voteCounts.entries()
        ]
            .map(

                ([
                    playerId,
                    count
                ]) => {

                    const player =
                        getPlayer(
                            playerId
                        );


                    return {

                        playerId,

                        playerName:
                            player
                                ?.name ||
                            "Không rõ",

                        count
                    };
                }
            )
            .sort(

                (a, b) =>
                    b.count -
                    a.count
            );


    /*
     * =================================================
     * XỬ TỬ
     * =================================================
     */

    let executed =
        null;


    let resultReason =
        "";


    /*
     * KHÔNG CÓ VOTE
     */

    if (
        maxVotes === 0
    ) {

        resultReason =
            "🗳️ Không có phiếu hợp lệ, không ai bị xử tử.";
    }


    /*
     * HÒA PHIẾU
     */

    else if (
        topTargets.length > 1
    ) {

        resultReason =

            `⚖️ Hòa phiếu (${maxVotes} phiếu), không ai bị xử tử.`;
    }


    /*
     * CÓ NGƯỜI NHIỀU PHIẾU NHẤT
     */

    else {

        const targetId =
            topTargets[0];


        const target =
            getPlayer(
                targetId
            );


        if (
            target &&
            target.alive
        ) {

            const reason =
                `🗳️ Bị dân làng xử tử với ${maxVotes} phiếu`;


            killPlayer(

                target,

                [
                    reason
                ]
            );


            executed = {

                playerId:
                    target.id,

                playerName:
                    target.name,

                votes:
                    maxVotes,

                reason
            };


            resultReason =

                `☠️ ${target.name} bị xử tử với ${maxVotes} phiếu.`;
        }

        else {

            resultReason =
                "🗳️ Mục tiêu không còn hợp lệ, không ai bị xử tử.";
        }
    }


    /*
     * =================================================
     * LOG
     * =================================================
     */

    addLog(
        resultReason
    );


    /*
     * =================================================
     * GỬI KẾT QUẢ
     *
     * votes:
     *   Ai vote ai
     *
     * voteCounts:
     *   Tổng số phiếu
     *
     * executed:
     *   Người bị xử tử
     * =================================================
     */

    io.to("main_room").emit(

        "voteResult",

        {

            message:
                resultReason,

            votes:
                voteDetails,

            voteCounts:
                voteSummary,

            executed,

            players:
                publicPlayers()
        }
    );


    broadcastPlayers();

    broadcastRoom();


    /*
     * Xóa phiếu sau khi công khai
     */

    game.dayVotes.clear();


    /*
     * Kiểm tra thắng
     */

    if (
        checkWinner()
    ) {

        return;
    }


    /*
     * Sang đêm tiếp
     */

    setTimeout(

        beginNight,

        2500
    );
}


/* =====================================================
   SOCKET
===================================================== */

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

            ({
                name,
                deviceId
            }) => {

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


                const cleanDevice =
                    cleanDeviceId(
                        deviceId
                    );


                /*
                 * Tên
                 */

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
                 * Device ID
                 */

                if (
                    !cleanDevice
                ) {

                    socket.emit(

                        "enterError",

                        {

                            message:
                                "Không tìm thấy Device ID. Vui lòng tải lại trang."
                        }
                    );


                    return;
                }


                console.log(

                    "ENTER:",

                    cleanName,

                    "| DEVICE:",

                    cleanDevice,

                    "| SOCKET:",

                    socket.id
                );


                /* =================================================
                   HOST RECONNECT
                ================================================= */

                /*
                 * Device ID trùng Host:
                 *
                 * => khôi phục Host cũ
                 *
                 * Không tạo player mới.
                 *
                 * Role/alive/phase/timer giữ nguyên.
                 */

                if (

                    game.hostPlayerId &&

                    game.hostDeviceId &&

                    cleanDevice ===
                        game.hostDeviceId

                ) {

                    const hostPlayer =
                        game.players.get(
                            game.hostPlayerId
                        );


                    if (
                        hostPlayer
                    ) {

                        /*
                         * Gắn socket mới.
                         */

                        hostPlayer.socketId =
                            socket.id;


                        hostPlayer.connected =
                            true;


                        hostPlayer.isHost =
                            true;


                        hostPlayer.deviceId =
                            game.hostDeviceId;


                        hostPlayer.name =
                            cleanName;


                        game.hostSocketId =
                            socket.id;


                        socket.data.playerId =
                            hostPlayer.id;


                        socket.data.entered =
                            true;


                        socket.join(
                            "main_room"
                        );


                        addLog(

                            `👑 Host ${hostPlayer.name} đã kết nối lại.`
                        );


                        /*
                         * Gửi lại room
                         */

                        socket.emit(

                            "enteredGame",

                            {

                                yourPlayerId:
                                    hostPlayer.id,

                                yourName:
                                    hostPlayer.name,

                                isHost:
                                    true,

                                room:
                                    publicRoom()
                            }
                        );


                        /*
                         * Nếu game đang chạy
                         */

                        if (
                            game.started
                        ) {

                            /*
                             * Gửi role
                             */

                            socket.emit(

                                "roleAssigned",

                                {

                                    role:
                                        hostPlayer.role
                                }
                            );


                            /*
                             * Gửi phase
                             */

                            socket.emit(

                                "phaseChanged",

                                {

                                    phase:
                                        game.phase,

                                    nightNumber:
                                        game.nightNumber,

                                    players:
                                        publicPlayers()
                                }
                            );


                            /*
                             * Gửi timer còn lại.
                             */

                            if (
                                game.phaseEndsAt
                            ) {

                                socket.emit(

                                    "phaseTimer",

                                    {

                                        seconds:
                                            Math.max(

                                                1,

                                                Math.ceil(

                                                    (
                                                        game.phaseEndsAt -
                                                        Date.now()
                                                    ) / 1000
                                                )
                                            ),

                                        remaining:
                                            remainingTime()
                                    }
                                );
                            }


                            /*
                             * Nếu Host là Sói
                             * và đang ban đêm
                             */

                            if (

                                game.phase ===
                                    "night" &&

                                hostPlayer.alive &&

                                hostPlayer.role ===
                                    "Sói"

                            ) {

                                socket.emit(

                                    "wolfNightStarted",

                                    {

                                        nightNumber:
                                            game.nightNumber
                                    }
                                );
                            }
                        }


                        broadcastPlayers();

                        broadcastRoom();


                        return;
                    }
                }


                /* =================================================
                   GAME ĐANG CHẠY
                ================================================= */

                /*
                 * Người mới không phải Host
                 * không được vào.
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


                /* =================================================
                   TỐI ĐA 20
                ================================================= */

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


                /* =================================================
                   HOST ĐẦU TIÊN
                ================================================= */

                const isFirst =
                    game.players.size === 0;


                let isHost =
                    false;


                if (

                    isFirst &&

                    !game.hostPlayerId

                ) {

                    isHost =
                        true;


                    game.hostPlayerId =
                        createPlayerId();


                    game.hostDeviceId =
                        cleanDevice;


                    game.hostSocketId =
                        socket.id;
                }


                /*
                 * Host dùng ID cố định.
                 *
                 * Player thường tạo ID mới.
                 */

                const playerId =
                    isHost

                        ? game.hostPlayerId

                        : createPlayerId();


                const player = {

                    id:
                        playerId,

                    socketId:
                        socket.id,

                    deviceId:
                        cleanDevice,

                    name:
                        cleanName,

                    alive:
                        true,

                    role:
                        null,

                    deathReasons:
                        [],

                    isHost:
                        isHost,

                    connected:
                        true
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

                    isHost

                        ? `👑 ${player.name} đã vào phòng với tư cách Host.`

                        : `${player.name} đã vào phòng.`
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


                /*
                 * Nếu ván trước đã kết thúc,
                 * reset dữ liệu.
                 */

                if (
                    game.gameOver
                ) {

                    resetGameForNewRound();
                }


                game.started =
                    true;


                game.gameOver =
                    false;


                game.phase =
                    "lobby";


                game.nightNumber =
                    0;


                game.dayVotes.clear();

                game.wolfVotes.clear();


                game.witch = {

                    saveUsed:
                        false,

                    poisonUsed:
                        false
                };


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


                /*
                 * Bắt đầu đêm đầu tiên
                 */

                setTimeout(

                    beginNight,

                    1000
                );
            }
        );


        /* =================================================
           WOLF KILL
        ================================================= */

        socket.on(

            "wolfKill",

            ({
                targetId
            }) => {

                if (

                    !game.started ||

                    game.phase !==
                        "night"

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

                    wolf.role !==
                        "Sói"

                ) {

                    return;
                }


                if (

                    !target ||

                    !target.alive ||

                    target.role ===
                        "Sói"

                ) {

                    return;
                }


                /*
                 * Sói chọn mục tiêu.
                 *
                 * Mỗi Sói có 1 vote.
                 */

                game.wolfVotes.set(

                    wolf.id,

                    target.id
                );


                /*
                 * Đếm vote Sói.
                 */

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


                /*
                 * Người nhiều vote nhất
                 * là mục tiêu tạm thời.
                 *
                 * Nếu hòa:
                 * không xử lý đặc biệt ở đây;
                 * mục tiêu đầu tiên có max
                 * sẽ được dùng.
                 */

                let bestId =
                    null;


                let bestCount =
                    0;


                for (
                    const [
                        id,
                        count
                    ]
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
                 * Chỉ Sói sống nhận
                 * kết quả vote Sói.
                 */

                const wolfVoteList =
                    [
                        ...counts.entries()
                    ].map(

                        ([
                            id,
                            count
                        ]) => ({

                            targetId:
                                id,

                            targetName:
                                getPlayer(
                                    id
                                )?.name ||
                                "",

                            count
                        })
                    );


                for (
                    const wolfPlayer
                    of aliveByRole("Sói")
                ) {

                    if (
                        !wolfPlayer.socketId
                    ) {

                        continue;
                    }


                    io.to(
                        wolfPlayer.socketId
                    ).emit(

                        "wolfVoteUpdate",

                        {

                            votes:
                                wolfVoteList
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

            ({
                targetId
            }) => {

                if (

                    !game.started ||

                    game.phase !==
                        "night"

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


                if (
                    game.nightActions
                        .seerUsed
                ) {

                    socket.emit(

                        "seerError",

                        {

                            message:
                                "🔮 Bạn chỉ được soi 1 người mỗi đêm."
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
                 * Theo luật hiện tại:
                 *
                 * Dân làng => Thiện
                 * Các role khác => Không rõ
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

            ({
                targetId
            }) => {

                if (

                    !game.started ||

                    game.phase !==
                        "night"

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

                    game.phase !==
                        "night"

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

            ({
                targetId
            }) => {

                if (

                    !game.started ||

                    game.phase !==
                        "night"

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

                    socket.emit(

                        "actionError",

                        {

                            message:
                                "Bạn đã dùng bình độc."
                        }
                    );


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
           DAY VOTE
        ================================================= */

        socket.on(

            "vote",

            ({
                targetId
            }) => {

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


                /*
                 * Người vote phải còn sống.
                 */

                if (

                    !voter ||

                    !voter.alive

                ) {

                    return;
                }


                /*
                 * Target phải còn sống.
                 */

                if (

                    !target ||

                    !target.alive

                ) {

                    return;
                }


                /*
                 * Không được tự vote.
                 */

                if (
                    voter.id ===
                    target.id
                ) {

                    socket.emit(

                        "actionError",

                        {

                            message:
                                "Bạn không thể tự vote chính mình."
                        }
                    );


                    return;
                }


                /*
                 * 1 người = 1 phiếu.
                 *
                 * Vote lại:
                 * đổi mục tiêu.
                 */

                game.dayVotes.set(

                    voter.id,

                    target.id
                );


                /*
                 * Tạo danh sách hiện tại.
                 */

                const votes =
                    [
                        ...game.dayVotes.entries()
                    ]
                        .map(

                            ([
                                voterId,
                                targetId
                            ]) => {

                                const voterPlayer =
                                    getPlayer(
                                        voterId
                                    );


                                const targetPlayer =
                                    getPlayer(
                                        targetId
                                    );


                                if (

                                    !voterPlayer ||
                                    !targetPlayer

                                ) {

                                    return null;
                                }


                                return {

                                    voterId:
                                        voterId,

                                    voterName:
                                        voterPlayer.name,

                                    targetId:
                                        targetId,

                                    targetName:
                                        targetPlayer.name
                                };
                            }
                        )
                        .filter(
                            Boolean
                        );


                /*
                 * Giữ realtime vote.
                 *
                 * Frontend có thể dùng
                 * để hiển thị vote hiện tại.
                 */

                io.to("main_room").emit(

                    "voteUpdate",

                    {

                        votes
                    }
                );


                /*
                 * Xác nhận cho người vote.
                 */

                socket.emit(

                    "actionAccepted",

                    {

                        action:
                            "vote",

                        targetId
                    }
                );
            }
        );


        /* =================================================
           CHAT
        ================================================= */

        socket.on(

            "chatMessage",

            ({
                message
            }) => {

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
                 * Người chết không chat.
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


                if (
                    !text
                ) {

                    return;
                }


                /* =================================================
                   BAN NGÀY
                ================================================= */

                if (

                    game.phase ===
                        "daySpeech" ||

                    game.phase ===
                        "dayVote"

                ) {

                    const payload = {

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
                    };


                    /*
                     * Chỉ người sống nhận chat.
                     */

                    for (
                        const alivePlayer
                        of alivePlayers()
                    ) {

                        if (
                            !alivePlayer.socketId
                        ) {

                            continue;
                        }


                        io.to(
                            alivePlayer.socketId
                        ).emit(

                            "chatMessage",

                            payload
                        );
                    }


                    return;
                }


                /* =================================================
                   BAN ĐÊM
                ================================================= */

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


                    /*
                     * Chỉ Sói sống nhận.
                     */

                    for (
                        const wolf
                        of aliveByRole("Sói")
                    ) {

                        if (
                            !wolf.socketId
                        ) {

                            continue;
                        }


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

                    !player.isHost ||

                    !game.started

                ) {

                    return;
                }


                /*
                 * ĐÊM
                 * => Kết thúc đêm ngay
                 */

                if (
                    game.phase ===
                    "night"
                ) {

                    stopTimer();

                    resolveNight();

                    return;
                }


                /*
                 * THẢO LUẬN
                 * => Sang vote
                 */

                if (
                    game.phase ===
                    "daySpeech"
                ) {

                    stopTimer();

                    beginDayVote();

                    return;
                }


                /*
                 * VOTE
                 * => Kết quả vote
                 */

                if (
                    game.phase ===
                    "dayVote"
                ) {

                    stopTimer();

                    resolveDayVote();

                    return;
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


                if (
                    !player
                ) {

                    socket.emit(
                        "leftRoom"
                    );

                    return;
                }


                /* =================================================
                   HOST LEAVE
                ================================================= */

                /*
                 * Host rời:
                 *
                 * KHÔNG:
                 *
                 * - delete player
                 * - stop timer
                 * - reset game
                 * - đóng phòng
                 * - đổi Host
                 */

                if (
                    player.isHost
                ) {

                    player.socketId =
                        null;


                    player.connected =
                        false;


                    game.hostSocketId =
                        null;


                    addLog(

                        `👑 Host ${player.name} đã rời kết nối. Phòng vẫn được giữ.`
                    );


                    socket.leave(
                        "main_room"
                    );


                    socket.data.playerId =
                        null;


                    socket.data.entered =
                        false;


                    broadcastPlayers();

                    broadcastRoom();


                    socket.emit(
                        "leftRoom"
                    );


                    return;
                }


                /* =================================================
                   PLAYER THƯỜNG
                ================================================= */

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


                if (
                    game.started
                ) {

                    checkWinner();
                }


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


                if (
                    !player
                ) {

                    return;
                }


                /* =================================================
                   HOST DISCONNECT
                ================================================= */

                /*
                 * Host mất mạng:
                 *
                 * Giữ nguyên:
                 *
                 * - player
                 * - playerId
                 * - role
                 * - alive
                 * - deathReasons
                 * - hostPlayerId
                 * - hostDeviceId
                 * - phase
                 * - timer
                 * - votes
                 * - game
                 */

                if (
                    player.isHost
                ) {

                    player.socketId =
                        null;


                    player.connected =
                        false;


                    game.hostSocketId =
                        null;


                    addLog(

                        `👑 Host ${player.name} đã mất kết nối. Chờ Host quay lại...`
                    );


                    /*
                     * KHÔNG stopTimer()
                     *
                     * KHÔNG delete player
                     *
                     * KHÔNG reset game
                     */

                    broadcastPlayers();

                    broadcastRoom();


                    return;
                }


                /* =================================================
                   PLAYER THƯỜNG
                ================================================= */

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


                if (
                    game.started
                ) {

                    checkWinner();
                }
            }
        );
    }
);


/* =====================================================
   START SERVER
===================================================== */

server.listen(

    PORT,

    () => {

        console.log(

            `🐺 Ma Sói Online chạy tại port ${PORT}`
        );
    }
);
