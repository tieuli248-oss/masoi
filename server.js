const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const ADMIN_ID =
    process.env.ADMIN_ID || "admin";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "0909313631981962";

const FRONTEND_URL =
    process.env.FRONTEND_URL || "*";

const MIN_PLAYERS = 6;
const MAX_PLAYERS = 15;

const ALLOWED_SIZES = Array.from(
    { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
    (_, i) => i + MIN_PLAYERS
);

const TIME = {
    night: 50,
    witchAction: 10,
    daySpeech: 240,
    dayVote: 30
};


/* =========================================================
   MUSIC
========================================================= */

const MUSIC = {

    lobby: {
        src: "audio/lobby.mp3",
        loop: true,
        volume: 0.35
    },

    night: {
        src: "audio/night.mp3",
        loop: true,
        volume: 0.35
    },

    witch: {
        src: "audio/witch.mp3",
        loop: true,
        volume: 0.45
    },

    daySpeech: {
        src: "audio/day.mp3",
        loop: true,
        volume: 0.25
    },

    dayVote: {
        src: "audio/vote.mp3",
        loop: true,
        volume: 0.45
    },

    win: {
        src: "audio/win.mp3",
        loop: false,
        volume: 0.55
    }
};


/* =========================================================
   HTTP SERVER
========================================================= */

const server = http.createServer((req, res) => {

    res.writeHead(200, {
        "Content-Type":
            "text/plain; charset=utf-8"
    });

    res.end(
        "🐺 Ma Sói Online Server OK"
    );
});


/* =========================================================
   SOCKET.IO
========================================================= */

const io = new Server(server, {

    cors: {
        origin:
            FRONTEND_URL === "*"
                ? true
                : FRONTEND_URL,

        methods: [
            "GET",
            "POST"
        ]
    }

});


/* =========================================================
   ROOM
========================================================= */

const room = {

    id: "MAIN",

    players: [],

    hostId: null,

    started: false,

    phase: "lobby",

    targetPlayerCount: 6,

    nightNumber: 0,

    roleComposition: [],

    timerEndsAt: null,

    timerToken: 0,

    timerInterval: null,

    night: null,

    dayVotes: new Map(),

    pendingHunter: null,

    pendingNightDeaths: [],

    logs: [],

    adminLogs: []
};


/* =========================================================
   UTIL
========================================================= */

function findPlayer(id) {

    return room.players.find(
        p => p.id === id
    );
}


function findPlayerByDeviceId(deviceId) {

    if (!deviceId) {
        return null;
    }

    return room.players.find(
        p => p.deviceId === deviceId
    );
}


function alivePlayers() {

    return room.players.filter(
        p => p.alive
    );
}


function aliveWolves() {

    return room.players.filter(
        p =>
            p.alive &&
            p.role === "Sói"
    );
}


function aliveNonWolves() {

    return room.players.filter(
        p =>
            p.alive &&
            p.role !== "Sói"
    );
}


function shuffle(arr) {

    for (
        let i = arr.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );

        [
            arr[i],
            arr[j]
        ] = [
            arr[j],
            arr[i]
        ];
    }

    return arr;
}


/* =========================================================
   ROLE
========================================================= */

function makeRoles(count) {

    let wolves;
    let specials;

    if (count <= 6) {

        wolves = 2;

        specials = [
            "Tiên tri",
            "Bảo vệ"
        ];

    } else if (count === 7) {

        wolves = 2;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy"
        ];

    } else if (count === 8) {

        wolves = 2;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn"
        ];

    } else if (count === 9) {

        wolves = 3;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn"
        ];

    } else if (count <= 12) {

        wolves = 3;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];

    } else {

        wolves = 4;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];
    }


    const roles = [
        ...Array(wolves).fill("Sói"),
        ...specials
    ];


    while (
        roles.length < count
    ) {

        roles.push("Dân làng");
    }


    return shuffle(roles);
}


/* =========================================================
   PUBLIC PLAYERS
========================================================= */

/*
 * QUAN TRỌNG:
 *
 * Public player data KHÔNG gửi role.
 *
 * Role chỉ được gửi riêng cho chính người chơi
 * thông qua event "roleAssigned".
 *
 * Vì vậy:
 *
 * - Sói thấy role của chính mình
 * - Người khác không thấy role của Sói
 */

function publicPlayers(
    revealRoles = false
) {

    return room.players.map(
        p => {

            const hiddenNightDeath =
                room.started &&
                room.phase === "night" &&
                room.pendingNightDeaths.some(
                    d =>
                        d.id === p.id
                );


            const data = {

                id:
                    p.id,

                name:
                    p.name,

                alive:
                    hiddenNightDeath
                        ? true
                        : p.alive,

                connected:
                    p.connected,

                ready:
                    p.ready === true,

                isHost:
                    p.id === room.hostId,

                deathReasons:
                    hiddenNightDeath
                        ? []
                        : [...p.deathReasons]
            };


            if (
                revealRoles
            ) {

                data.role =
                    p.role;
            }


            return data;
        }
    );
}


/* =========================================================
   ADMIN PLAYERS
========================================================= */

function adminPlayers() {

    return room.players.map(
        p => ({

            id:
                p.id,

            name:
                p.name,

            alive:
                p.alive,

            connected:
                p.connected,

            ready:
                p.ready === true,

            isHost:
                p.id === room.hostId,

            role:
                p.role,

            loverId:
                p.loverId || null,

            deathReasons:
                [...p.deathReasons],

            used: {
                ...p.used
            }
        })
    );
}


/* =========================================================
   LOG
========================================================= */

function addLog(text) {

    room.logs.push({
        time: Date.now(),
        text
    });


    if (
        room.logs.length > 100
    ) {

        room.logs.shift();
    }
}


function addAdminLog(text) {

    room.adminLogs.push({
        time: Date.now(),
        text
    });


    if (
        room.adminLogs.length > 300
    ) {

        room.adminLogs.shift();
    }
}


/* =========================================================
   MUSIC
========================================================= */

function emitMusic(
    key,
    target = null
) {

    const track =
        MUSIC[key];


    if (!track) {
        return;
    }


    const payload = {
        key,
        ...track
    };


    if (target) {

        io.to(target).emit(
            "musicChange",
            payload
        );

    } else {

        io.emit(
            "musicChange",
            payload
        );
    }
}


/* =========================================================
   TIMER
========================================================= */

function stopTimer() {

    if (
        room.timerInterval
    ) {

        clearInterval(
            room.timerInterval
        );
    }


    room.timerInterval =
        null;

    room.timerEndsAt =
        null;

    room.timerToken++;
}


function startTimer(
    seconds,
    callback
) {

    stopTimer();


    const token =
        ++room.timerToken;


    room.timerEndsAt =
        Date.now() +
        seconds * 1000;


    function tick() {

        if (
            token !== room.timerToken
        ) {

            return;
        }


        const remaining =
            Math.max(
                0,
                Math.ceil(
                    (
                        room.timerEndsAt -
                        Date.now()
                    ) / 1000
                )
            );


        io.emit(
            "phaseTimer",
            {
                remaining,

                phase:
                    room.phase,

                endsAt:
                    room.timerEndsAt
            }
        );


        sendAdminState();


        if (
            remaining <= 0
        ) {

            clearInterval(
                room.timerInterval
            );


            room.timerInterval =
                null;


            callback();
        }
    }


    tick();


    room.timerInterval =
        setInterval(
            tick,
            1000
        );
}


/* =========================================================
   ROOM UPDATE
========================================================= */

function emitRoom() {

    io.emit(
        "roomUpdate",
        {

            room: {

                id:
                    room.id,

                started:
                    room.started,

                phase:
                    room.phase,

                nightNumber:
                    room.nightNumber,

                targetPlayerCount:
                    room.started
                        ? room.targetPlayerCount
                        : room.players.length,

                minPlayers:
                    MIN_PLAYERS,

                maxPlayers:
                    MAX_PLAYERS,

                hostId:
                    room.hostId,

                witchActionOpen:
                    !!room.night?.witchActionOpen
            },

            players:
                publicPlayers(false)
        }
    );
}


function broadcastPlayers() {

    io.emit(
        "playersUpdate",
        publicPlayers(false)
    );


    emitRoom();


    sendAdminState();
}


/* =========================================================
   ADMIN STATE
========================================================= */

function sendAdminState() {

    const wolfVotes = [];


    if (
        room.night
    ) {

        for (
            const [
                wolfId,
                targetId
            ]
            of room.night.wolfVotes
        ) {

            const wolf =
                findPlayer(wolfId);

            const target =
                findPlayer(targetId);


            if (
                wolf &&
                target
            ) {

                wolfVotes.push({

                    wolfId,

                    wolfName:
                        wolf.name,

                    targetId,

                    targetName:
                        target.name
                });
            }
        }
    }


    const wolfTarget =
        room.night
            ? findPlayer(
                room.night.wolfTargetId
            )
            : null;


    const guardTarget =
        room.night
            ? findPlayer(
                room.night.guardTargetId
            )
            : null;


    const previousGuardTarget =
        room.night
            ? findPlayer(
                room.night.previousGuardTargetId
            )
            : null;


    const poisonTarget =
        room.night
            ? findPlayer(
                room.night.witchPoisonTargetId
            )
            : null;


    const dayVotes = [];


    for (
        const [
            voterId,
            targetId
        ]
        of room.dayVotes
    ) {

        const voter =
            findPlayer(voterId);

        const target =
            findPlayer(targetId);


        if (
            voter &&
            target
        ) {

            dayVotes.push({

                voterName:
                    voter.name,

                targetName:
                    target.name
            });
        }
    }


    const state = {

        room: {

            id:
                room.id,

            started:
                room.started,

            phase:
                room.phase,

            nightNumber:
                room.nightNumber,

            targetPlayerCount:
                room.targetPlayerCount,

            minPlayers:
                MIN_PLAYERS,

            maxPlayers:
                MAX_PLAYERS,

            hostId:
                room.hostId,

            players:
                adminPlayers(),

            roleComposition:
                room.roleComposition,

            logs:
                room.logs,

            adminLogs:
                room.adminLogs
        },


        timer: {

            endsAt:
                room.timerEndsAt,

            remaining:
                room.timerEndsAt
                    ? Math.max(
                        0,
                        Math.ceil(
                            (
                                room.timerEndsAt -
                                Date.now()
                            ) / 1000
                        )
                    )
                    : 0
        },


        secret: {

            wolfVotes,

            wolfTargetName:
                wolfTarget?.name ||
                null,

            guardTargetName:
                guardTarget?.name ||
                null,

            previousGuardTargetName:
                previousGuardTarget?.name ||
                null,

            witchActionOpen:
                !!room.night?.witchActionOpen,

            witchSave:
                !!room.night?.witchSave,

            witchPoisonTargetName:
                poisonTarget?.name ||
                null,

            seerInspections:
                room.night?.seerInspections ||
                [],

            cupidPairs:
                room.night?.cupidPairs ||
                [],

            hunterPendingName:
                room.pendingHunter
                    ? findPlayer(
                        room.pendingHunter.id
                    )?.name ||
                      null
                    : null,

            dayVotes
        }
    };


    io.sockets.sockets.forEach(
        socket => {

            if (
                socket.data.isAdmin
            ) {

                socket.emit(
                    "adminState",
                    state
                );
            }
        }
    );
}


/* =========================================================
   🐺 WOLF TARGET
========================================================= */

/*
 * LUẬT:
 *
 * - Chỉ tính phiếu của Sói còn sống.
 * - Không tính target là Sói.
 * - Người có nhiều phiếu nhất bị cắn.
 * - Nếu hòa cao nhất -> không ai bị cắn.
 */

function calculateWolfTarget() {

    if (
        !room.night
    ) {

        return null;
    }


    const counts =
        new Map();


    for (
        const [
            wolfId,
            targetId
        ]
        of room.night.wolfVotes
    ) {

        const wolf =
            findPlayer(wolfId);

        const target =
            findPlayer(targetId);


        /*
         * Chỉ Sói còn sống mới có phiếu hợp lệ.
         */

        if (
            !wolf ||
            !wolf.alive ||
            wolf.role !== "Sói"
        ) {

            continue;
        }


        /*
         * Target phải còn sống.
         */

        if (
            !target ||
            !target.alive
        ) {

            continue;
        }


        /*
         * KHÔNG được cắn Sói.
         */

        if (
            target.role === "Sói"
        ) {

            continue;
        }


        counts.set(
            targetId,
            (
                counts.get(targetId) ||
                0
            ) + 1
        );
    }


    if (
        counts.size === 0
    ) {

        return null;
    }


    let highest = 0;

    let leaders = [];


    for (
        const [
            targetId,
            count
        ]
        of counts
    ) {

        if (
            count > highest
        ) {

            highest =
                count;

            leaders = [
                targetId
            ];

        } else if (
            count === highest
        ) {

            leaders.push(
                targetId
            );
        }
    }


    /*
     * HÒA
     */

    if (
        leaders.length !== 1
    ) {

        return null;
    }


    const target =
        findPlayer(
            leaders[0]
        );


    if (
        !target ||
        !target.alive ||
        target.role === "Sói"
    ) {

        return null;
    }


    return target;
}


/* =========================================================
   🐺 SEND WOLF TARGETS
========================================================= */

/*
 * Sói chỉ thấy:
 *
 * - Người còn sống
 * - Không phải Sói
 *
 * Không gửi danh sách Sói cho client Sói.
 */

function sendWolfTargets() {

    const targets =
        alivePlayers()
            .filter(
                p =>
                    p.role !== "Sói"
            )
            .map(
                p => ({
                    id:
                        p.id,

                    name:
                        p.name,

                    alive:
                        p.alive
                })
            );


    aliveWolves().forEach(
        wolf => {

            if (
                !wolf.connected
            ) {

                return;
            }


            io.to(
                wolf.id
            ).emit(
                "wolfVoteTargets",
                {
                    players:
                        targets
                }
            );
        }
    );
}


/* =========================================================
   💀 KILL PLAYER
========================================================= */

function killPlayer(
    player,
    reason
) {

    if (
        !player ||
        !player.alive
    ) {

        return [];
    }


    const deaths = [];


    player.alive =
        false;


    player.deathReasons.push(
        reason
    );


    deaths.push(
        player
    );


    /*
     * Người yêu chết theo.
     */

    if (
        player.loverId
    ) {

        const lover =
            findPlayer(
                player.loverId
            );


        if (
            lover &&
            lover.alive
        ) {

            lover.alive =
                false;


            lover.deathReasons.push(
                "Chết theo người yêu"
            );


            deaths.push(
                lover
            );
        }
    }


    return deaths;
}


/* =========================================================
   🏹 HUNTER
========================================================= */

function triggerHunter(
    deaths,
    callback
) {

    const hunter =
        deaths.find(
            p =>
                p.role === "Thợ săn"
        );


    if (
        !hunter
    ) {

        callback();

        return;
    }


    room.pendingHunter = {
        id:
            hunter.id
    };


    stopTimer();


    if (
        !hunter.connected
    ) {

        room.pendingHunter =
            null;

        callback();

        return;
    }


    io.to(
        hunter.id
    ).emit(
        "hunterActionRequired",
        {

            players:
                publicPlayers(false)
                    .filter(
                        p =>
                            p.alive &&
                            p.id !==
                            hunter.id
                    )
        }
    );


    addAdminLog(
        `Thợ săn ${hunter.name} đang chờ chọn người bắn.`
    );


    sendAdminState();
}


/* =========================================================
   FINAL DEATHS
========================================================= */

function finalDeaths(
    deaths,
    event,
    extra,
    callback
) {

    const unique = [];


    for (
        const p
        of deaths
    ) {

        if (
            p &&
            !unique.some(
                x =>
                    x.id === p.id
            )
        ) {

            unique.push(
                p
            );
        }
    }


    if (
        unique.length === 0
    ) {

        callback();

        return;
    }


    const result =
        unique.map(
            p => ({

                id:
                    p.id,

                name:
                    p.name,

                reason:
                    p.deathReasons[
                        p.deathReasons.length - 1
                    ]
            })
        );


    io.emit(
        event,
        {

            deaths:
                result,

            ...(extra || {})
        }
    );


    for (
        const p
        of unique
    ) {

        if (
            p.connected
        ) {

            io.to(
                p.id
            ).emit(
                "dead",
                {
                    reason:
                        p.deathReasons[
                            p.deathReasons.length - 1
                        ]
                }
            );
        }
    }


    if (
        event === "nightResult"
    ) {

        room.pendingNightDeaths =
            [];
    }


    broadcastPlayers();


    callback();
}


/* =========================================================
   💘 COUPLE WIN
========================================================= */

function getCoupleWinner() {

    const living =
        alivePlayers();


    if (
        living.length !== 2
    ) {

        return null;
    }


    const [
        a,
        b
    ] = living;


    if (
        a.loverId &&
        a.loverId === b.id &&
        b.loverId === a.id
    ) {

        return [
            a,
            b
        ];
    }


    return null;
}


/* =========================================================
   WINNER
========================================================= */

function checkWinner() {

    if (
        !room.started
    ) {

        return true;
    }


    const living =
        alivePlayers();


    /*
     * Couple là 2 người cuối cùng.
     */

    const couple =
        getCoupleWinner();


    if (
        couple
    ) {

        const cupid =
            room.players.find(
                p =>
                    p.role === "Cupid"
            );


        endGame(
            "Couple",

            "💘 Cặp đôi đã sống sót cuối cùng! Cupid thắng cùng Couple.",

            {

                winnerPlayerIds: [

                    ...couple.map(
                        p =>
                            p.id
                    ),

                    ...(cupid
                        ? [
                            cupid.id
                        ]
                        : [])
                ],

                winnerNames: [

                    ...couple.map(
                        p =>
                            p.name
                    ),

                    ...(cupid
                        ? [
                            cupid.name
                        ]
                        : [])
                ]
            }
        );


        return true;
    }


    /*
     * Tất cả chết.
     */

    if (
        living.length === 0
    ) {

        endGame(
            "Hòa",
            "Không còn người chơi sống."
        );

        return true;
    }


    const wolves =
        aliveWolves().length;


    const villagers =
        aliveNonWolves().length;


    /*
     * Tất cả Sói chết.
     */

    if (
        wolves === 0
    ) {

        endGame(
            "Dân làng",
            "Tất cả Sói đã bị loại."
        );

        return true;
    }


    /*
     * Sói >= phe Dân.
     */

    if (
        wolves >= villagers
    ) {

        endGame(
            "Sói",
            "Số Sói đã bằng hoặc vượt số người phe Dân."
        );

        return true;
    }


    return false;
}


/* =========================================================
   NIGHT RESET
========================================================= */

function resetNight(
    previousGuardTargetId = null
) {

    room.night = {

        wolfVotes:
            new Map(),

        wolfTargetId:
            null,

        /*
         * Mục tiêu Bảo vệ đêm hiện tại.
         */

        guardTargetId:
            null,

        /*
         * Mục tiêu Bảo vệ đêm trước.
         *
         * Dùng để cấm:
         *
         * Đêm 1 A
         * Đêm 2 A ❌
         * Đêm 3 A ✅
         */

        previousGuardTargetId:
            previousGuardTargetId,

        witchSave:
            false,

        witchPoisonTargetId:
            null,

        witchActionOpen:
            false,

        witchActionResolved:
            false,

        seerInspections:
            [],

        cupidPairs:
            [],

        hunterShotTargetId:
            null
    };
}


/* =========================================================
   PHASE
========================================================= */

function emitPhase(
    phase
) {

    io.emit(
        "phaseChanged",
        {

            phase,

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false),

            witchSaved:
                false,

            witchSavedMessage:
                null,

            witchPoisoned:
                false,

            witchPoisonedMessage:
                null
        }
    );
}


/* =========================================================
   🌙 START NIGHT
========================================================= */

function startNight() {

    if (
        !room.started
    ) {

        return;
    }


    /*
     * Lưu mục tiêu Bảo vệ của đêm trước.
     */

    const previousGuardTargetId =
        room.night?.guardTargetId ||
        null;


    room.phase =
        "night";


    room.nightNumber++;


    resetNight(
        previousGuardTargetId
    );


    room.dayVotes =
        new Map();


    for (
        const p
        of room.players
    ) {

        p.seerUsedNight =
            false;

        p.dayVoteTargetId =
            null;
    }


    emitPhase(
        "night"
    );


    emitMusic(
        "night"
    );


    broadcastPlayers();


    /*
     * Gửi riêng danh sách mục tiêu cho Sói.
     */

    sendWolfTargets();


    /*
     * 50 giây:
     *
     * 🐺 Sói
     * 🔮 Tiên tri
     * 🛡️ Bảo vệ
     * 💘 Cupid
     */

    startTimer(
        TIME.night,
        resolveNight
    );
}


/* =========================================================
   🌙 RESOLVE NIGHT
========================================================= */

function resolveNight() {

    if (
        !room.started ||
        room.phase !== "night"
    ) {

        return;
    }


    stopTimer();


    room.night.wolfTargetId =
        calculateWolfTarget()?.id ||
        null;


    /*
     * Mở 10 giây Phù thủy.
     */

    room.night.witchActionOpen =
        true;


    room.night.witchActionResolved =
        false;


    const witch =
        room.players.find(
            p =>
                p.alive &&
                p.role === "Phù thủy"
        );


    const wolfTarget =
        findPlayer(
            room.night.wolfTargetId
        );


    const canSave =
        !!wolfTarget &&
        !!witch &&
        !witch.used.witchSave;


    /*
     * Chỉ Phù thủy thấy người bị Sói chọn.
     */

    if (
        witch
    ) {

        io.to(
            witch.id
        ).emit(
            "witchActionRequired",
            {

                message:
                    wolfTarget

                        ? `🐺 ${wolfTarget.name} đã bị Sói cắn. Bạn có muốn cứu không?`

                        : "🌙 Đêm nay không có người bị Sói cắn. Bạn vẫn có thể dùng bình độc.",

                seconds:
                    TIME.witchAction,

                targetId:
                    wolfTarget?.id ||
                    null,

                targetName:
                    wolfTarget?.name ||
                    null,

                canSave,

                canPoison:
                    !witch.used.witchPoison
            }
        );
    }


    addAdminLog(
        `Đêm ${room.nightNumber}: hết 50 giây. Phù thủy có ${TIME.witchAction} giây.`
    );


    emitMusic(
        "witch"
    );


    broadcastPlayers();


    startTimer(
        TIME.witchAction,
        finishWitchAction
    );
}


/* =========================================================
   🧙 FINISH WITCH
========================================================= */

function finishWitchAction() {

    if (
        !room.started ||
        room.phase !== "night"
    ) {

        return;
    }


    if (
        room.night?.witchActionResolved
    ) {

        return;
    }


    room.night.witchActionResolved =
        true;


    room.night.witchActionOpen =
        false;


    stopTimer();


    const deaths = [];


    const wolfTarget =
        findPlayer(
            room.night.wolfTargetId
        );


    /*
     * =====================================================
     * 🐺 SÓI CẮN
     * =====================================================
     */

    if (
        wolfTarget &&
        wolfTarget.alive
    ) {

        const protectedByGuard =
            room.night.guardTargetId ===
            wolfTarget.id;


        const saved =
            room.night.witchSave === true;


        /*
         * Bảo vệ hoặc Phù thủy cứu
         * -> không chết vì Sói.
         */

        if (
            !protectedByGuard &&
            !saved
        ) {

            deaths.push(
                ...killPlayer(
                    wolfTarget,
                    "Bị Sói cắn"
                )
            );
        }
    }


    /*
     * =====================================================
     * ☠️ PHÙ THỦY ĐỘC
     * =====================================================
     */

    const poison =
        findPlayer(
            room.night.witchPoisonTargetId
        );


    if (
        poison &&
        poison.alive
    ) {

        deaths.push(
            ...killPlayer(
                poison,
                "Bị Phù thủy đầu độc"
            )
        );
    }


    room.pendingNightDeaths =
        [
            ...deaths
        ];


    const witchSaved =
        room.night.witchSave === true;


    const witchPoisoned =
        !!room.night.witchPoisonTargetId;


    if (
        witchSaved
    ) {

        addAdminLog(
            `Phù thủy đã dùng bình cứu trong đêm ${room.nightNumber}.`
        );
    }


    if (
        witchPoisoned
    ) {

        addAdminLog(
            `Phù thủy đã dùng bình độc trong đêm ${room.nightNumber}.`
        );
    }


    /*
     * Nếu Thợ săn chết -> chờ bắn.
     */

    triggerHunter(
        deaths,
        () => {

            if (
                !room.started
            ) {

                return;
            }


            if (
                checkWinner()
            ) {

                return;
            }


            startDaySpeech(
                witchSaved,
                witchPoisoned
            );
        }
    );


    broadcastPlayers();
}


/* =========================================================
   ☀️ DAY SPEECH
========================================================= */

function startDaySpeech(
    witchSaved = false,
    witchPoisoned = false
) {

    if (
        !room.started
    ) {

        return;
    }


    room.phase =
        "daySpeech";


    const nightDeaths =
        [
            ...room.pendingNightDeaths
        ];


    const messages = [];


    if (
        witchSaved
    ) {

        messages.push(
            "🧙 PHÙ THUỶ ĐÃ CỨU 1 NGƯỜI"
        );
    }


    if (
        witchPoisoned
    ) {

        messages.push(
            "☠️ CÓ 1 NGƯỜI ĐÃ BỊ PHÙ THUỶ ĐẦU ĐỘC"
        );
    }


    const witchMessage =
        messages.length
            ? messages.join("\n")
            : null;


    emitMusic(
        "daySpeech"
    );


    io.emit(
        "phaseChanged",
        {

            phase:
                "daySpeech",

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false),

            witchSaved,

            witchSavedMessage:
                witchSaved
                    ? "🧙 PHÙ THUỶ ĐÃ CỨU 1 NGƯỜI"
                    : null,

            witchPoisoned,

            witchPoisonedMessage:
                witchPoisoned
                    ? "☠️ CÓ 1 NGƯỜI ĐÃ BỊ PHÙ THUỶ ĐẦU ĐỘC"
                    : null,

            message:
                witchMessage
        }
    );


    /*
     * Có người chết trong đêm.
     */

    if (
        nightDeaths.length > 0
    ) {

        finalDeaths(
            nightDeaths,

            "nightResult",

            {

                nightNumber:
                    room.nightNumber,

                witchSaved,

                witchSavedMessage:
                    witchSaved
                        ? "🧙 PHÙ THUỶ ĐÃ CỨU 1 NGƯỜI"
                        : null,

                witchPoisoned,

                witchPoisonedMessage:
                    witchPoisoned
                        ? "☠️ CÓ 1 NGƯỜI ĐÃ BỊ PHÙ THUỶ ĐẦU ĐỘC"
                        : null,

                message:
                    witchMessage
            },

            () => {

                if (
                    !room.started ||
                    checkWinner()
                ) {

                    return;
                }


                startDaySpeechTimer();
            }
        );


        return;
    }


    /*
     * Không ai chết.
     */

    io.emit(
        "nightResult",
        {

            deaths: [],

            nightNumber:
                room.nightNumber,

            witchSaved,

            witchSavedMessage:
                witchSaved
                    ? "🧙 PHÙ THUỶ ĐÃ CỨU 1 NGƯỜI"
                    : null,

            witchPoisoned,

            witchPoisonedMessage:
                witchPoisoned
                    ? "☠️ CÓ 1 NGƯỜI ĐÃ BỊ PHÙ THUỶ ĐẦU ĐỘC"
                    : null,

            message:
                witchMessage
        }
    );


    broadcastPlayers();


    if (
        checkWinner()
    ) {

        return;
    }


    startDaySpeechTimer();
}


function startDaySpeechTimer() {

    if (
        !room.started
    ) {

        return;
    }


    room.phase =
        "daySpeech";


    broadcastPlayers();


    startTimer(
        TIME.daySpeech,
        startDayVote
    );
}


/* =========================================================
   🗳️ DAY VOTE
========================================================= */

function startDayVote() {

    if (
        !room.started
    ) {

        return;
    }


    room.phase =
        "dayVote";


    room.dayVotes =
        new Map();


    for (
        const p
        of room.players
    ) {

        p.dayVoteTargetId =
            null;
    }


    emitPhase(
        "dayVote"
    );


    emitMusic(
        "dayVote"
    );


    broadcastPlayers();


    startTimer(
        TIME.dayVote,
        resolveDayVote
    );
}


/* =========================================================
   RESOLVE DAY VOTE
========================================================= */

function resolveDayVote() {

    if (
        !room.started ||
        room.phase !== "dayVote"
    ) {

        return;
    }


    stopTimer();


    const counts =
        new Map();


    for (
        const [
            voterId,
            targetId
        ]
        of room.dayVotes
    ) {

        const voter =
            findPlayer(voterId);


        const target =
            findPlayer(targetId);


        if (
            voter?.alive &&
            target?.alive &&
            voter.id !== target.id
        ) {

            counts.set(
                target.id,
                (
                    counts.get(
                        target.id
                    ) || 0
                ) + 1
            );
        }
    }


    let highest = 0;

    let leader = null;

    let tie = false;


    for (
        const [
            targetId,
            count
        ]
        of counts
    ) {

        if (
            count > highest
        ) {

            highest =
                count;

            leader =
                targetId;

            tie =
                false;

        } else if (
            count === highest
        ) {

            tie =
                true;
        }
    }


    const submitted =
        [
            ...room.dayVotes.keys()
        ].filter(
            id =>
                findPlayer(id)?.alive
        ).length;


    const executed =
        leader &&
        !tie &&
        highest > submitted / 2

            ? findPlayer(leader)

            : null;


    const deaths =
        executed

            ? killPlayer(
                executed,
                "Bị dân làng bỏ phiếu loại"
            )

            : [];


    triggerHunter(
        deaths,
        () => {

            if (
                !room.started
            ) {

                return;
            }


            if (
                deaths.length > 0
            ) {

                finalDeaths(
                    deaths,

                    "voteResult",

                    {

                        executedId:
                            executed?.id ||
                            null,

                        executedName:
                            executed?.name ||
                            null,

                        voteCount:
                            highest,

                        submittedVotes:
                            submitted
                    },

                    () => {

                        if (
                            !room.started ||
                            checkWinner()
                        ) {

                            return;
                        }


                        startNight();
                    }
                );

            } else {

                io.emit(
                    "voteResult",
                    {

                        deaths: [],

                        executedId:
                            null,

                        executedName:
                            null,

                        voteCount:
                            highest,

                        submittedVotes:
                            submitted
                    }
                );


                broadcastPlayers();


                if (
                    checkWinner()
                ) {

                    return;
                }


                startNight();
            }
        }
    );


    broadcastPlayers();
}


/* =========================================================
   START GAME
========================================================= */

function startGame() {

    if (
        room.started
    ) {

        return {
            ok: false,

            message:
                "Game đang chạy."
        };
    }


    const count =
        room.players.length;


    if (
        !ALLOWED_SIZES.includes(
            count
        )
    ) {

        return {

            ok: false,

            message:
                `Game cần từ ${MIN_PLAYERS} đến ${MAX_PLAYERS} người. Hiện có ${count} người.`
        };
    }


    if (
        room.players.some(
            p =>
                !p.connected
        )
    ) {

        return {

            ok: false,

            message:
                "Có người đang mất kết nối. Vui lòng chờ phòng cập nhật."
        };
    }


    const notReady =
        room.players.filter(
            p =>
                p.id !== room.hostId &&
                p.ready !== true
        );


    if (
        notReady.length
    ) {

        return {

            ok: false,

            message:
                `Còn ${notReady.length} người chưa SẴN SÀNG.`
        };
    }


    const roles =
        makeRoles(count);


    if (
        roles.length !== count
    ) {

        return {

            ok: false,

            message:
                "Không thể tạo bộ vai cho số người hiện tại."
        };
    }


    room.started =
        true;


    room.phase =
        "lobby";


    room.targetPlayerCount =
        count;


    room.nightNumber =
        0;


    room.roleComposition =
        [
            ...roles
        ];


    room.pendingNightDeaths =
        [];


    room.pendingHunter =
        null;


    room.night =
        null;


    room.players.forEach(
        (
            player,
            index
        ) => {

            player.ready =
                false;

            player.alive =
                true;

            player.role =
                roles[index];

            player.deathReasons =
                [];

            player.loverId =
                null;

            player.used = {

                witchSave:
                    false,

                witchPoison:
                    false
            };

            player.seerUsedNight =
                false;

            player.dayVoteTargetId =
                null;
        }
    );


    addAdminLog(
        `Game bắt đầu: ${count} người.`
    );


    addLog(
        `Game bắt đầu với ${count} người.`
    );


    /*
     * ROLE CHỈ GỬI RIÊNG CHO CHÍNH NGƯỜI CHƠI.
     *
     * Sói sẽ nhận:
     *
     * role: "Sói"
     *
     * Frontend có thể tự động hiện 🐺.
     *
     * Người khác KHÔNG nhận role của người này.
     */

    for (
        const player
        of room.players
    ) {

        io.to(
            player.id
        ).emit(
            "roleAssigned",
            {

                role:
                    player.role,

                /*
                 * Flag riêng cho client.
                 */

                isWolf:
                    player.role === "Sói"
            }
        );
    }


    io.emit(
        "gameStarted",
        {

            room: {

                started:
                    true,

                phase:
                    "night",

                nightNumber:
                    0,

                targetPlayerCount:
                    count
            },

            players:
                publicPlayers(false)
        }
    );


    startNight();


    return {
        ok: true
    };
}


/* =========================================================
   END GAME
========================================================= */

function endGame(
    winner,
    message,
    extra = {}
) {

    if (
        !room.started
    ) {

        return;
    }


    stopTimer();


    emitMusic(
        "win"
    );


    io.emit(
        "gameEnded",
        {

            winner,

            message,

            players:
                publicPlayers(true),

            ...extra
        }
    );


    addAdminLog(
        `Game kết thúc: ${winner}.`
    );


    room.started =
        false;


    room.phase =
        "lobby";


    room.nightNumber =
        0;


    room.roleComposition =
        [];


    room.night =
        null;


    room.dayVotes =
        new Map();


    room.pendingHunter =
        null;


    room.pendingNightDeaths =
        [];


    for (
        const p
        of room.players
    ) {

        p.ready =
            false;

        p.alive =
            true;

        p.role =
            null;

        p.deathReasons =
            [];

        p.loverId =
            null;

        p.used = {

            witchSave:
                false,

            witchPoison:
                false
        };

        p.seerUsedNight =
            false;

        p.dayVoteTargetId =
            null;
    }


    chooseHost();


    room.targetPlayerCount =
        room.players.length;


    emitRoom();

    sendAdminState();
}


/* =========================================================
   CHOOSE HOST
========================================================= */

function chooseHost() {

    room.hostId =
        room.players.find(
            p =>
                p.connected
        )?.id ||
        null;
}


/* =========================================================
   RESET ROOM
========================================================= */

function resetRoom() {

    stopTimer();


    room.started =
        false;


    room.phase =
        "lobby";


    room.nightNumber =
        0;


    room.roleComposition =
        [];


    room.night =
        null;


    room.dayVotes =
        new Map();


    room.pendingHunter =
        null;


    room.pendingNightDeaths =
        [];


    for (
        const p
        of room.players
    ) {

        p.ready =
            false;

        p.alive =
            true;

        p.role =
            null;

        p.deathReasons =
            [];

        p.loverId =
            null;

        p.used = {

            witchSave:
                false,

            witchPoison:
                false
        };

        p.seerUsedNight =
            false;

        p.dayVoteTargetId =
            null;
    }


    chooseHost();


    room.targetPlayerCount =
        room.players.length;


    emitMusic(
        "lobby"
    );


    addAdminLog(
        "Admin reset phòng."
    );


    emitRoom();

    sendAdminState();
}


/* =========================================================
   RECONNECT STATE
========================================================= */

function reconnectState(
    socket,
    player
) {

    socket.data.playerId =
        player.id;


    socket.emit(
        "enteredGame",
        {

            room: {

                id:
                    room.id,

                started:
                    true,

                phase:
                    room.phase,

                nightNumber:
                    room.nightNumber,

                targetPlayerCount:
                    room.targetPlayerCount,

                minPlayers:
                    MIN_PLAYERS,

                maxPlayers:
                    MAX_PLAYERS,

                hostId:
                    room.hostId
            },

            yourPlayerId:
                player.id,

            yourName:
                player.name,

            isHost:
                player.id ===
                room.hostId,

            reconnect:
                true
        }
    );


    /*
     * Gửi role riêng cho người reconnect.
     */

    socket.emit(
        "roleAssigned",
        {

            role:
                player.role,

            isWolf:
                player.role === "Sói"
        }
    );


    socket.emit(
        "phaseChanged",
        {

            phase:
                room.phase,

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false)
        }
    );


    if (
        room.timerEndsAt
    ) {

        socket.emit(
            "phaseTimer",
            {

                remaining:
                    Math.max(
                        0,
                        Math.ceil(
                            (
                                room.timerEndsAt -
                                Date.now()
                            ) / 1000
                        )
                    ),

                phase:
                    room.phase,

                endsAt:
                    room.timerEndsAt
            }
        );
    }


    /*
     * Nếu là Sói reconnect trong đêm,
     * gửi lại danh sách mục tiêu Sói.
     */

    if (
        room.phase === "night" &&
        player.role === "Sói" &&
        player.alive &&
        !room.night?.witchActionOpen
    ) {

        const targets =
            alivePlayers()
                .filter(
                    p =>
                        p.role !== "Sói"
                )
                .map(
                    p => ({

                        id:
                            p.id,

                        name:
                            p.name,

                        alive:
                            p.alive
                    })
                );


        socket.emit(
            "wolfVoteTargets",
            {
                players:
                    targets
            }
        );
    }


    /*
     * Phù thủy reconnect trong 10 giây.
     */

    if (
        room.phase === "night" &&
        room.night?.witchActionOpen &&
        player.role === "Phù thủy" &&
        player.alive
    ) {

        const target =
            findPlayer(
                room.night.wolfTargetId
            );


        socket.emit(
            "witchActionRequired",
            {

                message:
                    target

                        ? `🐺 ${target.name} đã bị Sói cắn. Bạn có muốn cứu không?`

                        : "🌙 Đêm nay không có người bị Sói cắn. Bạn vẫn có thể dùng bình độc.",

                seconds:
                    room.timerEndsAt

                        ? Math.max(
                            0,
                            Math.ceil(
                                (
                                    room.timerEndsAt -
                                    Date.now()
                                ) / 1000
                            )
                        )

                        : 0,

                targetId:
                    target?.id ||
                    null,

                targetName:
                    target?.name ||
                    null,

                canSave:
                    !!target &&
                    !player.used.witchSave,

                canPoison:
                    !player.used.witchPoison
            }
        );
    }


    emitMusic(

        room.night?.witchActionOpen

            ? "witch"

            : room.phase === "night"

                ? "night"

                : room.phase === "dayVote"

                    ? "dayVote"

                    : room.phase === "daySpeech"

                        ? "daySpeech"

                        : "lobby",

        socket.id
    );
}


/* =========================================================
   SOCKET CONNECTION
========================================================= */

io.on(
    "connection",
    socket => {

        socket.data.isAdmin =
            false;

        socket.data.playerId =
            null;


        /* =====================================================
           ADMIN LOGIN
        ===================================================== */

        socket.on(
            "adminLogin",
            data => {

                const id =
                    String(
                        data?.id || ""
                    );


                const password =
                    String(
                        data?.password || ""
                    );


                if (
                    id === ADMIN_ID &&
                    password === ADMIN_PASSWORD
                ) {

                    socket.data.isAdmin =
                        true;


                    socket.emit(
                        "adminLoginResult",
                        {

                            ok: true,

                            message:
                                "Đăng nhập Admin thành công."
                        }
                    );


                    addAdminLog(
                        "Admin đăng nhập."
                    );


                    sendAdminState();

                } else {

                    socket.emit(
                        "adminLoginResult",
                        {

                            ok: false,

                            message:
                                "Sai ID hoặc mật khẩu."
                        }
                    );
                }
            }
        );


        /* =====================================================
           ADMIN REFRESH
        ===================================================== */

        socket.on(
            "adminRefresh",
            () => {

                if (
                    !socket.data.isAdmin
                ) {

                    return;
                }


                sendAdminState();
            }
        );


        /* =====================================================
           ADMIN RESET
        ===================================================== */

        socket.on(
            "adminResetRoom",
            () => {

                if (
                    !socket.data.isAdmin
                ) {

                    return;
                }


                resetRoom();
            }
        );


        /* =====================================================
           ADMIN END GAME
        ===================================================== */

        socket.on(
            "adminEndGame",
            data => {

                if (
                    !socket.data.isAdmin
                ) {

                    return;
                }


                if (
                    room.started
                ) {

                    endGame(

                        data?.winner ||
                            "Admin",

                        data?.message ||
                            "Admin đã kết thúc game."
                    );
                }
            }
        );


        /* =====================================================
           ADMIN KICK PLAYER
        ===================================================== */

        socket.on(
            "adminKickPlayer",
            data => {

                if (
                    !socket.data.isAdmin
                ) {

                    return;
                }


                const player =
                    findPlayer(
                        data?.playerId
                    );


                if (
                    !player
                ) {

                    return;
                }


                if (
                    room.started &&
                    player.alive
                ) {

                    const deaths =
                        killPlayer(
                            player,
                            "Bị Admin loại"
                        );


                    if (
                        room.phase === "night"
                    ) {

                        room.pendingNightDeaths.push(
                            ...deaths
                        );

                    } else {

                        for (
                            const p
                            of deaths
                        ) {

                            if (
                                p.connected
                            ) {

                                io.to(
                                    p.id
                                ).emit(
                                    "dead",
                                    {
                                        reason:
                                            p.deathReasons[
                                                p.deathReasons.length - 1
                                            ]
                                    }
                                );
                            }
                        }
                    }


                    broadcastPlayers();

                    checkWinner();
                }


                const targetSocket =
                    io.sockets.sockets.get(
                        player.id
                    );


                if (
                    targetSocket
                ) {

                    targetSocket.emit(
                        "leftRoom"
                    );


                    targetSocket.data.playerId =
                        null;


                    targetSocket.disconnect(
                        true
                    );
                }


                if (
                    !room.started
                ) {

                    room.players =
                        room.players.filter(
                            p =>
                                p.id !==
                                player.id
                        );


                    if (
                        room.hostId ===
                        player.id
                    ) {

                        chooseHost();
                    }


                    room.targetPlayerCount =
                        room.players.length;
                }


                addAdminLog(
                    `Admin kick ${player.name}.`
                );


                emitRoom();

                sendAdminState();
            }
        );


        /* =====================================================
           ADMIN KICK ALL
        ===================================================== */

        socket.on(
            "adminKickAll",
            () => {

                if (
                    !socket.data.isAdmin
                ) {

                    return;
                }


                stopTimer();


                for (
                    const p
                    of room.players
                ) {

                    const s =
                        io.sockets.sockets.get(
                            p.id
                        );


                    if (
                        s
                    ) {

                        s.emit(
                            "leftRoom"
                        );


                        s.data.playerId =
                            null;


                        s.disconnect(
                            true
                        );
                    }
                }


                room.players =
                    [];


                room.hostId =
                    null;


                room.started =
                    false;


                room.phase =
                    "lobby";


                room.targetPlayerCount =
                    6;


                room.nightNumber =
                    0;


                room.roleComposition =
                    [];


                room.night =
                    null;


                room.dayVotes =
                    new Map();


                room.pendingHunter =
                    null;


                room.pendingNightDeaths =
                    [];


                emitMusic(
                    "lobby"
                );


                addAdminLog(
                    "Admin kick tất cả."
                );


                emitRoom();

                sendAdminState();
            }
        );


        /* =====================================================
           JOIN / RECONNECT
        ===================================================== */

        socket.on(
            "joinRoom",
            data => {

                const name =
                    String(
                        data?.name || ""
                    ).trim();


                const deviceId =
                    String(
                        data?.deviceId || ""
                    ).trim();


                if (
                    !name
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


                if (
                    name.length > 20
                ) {

                    socket.emit(
                        "enterError",
                        {
                            message:
                                "Tên tối đa 20 ký tự."
                        }
                    );


                    return;
                }


                /* =================================================
                   RECONNECT GAME
                ================================================= */

                if (
                    room.started
                ) {

                    const reconnectPlayer =
                        findPlayerByDeviceId(
                            deviceId
                        );


                    if (
                        reconnectPlayer &&
                        !reconnectPlayer.connected
                    ) {

                        const oldId =
                            reconnectPlayer.id;


                        const newId =
                            socket.id;


                        reconnectPlayer.id =
                            newId;


                        reconnectPlayer.connected =
                            true;


                        if (
                            room.hostId ===
                            oldId
                        ) {

                            room.hostId =
                                newId;
                        }


                        /*
                         * Cập nhật loverId.
                         */

                        for (
                            const p
                            of room.players
                        ) {

                            if (
                                p.loverId ===
                                oldId
                            ) {

                                p.loverId =
                                    newId;
                            }
                        }


                        /*
                         * Day votes.
                         */

                        if (
                            room.dayVotes.has(
                                oldId
                            )
                        ) {

                            const targetId =
                                room.dayVotes.get(
                                    oldId
                                );


                            room.dayVotes.delete(
                                oldId
                            );


                            room.dayVotes.set(
                                newId,
                                targetId
                            );
                        }


                        for (
                            const [
                                voterId,
                                targetId
                            ]
                            of room.dayVotes
                        ) {

                            if (
                                targetId ===
                                oldId
                            ) {

                                room.dayVotes.set(
                                    voterId,
                                    newId
                                );
                            }
                        }


                        /*
                         * Night data.
                         */

                        if (
                            room.night
                        ) {

                            if (
                                room.night.wolfVotes.has(
                                    oldId
                                )
                            ) {

                                const targetId =
                                    room.night.wolfVotes.get(
                                        oldId
                                    );


                                room.night.wolfVotes.delete(
                                    oldId
                                );


                                room.night.wolfVotes.set(
                                    newId,
                                    targetId
                                );
                            }


                            for (
                                const [
                                    wolfId,
                                    targetId
                                ]
                                of room.night.wolfVotes
                            ) {

                                if (
                                    targetId ===
                                    oldId
                                ) {

                                    room.night.wolfVotes.set(
                                        wolfId,
                                        newId
                                    );
                                }
                            }


                            if (
                                room.night.wolfTargetId ===
                                oldId
                            ) {

                                room.night.wolfTargetId =
                                    newId;
                            }


                            if (
                                room.night.guardTargetId ===
                                oldId
                            ) {

                                room.night.guardTargetId =
                                    newId;
                            }


                            if (
                                room.night.previousGuardTargetId ===
                                oldId
                            ) {

                                room.night.previousGuardTargetId =
                                    newId;
                            }


                            if (
                                room.night.witchPoisonTargetId ===
                                oldId
                            ) {

                                room.night.witchPoisonTargetId =
                                    newId;
                            }


                            if (
                                room.night.hunterShotTargetId ===
                                oldId
                            ) {

                                room.night.hunterShotTargetId =
                                    newId;
                            }


                            for (
                                const inspection
                                of room.night.seerInspections
                            ) {

                                if (
                                    inspection.seerId ===
                                    oldId
                                ) {

                                    inspection.seerId =
                                        newId;
                                }


                                if (
                                    inspection.targetId ===
                                    oldId
                                ) {

                                    inspection.targetId =
                                        newId;
                                }
                            }
                        }


                        /*
                         * Pending Hunter.
                         */

                        if (
                            room.pendingHunter &&
                            room.pendingHunter.id ===
                            oldId
                        ) {

                            room.pendingHunter.id =
                                newId;
                        }


                        socket.data.playerId =
                            newId;


                        reconnectState(
                            socket,
                            reconnectPlayer
                        );


                        addLog(
                            `${reconnectPlayer.name} đã vào lại game.`
                        );


                        addAdminLog(
                            `${reconnectPlayer.name} đã kết nối lại.`
                        );


                        broadcastPlayers();


                        return;
                    }


                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Game đang chạy. Chỉ người chơi cũ mới được vào lại."
                        }
                    );


                    return;
                }


                /* =================================================
                   LOBBY JOIN
                ================================================= */

                if (
                    room.players.length >=
                    MAX_PLAYERS
                ) {

                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Phòng đã đủ 15 người."
                        }
                    );


                    return;
                }


                const sameDevice =
                    room.players.find(
                        p =>
                            p.connected &&
                            deviceId &&
                            p.deviceId ===
                                deviceId
                    );


                if (
                    sameDevice
                ) {

                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Thiết bị này đã vào phòng."
                        }
                    );


                    return;
                }


                const sameName =
                    room.players.find(
                        p =>
                            p.connected &&
                            p.name.toLowerCase() ===
                                name.toLowerCase()
                    );


                if (
                    sameName
                ) {

                    socket.emit(
                        "enterError",
                        {

                            message:
                                "Tên này đã có người sử dụng."
                        }
                    );


                    return;
                }


                const player = {

                    id:
                        socket.id,

                    name,

                    deviceId,

                    connected:
                        true,

                    ready:
                        false,

                    alive:
                        true,

                    role:
                        null,

                    deathReasons:
                        [],

                    loverId:
                        null,

                    used: {

                        witchSave:
                            false,

                        witchPoison:
                            false
                    },

                    seerUsedNight:
                        false,

                    dayVoteTargetId:
                        null
                };


                room.players.push(
                    player
                );


                if (
                    !room.hostId
                ) {

                    room.hostId =
                        player.id;
                }


                room.targetPlayerCount =
                    room.players.length;


                socket.data.playerId =
                    player.id;


                socket.emit(
                    "enteredGame",
                    {

                        room: {

                            id:
                                room.id,

                            started:
                                false,

                            phase:
                                "lobby",

                            nightNumber:
                                0,

                            targetPlayerCount:
                                room.players.length,

                            minPlayers:
                                MIN_PLAYERS,

                            maxPlayers:
                                MAX_PLAYERS,

                            hostId:
                                room.hostId
                        },

                        yourPlayerId:
                            player.id,

                        yourName:
                            player.name,

                        isHost:
                            player.id ===
                            room.hostId
                    }
                );


                emitMusic(
                    "lobby",
                    socket.id
                );


                addLog(
                    `${player.name} vào phòng.`
                );


                addAdminLog(
                    `${player.name} vào phòng.`
                );


                emitRoom();

                sendAdminState();
            }
        );


        /* =====================================================
           READY
        ===================================================== */

        socket.on(
            "setReady",
            data => {

                if (
                    room.started
                ) {

                    return;
                }


                const player =
                    findPlayer(
                        socket.data.playerId
                    );


                if (
                    !player
                ) {

                    return;
                }


                if (
                    !player.connected
                ) {

                    return;
                }


                if (
                    player.id ===
                    room.hostId
                ) {

                    return;
                }


                player.ready =
                    data?.ready === true;


                addLog(
                    `${player.name} ${
                        player.ready
                            ? "đã sẵn sàng"
                            : "đã hủy sẵn sàng"
                    }.`
                );


                emitRoom();

                sendAdminState();
            }
        );


        /* =====================================================
           START GAME
        ===================================================== */

        socket.on(
            "startGame",
            () => {

                const player =
                    findPlayer(
                        socket.data.playerId
                    );


                if (
                    !player
                ) {

                    return;
                }


                if (
                    player.id !==
                    room.hostId
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Chỉ Host mới được bắt đầu."
                        }
                    );


                    return;
                }


                const result =
                    startGame();


                if (
                    !result.ok
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                result.message
                        }
                    );
                }
            }
        );


        /* =====================================================
           🐺 WOLF VOTE
        ===================================================== */

        socket.on(
            "wolfVote",
            data => {

                /*
                 * Chỉ được vote trong đêm.
                 */

                if (
                    room.phase !== "night" ||
                    room.night?.witchActionOpen
                ) {

                    return;
                }


                const wolf =
                    findPlayer(
                        socket.data.playerId
                    );


                const target =
                    findPlayer(
                        data?.targetId
                    );


                /*
                 * Người vote phải là Sói còn sống.
                 */

                if (
                    !wolf ||
                    !wolf.alive ||
                    wolf.role !== "Sói"
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Chỉ Sói còn sống mới được vote."
                        }
                    );


                    return;
                }


                /*
                 * Target phải tồn tại + còn sống.
                 */

                if (
                    !target ||
                    !target.alive
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Mục tiêu không hợp lệ."
                        }
                    );


                    return;
                }


                /*
                 * Không tự vote.
                 */

                if (
                    target.id === wolf.id
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Không thể vote chính mình."
                        }
                    );


                    return;
                }


                /*
                 * =================================================
                 * LUẬT MỚI:
                 *
                 * SÓI KHÔNG THỂ VOTE SÓI.
                 * =================================================
                 */

                if (
                    target.role === "Sói"
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "🐺 Không thể vote người cùng phe Sói."
                        }
                    );


                    return;
                }


                /*
                 * Lưu / thay đổi vote.
                 */

                room.night.wolfVotes.set(
                    wolf.id,
                    target.id
                );


                /*
                 * Tính tạm mục tiêu hiện tại.
                 */

                room.night.wolfTargetId =
                    calculateWolfTarget()?.id ||
                    null;


                socket.emit(
                    "actionAccepted",
                    {

                        type:
                            "wolfVote"
                    }
                );


                /*
                 * Báo riêng cho các Sói.
                 */

                aliveWolves().forEach(
                    otherWolf => {

                        if (
                            otherWolf.connected
                        ) {

                            io.to(
                                otherWolf.id
                            ).emit(
                                "wolfVoteUpdated",
                                {

                                    voterId:
                                        wolf.id,

                                    targetId:
                                        target.id
                                }
                            );
                        }
                    }
                );


                addAdminLog(
                    `Sói ${wolf.name} chọn ${target.name}.`
                );


                sendAdminState();
            }
        );


        /* =====================================================
           🛡️ GUARD
        ===================================================== */

        socket.on(
            "guardProtect",
            data => {

                const guard =
                    findPlayer(
                        socket.data.playerId
                    );


                const target =
                    findPlayer(
                        data?.targetId
                    );


                /*
                 * Chỉ được chọn trong thời gian ban đêm
                 * trước khi Phù thủy mở hành động.
                 */

                if (
                    room.phase !== "night" ||
                    room.night?.witchActionOpen
                ) {

                    return;
                }


                if (
                    !guard ||
                    !guard.alive ||
                    guard.role !== "Bảo vệ"
                ) {

                    return;
                }


                if (
                    !target ||
                    !target.alive
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Mục tiêu không hợp lệ."
                        }
                    );


                    return;
                }


                /*
                 * =================================================
                 * LUẬT:
                 *
                 * Không được bảo vệ cùng 1 người
                 * trong 2 đêm liên tiếp.
                 *
                 * Đêm 1 A
                 * Đêm 2 A ❌
                 * Đêm 3 A ✅
                 * =================================================
                 */

                if (
                    room.night.previousGuardTargetId &&
                    target.id ===
                        room.night.previousGuardTargetId
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "🛡️ Không thể bảo vệ người này 2 đêm liên tiếp."
                        }
                    );


                    return;
                }


                /*
                 * Được tự bảo vệ.
                 */

                room.night.guardTargetId =
                    target.id;


                socket.emit(
                    "actionAccepted",
                    {

                        type:
                            "guard",

                        targetId:
                            target.id
                    }
                );


                socket.emit(
                    "guardProtectSuccess",
                    {

                        targetId:
                            target.id,

                        targetName:
                            target.name
                    }
                );


                addAdminLog(
                    `Bảo vệ ${guard.name} bảo vệ ${target.name}.`
                );


                sendAdminState();
            }
        );


        /* =====================================================
           🔮 SEER
        ===================================================== */

        socket.on(
            "seerInspect",
            data => {

                const seer =
                    findPlayer(
                        socket.data.playerId
                    );


                const target =
                    findPlayer(
                        data?.targetId
                    );


                if (
                    room.phase !== "night" ||
                    room.night?.witchActionOpen ||
                    !seer ||
                    !seer.alive ||
                    seer.role !== "Tiên tri"
                ) {

                    return;
                }


                if (
                    seer.seerUsedNight
                ) {

                    socket.emit(
                        "seerError",
                        {

                            message:
                                "Bạn đã soi trong đêm nay."
                        }
                    );


                    return;
                }


                if (
                    !target ||
                    !target.alive ||
                    target.id === seer.id
                ) {

                    socket.emit(
                        "seerError",
                        {

                            message:
                                "Mục tiêu không hợp lệ."
                        }
                    );


                    return;
                }


                const result =
                    target.role === "Sói"

                        ? "🐺 Sói"

                        : "👨‍🌾 Phe Dân";


                seer.seerUsedNight =
                    true;


                room.night.seerInspections.push(
                    {

                        seerId:
                            seer.id,

                        seerName:
                            seer.name,

                        targetId:
                            target.id,

                        targetName:
                            target.name,

                        result,

                        time:
                            Date.now()
                    }
                );


                socket.emit(
                    "seerResult",
                    {

                        targetName:
                            target.name,

                        result
                    }
                );


                addAdminLog(
                    `Tiên tri ${seer.name} soi ${target.name}: ${result}`
                );


                sendAdminState();
            }
        );


        /* =====================================================
           🧙 WITCH SAVE
        ===================================================== */

        socket.on(
            "witchSave",
            () => {

                if (
                    room.phase !== "night" ||
                    !room.night?.witchActionOpen
                ) {

                    return;
                }


                const witch =
                    findPlayer(
                        socket.data.playerId
                    );


                if (
                    !witch ||
                    !witch.alive ||
                    witch.role !== "Phù thủy"
                ) {

                    return;
                }


                if (
                    witch.used.witchSave
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Đã dùng bình cứu."
                        }
                    );


                    return;
                }


                if (
                    !room.night.wolfTargetId
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Đêm nay không có người bị Sói cắn."
                        }
                    );


                    return;
                }


                witch.used.witchSave =
                    true;


                room.night.witchSave =
                    true;


                socket.emit(
                    "actionAccepted",
                    {

                        type:
                            "witchSave"
                    }
                );


                socket.emit(
                    "witchSaveAccepted",
                    {

                        message:
                            "🧪 Đã sử dụng bình cứu."
                    }
                );


                addAdminLog(
                    `Phù thủy ${witch.name} dùng bình cứu.`
                );


                sendAdminState();
            }
        );


        /* =====================================================
           ☠️ WITCH POISON
        ===================================================== */

        socket.on(
            "witchPoison",
            data => {

                if (
                    room.phase !== "night" ||
                    !room.night?.witchActionOpen
                ) {

                    return;
                }


                const witch =
                    findPlayer(
                        socket.data.playerId
                    );


                const target =
                    findPlayer(
                        data?.targetId
                    );


                if (
                    !witch ||
                    !witch.alive ||
                    witch.role !== "Phù thủy"
                ) {

                    return;
                }


                if (
                    witch.used.witchPoison
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Đã dùng bình độc."
                        }
                    );


                    return;
                }


                if (
                    !target ||
                    !target.alive
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Mục tiêu không hợp lệ."
                        }
                    );


                    return;
                }


                /*
                 * Có thể độc bất kỳ người sống.
                 */

                witch.used.witchPoison =
                    true;


                room.night.witchPoisonTargetId =
                    target.id;


                socket.emit(
                    "actionAccepted",
                    {

                        type:
                            "witchPoison"
                    }
                );


                addAdminLog(
                    `Phù thủy ${witch.name} đầu độc ${target.name}.`
                );


                sendAdminState();
            }
        );


        /* =====================================================
           💘 CUPID
        ===================================================== */

        socket.on(
            "cupidPair",
            data => {

                if (
                    room.phase !== "night" ||
                    room.night?.witchActionOpen ||
                    room.nightNumber !== 1
                ) {

                    return;
                }


                const cupid =
                    findPlayer(
                        socket.data.playerId
                    );


                if (
                    !cupid ||
                    !cupid.alive ||
                    cupid.role !== "Cupid"
                ) {

                    return;
                }


                if (
                    room.night.cupidPairs.length
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Cupid đã ghép."
                        }
                    );


                    return;
                }


                const first =
                    findPlayer(
                        data?.firstId
                    );


                const second =
                    findPlayer(
                        data?.secondId
                    );


                if (
                    !first ||
                    !second ||
                    !first.alive ||
                    !second.alive ||
                    first.id === second.id
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Phải chọn 2 người khác nhau."
                        }
                    );


                    return;
                }


                first.loverId =
                    second.id;


                second.loverId =
                    first.id;


                room.night.cupidPairs.push(
                    {

                        firstId:
                            first.id,

                        firstName:
                            first.name,

                        secondId:
                            second.id,

                        secondName:
                            second.name
                    }
                );


                /*
                 * FIX LỖI:
                 *
                 * Code cũ:
                 * iio.to(...)
                 *
                 * Đúng:
                 * io.to(...)
                 */

                io.to(
                    first.id
                ).emit(
                    "loverLinked",
                    {

                        loverId:
                            second.id,

                        loverName:
                            second.name,

                        loverRole:
                            second.role
                    }
                );


                io.to(
                    second.id
                ).emit(
                    "loverLinked",
                    {

                        loverId:
                            first.id,

                        loverName:
                            first.name,

                        loverRole:
                            first.role
                    }
                );


                addAdminLog(
                    `Cupid ghép ${first.name} ❤️ ${second.name}.`
                );


                sendAdminState();
            }
        );


        /* =====================================================
           🏹 HUNTER SHOOT
        ===================================================== */

        socket.on(
            "hunterShoot",
            data => {

                if (
                    !room.pendingHunter ||
                    room.pendingHunter.id !==
                    socket.data.playerId
                ) {

                    return;
                }


                const hunter =
                    findPlayer(
                        socket.data.playerId
                    );


                const target =
                    findPlayer(
                        data?.targetId
                    );


                if (
                    !hunter ||
                    !target ||
                    !target.alive ||
                    target.id === hunter.id
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Mục tiêu không hợp lệ."
                        }
                    );


                    return;
                }


                const deaths =
                    killPlayer(
                        target,
                        "Bị Thợ săn bắn"
                    );


                room.pendingHunter =
                    null;


                if (
                    room.night
                ) {

                    room.night.hunterShotTargetId =
                        target.id;
                }


                addAdminLog(
                    `Thợ săn ${hunter.name} bắn ${target.name}.`
                );


                if (
                    room.phase === "night"
                ) {

                    room.pendingNightDeaths.push(
                        ...deaths
                    );


                    broadcastPlayers();


                    if (
                        checkWinner()
                    ) {

                        return;
                    }


                    startDaySpeech(
                        room.night?.witchSave === true,
                        !!room.night?.witchPoisonTargetId
                    );


                    return;
                }


                finalDeaths(
                    deaths,

                    "voteResult",

                    {},

                    () => {

                        if (
                            checkWinner()
                        ) {

                            return;
                        }


                        startNight();
                    }
                );
            }
        );


        /* =====================================================
           🗳️ DAY VOTE
        ===================================================== */

        socket.on(
            "dayVote",
            data => {

                if (
                    room.phase !== "dayVote"
                ) {

                    return;
                }


                const voter =
                    findPlayer(
                        socket.data.playerId
                    );


                const target =
                    findPlayer(
                        data?.targetId
                    );


                if (
                    !voter ||
                    !voter.alive ||
                    !target ||
                    !target.alive ||
                    voter.id === target.id
                ) {

                    socket.emit(
                        "actionError",
                        {

                            message:
                                "Vote không hợp lệ."
                        }
                    );


                    return;
                }


                room.dayVotes.set(
                    voter.id,
                    target.id
                );


                voter.dayVoteTargetId =
                    target.id;


                socket.emit(
                    "dayVoteAccepted",
                    {

                        targetId:
                            target.id
                    }
                );


                addAdminLog(
                    `${voter.name} vote ${target.name}.`
                );


                sendAdminState();
            }
        );


        /* =====================================================
           💬 CHAT
        ===================================================== */

        socket.on(
            "chatMessage",
            data => {

                const player =
                    findPlayer(
                        socket.data.playerId
                    );


                if (
                    !player
                ) {

                    return;
                }


                const text =
                    String(
                        data?.text || ""
                    ).trim();


                if (
                    !text ||
                    text.length > 300
                ) {

                    return;
                }

/* =========================
   CHAT PHÒNG CHỜ
========================= */

if (
    !room.started &&
    room.phase === "lobby"
) {

    const recipients =
        room.players.filter(
            p =>
                p.connected
        );

    for (
        const recipient
        of recipients
    ) {

        io.to(
            recipient.id
        ).emit(
            "chatMessage",
            {

                playerId:
                    player.id,

                playerName:
                    player.name,

                text,

                dead:
                    false,

                wolfChat:
                    false,

                coupleChat:
                    false,

                chatType:
                    "lobby"
            }
        );
    }

    addLog(
        `${player.name} nhắn trong phòng chờ.`
    );

    return;
}
                /*
                 * =========================
                 * NGƯỜI CHẾT
                 * =========================
                 */

                if (
                    !player.alive
                ) {

                    const recipients =
                        room.players.filter(
                            p =>
                                !p.alive &&
                                p.connected
                        );


                    for (
                        const recipient
                        of recipients
                    ) {

                        io.to(
                            recipient.id
                        ).emit(
                            "chatMessage",
                            {

                                playerId:
                                    player.id,

                                playerName:
                                    player.name,

                                text,

                                dead:
                                    true,

                                wolfChat:
                                    false,

                                coupleChat:
                                    false,

                                chatType:
                                    "dead"
                            }
                        );
                    }


                    return;
                }


                /*
                 * =========================
                 * BAN NGÀY
                 * =========================
                 */

                if (
                    room.phase === "daySpeech" ||
                    room.phase === "dayVote"
                ) {

                    const recipients =
                        room.players.filter(
                            p =>
                                p.connected
                        );


                    for (
                        const recipient
                        of recipients
                    ) {

                        io.to(
                            recipient.id
                        ).emit(
                            "chatMessage",
                            {

                                playerId:
                                    player.id,

                                playerName:
                                    player.name,

                                text,

                                dead:
                                    false,

                                wolfChat:
                                    false,

                                coupleChat:
                                    false,

                                chatType:
                                    "public"
                            }
                        );
                    }


                    return;
                }


                /*
                 * =========================
                 * BAN ĐÊM - SÓI
                 * =========================
                 */

                if (
                    room.phase === "night" &&
                    player.role === "Sói"
                ) {

                    const recipients =
                        room.players.filter(
                            p => {

                                if (
                                    !p.connected
                                ) {

                                    return false;
                                }


                                if (
                                    !p.alive
                                ) {

                                    return true;
                                }


                                if (
                                    p.role === "Sói"
                                ) {

                                    return true;
                                }


                                return (
                                    player.loverId ===
                                    p.id
                                );
                            }
                        );


                    const lover =
                        player.loverId
                            ? findPlayer(
                                player.loverId
                            )
                            : null;


                    for (
                        const recipient
                        of recipients
                    ) {

                        const isCoupleRecipient =
                            player.loverId ===
                                recipient.id &&
                            recipient.alive;


                        const isWolfRecipient =
                            recipient.role ===
                                "Sói" ||
                            !recipient.alive;


                        io.to(
                            recipient.id
                        ).emit(
                            "chatMessage",
                            {

                                playerId:
                                    player.id,

                                playerName:
                                    player.name,

                                text,

                                dead:
                                    false,

                                wolfChat:
                                    isWolfRecipient,

                                coupleChat:
                                    isCoupleRecipient,

                                chatType:
                                    isCoupleRecipient
                                        ? "couple"
                                        : "wolf"
                            }
                        );
                    }


                    addAdminLog(
                        `${player.name} nhắn ban đêm${
                            lover?.alive
                                ? " (Couple)"
                                : ""
                        }.`
                    );


                    return;
                }


                /*
                 * Người yêu không phải Sói:
                 * không được gửi tin ban đêm.
                 */

                if (
                    room.phase === "night" &&
                    player.loverId
                ) {

                    const lover =
                        findPlayer(
                            player.loverId
                        );


                    if (
                        !lover ||
                        !lover.alive
                    ) {

                        socket.emit(
                            "chatError",
                            {

                                message:
                                    "Couple không còn đủ 2 người sống."
                            }
                        );


                        return;
                    }


                    socket.emit(
                        "chatError",
                        {

                            message:
                                "💘 Ban đêm chỉ Sói trong Couple mới được nhắn."
                        }
                    );


                    return;
                }


                socket.emit(
                    "chatError",
                    {

                        message:
                            "Không thể chat lúc này."
                    }
                );
            }
        );


        /* =====================================================
           LEAVE
        ===================================================== */

        socket.on(
            "leaveRoom",
            () => {

                socket.emit(
                    "leftRoom"
                );


                handleDisconnect(
                    socket,
                    true
                );


                socket.data.playerId =
                    null;


                socket.disconnect(
                    true
                );
            }
        );


        /* =====================================================
           DISCONNECT
        ===================================================== */

        socket.on(
            "disconnect",
            () => {

                handleDisconnect(
                    socket,
                    false
                );
            }
        );
    }
);


/* =========================================================
   HANDLE DISCONNECT
========================================================= */

function handleDisconnect(
    socket,
    voluntary
) {

    const player =
        findPlayer(
            socket.data.playerId
        );


    if (
        !player
    ) {

        return;
    }


    if (
        !player.connected
    ) {

        return;
    }


    /* =====================================================
       LOBBY
    ===================================================== */

    if (
        !room.started
    ) {

        player.connected =
            false;


        const wasHost =
            room.hostId ===
            player.id;


        room.players =
            room.players.filter(
                p =>
                    p.id !==
                    player.id
            );


        if (
            wasHost
        ) {

            chooseHost();
        }


        room.targetPlayerCount =
            room.players.length;


        addLog(
            `${player.name} ${
                voluntary
                    ? "rời phòng"
                    : "mất kết nối"
            }.`
        );


        addAdminLog(
            `${player.name} ${
                voluntary
                    ? "rời phòng"
                    : "mất kết nối"
            }.`
        );


        socket.data.playerId =
            null;


        emitRoom();

        sendAdminState();


        return;
    }


    /* =====================================================
       GAME RUNNING - VOLUNTARY
    ===================================================== */

    if (
        voluntary
    ) {

        if (
            player.alive
        ) {

            const deaths =
                killPlayer(
                    player,
                    "Rời game"
                );


            if (
                room.phase === "night"
            ) {

                room.pendingNightDeaths.push(
                    ...deaths
                );


                if (
                    room.pendingHunter?.id ===
                    player.id
                ) {

                    room.pendingHunter =
                        null;


                    if (
                        checkWinner()
                    ) {

                        return;
                    }


                    startDaySpeech(
                        room.night?.witchSave === true,
                        !!room.night?.witchPoisonTargetId
                    );


                    return;
                }


                broadcastPlayers();


                checkWinner();

            } else {

                if (
                    deaths.length
                ) {

                    finalDeaths(
                        deaths,

                        "voteResult",

                        {},

                        () => {

                            if (
                                checkWinner()
                            ) {

                                return;
                            }


                            startNight();
                        }
                    );

                } else {

                    broadcastPlayers();

                    checkWinner();
                }
            }
        }


        addAdminLog(
            `${player.name} rời game.`
        );


        emitRoom();

        sendAdminState();


        return;
    }


    /* =====================================================
       MẤT KẾT NỐI
    ===================================================== */

    player.connected =
        false;


    addLog(
        `${player.name} mất kết nối. Có thể vào lại game.`
    );


    addAdminLog(
        `${player.name} mất kết nối. Chờ kết nối lại.`
    );


    /* =====================================================
       HUNTER
    ===================================================== */

    if (
        room.pendingHunter?.id ===
        player.id
    ) {

        room.pendingHunter =
            null;


        addAdminLog(
            `Thợ săn ${player.name} mất kết nối, bỏ qua lượt bắn.`
        );


        broadcastPlayers();


        if (
            checkWinner()
        ) {

            return;
        }


        startDaySpeech(
            room.night?.witchSave === true,
            !!room.night?.witchPoisonTargetId
        );


        return;
    }


    /*
     * Mất mạng KHÔNG chết.
     *
     * Có thể reconnect bằng deviceId.
     */

    broadcastPlayers();

    sendAdminState();
}


/* =========================================================
   START SERVER
========================================================= */

server.listen(
    PORT,
    () => {

        console.log(
            `🐺 Ma Sói Server chạy port ${PORT}`
        );

        console.log(
            `👥 Người chơi: ${MIN_PLAYERS}-${MAX_PLAYERS}`
        );

        console.log(
            `🌙 Sói + vai đêm: ${TIME.night} giây`
        );

        console.log(
            `🧙 Phù thủy: ${TIME.witchAction} giây`
        );

        console.log(
            `☀️ Ban ngày: ${TIME.daySpeech} giây`
        );

        console.log(
            `🗳️ Vote: ${TIME.dayVote} giây`
        );

        console.log(
            `🐺 Sói không thể vote Sói`
        );

        console.log(
            `🛡️ Bảo vệ không được bảo vệ cùng người 2 đêm liên tiếp`
        );

        console.log(
            `🎵 Music: lobby / night / witch / daySpeech / dayVote / win`
        );

        console.log(
            `🌐 Frontend: ${FRONTEND_URL}`
        );
    }
);
