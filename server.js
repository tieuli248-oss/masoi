const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const ADMIN_ID = process.env.ADMIN_ID || "admin";
const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "0909313631981962";

const FRONTEND_URL =
    process.env.FRONTEND_URL || "*";

const MIN_PLAYERS = 6;
const MAX_PLAYERS = 15;

const ALLOWED_SIZES = [
    6, 7, 8, 9, 10,
    11, 12, 13, 14, 15
];

const TIME = {
    night: 60,
    daySpeech: 240,
    dayVote: 30
};


/* =========================
   SERVER
========================= */

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("🐺 Ma Sói Online Server OK");
});

const io = new Server(server, {
    cors: {
        origin:
            FRONTEND_URL === "*"
                ? true
                : FRONTEND_URL,
        methods: ["GET", "POST"]
    }
});


/* =========================
   ROOM
========================= */

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


/* =========================
   UTIL
========================= */

function findPlayer(id) {
    return room.players.find(
        p => p.id === id
    );
}


/*
 * Tìm người chơi cũ bằng deviceId.
 * Dùng khi người chơi mất kết nối
 * rồi bấm "Vào lại".
 */
function findPlayerByDeviceId(deviceId) {

    if (!deviceId) {
        return null;
    }

    return room.players.find(
        p =>
            p.deviceId === deviceId
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


/* =========================
   ROLE
========================= */

function makeRoles(count) {

    let wolves = 0;
    let specials = [];

    if (count === 6) {

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

    } else if (count === 10) {

        wolves = 3;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];

    } else if (count === 11) {

        wolves = 3;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];

    } else if (count === 12) {

        wolves = 3;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];

    } else if (count === 13) {

        wolves = 4;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];

    } else if (count === 14) {

        wolves = 4;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];

    } else if (count === 15) {

        wolves = 4;

        specials = [
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Cupid"
        ];

    } else {

        return [];
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


/* =========================
   PUBLIC PLAYERS
========================= */

function publicPlayers(
    revealRoles = false
) {

    return room.players.map(p => {

        const hiddenNightDeath =
            room.started &&
            room.phase === "night" &&
            room.pendingNightDeaths.some(
                d => d.id === p.id
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

        if (revealRoles) {

            data.role =
                p.role;
        }

        return data;
    });
}


/* =========================
   ADMIN PLAYERS
========================= */

function adminPlayers() {

    return room.players.map(p => ({

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
    }));
}


/* =========================
   LOG
========================= */

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


/* =========================
   TIMER
========================= */

function stopTimer() {

    if (
        room.timerInterval
    ) {

        clearInterval(
            room.timerInterval
        );
    }

    room.timerInterval = null;

    room.timerEndsAt = null;

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

            room.timerInterval = null;

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


/* =========================
   ROOM UPDATE
========================= */

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
                    room.hostId
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


/* =========================
   ADMIN STATE
========================= */

function sendAdminState() {

    const wolfVotes = [];

    if (room.night) {

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

            witchSave:
                room.night?.witchSave ||
                false,

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
                    )?.name || null
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


/* =========================
   WOLF TARGET
========================= */

function calculateWolfTarget() {

    if (!room.night) {
        return null;
    }

    const counts =
        new Map();

    for (
        const targetId
        of room.night.wolfVotes.values()
    ) {

        counts.set(
            targetId,
            (counts.get(targetId) || 0) + 1
        );
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

            highest = count;
            leader = targetId;
            tie = false;

        } else if (
            count === highest &&
            count > 0
        ) {

            tie = true;
        }
    }

    if (
        !leader ||
        tie
    ) {

        return null;
    }

    const target =
        findPlayer(leader);

    if (
        !target ||
        !target.alive
    ) {

        return null;
    }

    return target;
}


/* =========================
   KILL PLAYER
========================= */

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

    player.alive = false;

    player.deathReasons.push(
        reason
    );

    deaths.push(player);

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

            lover.alive = false;

            lover.deathReasons.push(
                "Chết theo người yêu"
            );

            deaths.push(lover);
        }
    }

    return deaths;
}


/* =========================
   HUNTER
========================= */

function triggerHunter(
    deaths,
    callback
) {

    const hunter =
        deaths.find(
            p =>
                p.role === "Thợ săn"
        );

    if (!hunter) {

        callback();

        return;
    }

    room.pendingHunter = {
        id: hunter.id
    };

    stopTimer();

    if (
        hunter.connected
    ) {

        io.to(hunter.id).emit(
            "hunterActionRequired",
            {
                players:
                    publicPlayers(false)
                        .filter(
                            p =>
                                p.alive &&
                                p.id !== hunter.id
                        )
            }
        );

        addAdminLog(
            `Thợ săn ${hunter.name} đang chờ chọn người bắn.`
        );

        sendAdminState();

    } else {

        room.pendingHunter = null;

        callback();
    }
}


/* =========================
   FINAL DEATHS
========================= */

function finalDeaths(
    deaths,
    event,
    extra,
    callback
) {

    const unique = [];

    for (
        const p of deaths
    ) {

        if (
            p &&
            !unique.some(
                x =>
                    x.id === p.id
            )
        ) {

            unique.push(p);
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
            deaths: result,
            ...(extra || {})
        }
    );

    for (
        const p of unique
    ) {

        if (
            p.connected
        ) {

            io.to(p.id).emit(
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

        room.pendingNightDeaths = [];
    }

    broadcastPlayers();

    callback();
}


/* =========================
   WINNER
========================= */

function checkWinner() {

    if (!room.started) {
        return true;
    }

    const wolves =
        aliveWolves().length;

    const villagers =
        aliveNonWolves().length;

    if (
        wolves === 0
    ) {

        endGame(
            "Dân làng",
            "Tất cả Sói đã bị loại."
        );

        return true;
    }

    if (
        wolves >= villagers
    ) {

        endGame(
            "Sói",
            "Số Sói đã bằng hoặc vượt số người phe Dân."
        );

        return true;
    }

    if (
        alivePlayers().length === 0
    ) {

        endGame(
            "Hòa",
            "Không còn người chơi sống."
        );

        return true;
    }

    return false;
}


/* =========================
   NIGHT RESET
========================= */

function resetNight() {

    room.night = {

        wolfVotes:
            new Map(),

        wolfTargetId:
            null,

        guardTargetId:
            null,

        witchSave:
            false,

        witchPoisonTargetId:
            null,

        seerInspections:
            [],

        cupidPairs:
            [],

        hunterShotTargetId:
            null
    };
}


/* =========================
   START NIGHT
========================= */

function startNight() {

    if (!room.started) {
        return;
    }

    room.phase = "night";

    room.nightNumber++;

    resetNight();

    room.dayVotes =
        new Map();

    for (
        const p of room.players
    ) {

        p.seerUsedNight = false;

        p.dayVoteTargetId =
            null;
    }

    io.emit(
        "phaseChanged",
        {
            phase: "night",

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false)
        }
    );

    broadcastPlayers();

    startTimer(
        TIME.night,
        resolveNight
    );
}


/* =========================
   RESOLVE NIGHT
========================= */

function resolveNight() {

    if (
        !room.started ||
        room.phase !== "night"
    ) {

        return;
    }

    stopTimer();

    const deaths = [];

    const wolfTarget =
        calculateWolfTarget();

    room.night.wolfTargetId =
        wolfTarget?.id || null;

    /*
     * Sói cắn.
     */
    if (
        wolfTarget
    ) {

        const protectedByGuard =
            room.night.guardTargetId ===
            wolfTarget.id;

        const saved =
            room.night.witchSave === true;

        if (
            !protectedByGuard &&
            !saved &&
            wolfTarget.alive
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
     * Phù thủy đầu độc.
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

    /*
     * Lưu người chết.
     */
    room.pendingNightDeaths = [
        ...deaths
    ];

    addAdminLog(
        `Đêm ${room.nightNumber} kết thúc.`
    );

    triggerHunter(
        deaths,
        () => {

            if (!room.started) {
                return;
            }

            if (
                room.pendingNightDeaths.length === 0
            ) {

                if (
                    checkWinner()
                ) {

                    return;
                }

                startDaySpeech();

                return;
            }

            if (
                checkWinner()
            ) {

                return;
            }

            startDaySpeech();
        }
    );

    broadcastPlayers();
}


/* =========================
   DAY SPEECH
========================= */

function startDaySpeech() {

    if (!room.started) {
        return;
    }

    room.phase =
        "daySpeech";

    const nightDeaths =
        [...room.pendingNightDeaths];

    io.emit(
        "phaseChanged",
        {
            phase:
                "daySpeech",

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false)
        }
    );

    if (
        nightDeaths.length > 0
    ) {

        finalDeaths(
            nightDeaths,
            "nightResult",
            {
                nightNumber:
                    room.nightNumber
            },
            () => {

                if (!room.started) {
                    return;
                }

                if (
                    checkWinner()
                ) {

                    return;
                }

                startDaySpeechTimer();
            }
        );

        return;
    }

    broadcastPlayers();

    if (
        checkWinner()
    ) {

        return;
    }

    startDaySpeechTimer();
}


function startDaySpeechTimer() {

    if (!room.started) {
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


/* =========================
   DAY VOTE
========================= */

function startDayVote() {

    if (!room.started) {
        return;
    }

    room.phase =
        "dayVote";

    room.dayVotes =
        new Map();

    for (
        const p of room.players
    ) {

        p.dayVoteTargetId =
            null;
    }

    io.emit(
        "phaseChanged",
        {
            phase:
                "dayVote",

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false)
        }
    );

    broadcastPlayers();

    startTimer(
        TIME.dayVote,
        resolveDayVote
    );
}


/* =========================
   RESOLVE DAY VOTE
========================= */

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
            voter &&
            target &&
            voter.alive &&
            target.alive &&
            voter.id !== target.id
        ) {

            counts.set(
                target.id,
                (counts.get(target.id) || 0) + 1
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

            highest = count;

            leader =
                targetId;

            tie = false;

        } else if (
            count === highest
        ) {

            tie = true;
        }
    }

    const submitted =
        [...room.dayVotes.keys()]
            .filter(
                id =>
                    findPlayer(id)?.alive
            )
            .length;

    let executed = null;

    if (
        leader &&
        !tie &&
        highest >
            submitted / 2
    ) {

        executed =
            findPlayer(leader);
    }

    const deaths = [];

    if (
        executed
    ) {

        deaths.push(
            ...killPlayer(
                executed,
                "Bị dân làng bỏ phiếu loại"
            )
        );
    }

    triggerHunter(
        deaths,
        () => {

            if (!room.started) {
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
                            executed?.id || null,

                        executedName:
                            executed?.name || null,

                        voteCount:
                            highest,

                        submittedVotes:
                            submitted
                    },
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


/* =========================
   START GAME
========================= */

function startGame() {

    if (room.started) {

        return {
            ok: false,

            message:
                "Game đang chạy."
        };
    }

    const count =
        room.players.length;

    if (
        !ALLOWED_SIZES.includes(count)
    ) {

        return {
            ok: false,

            message:
                `Game cần từ ${MIN_PLAYERS} đến ${MAX_PLAYERS} người. Hiện có ${count} người.`
        };
    }

    const connectedPlayers =
        room.players.filter(
            p =>
                p.connected
        );

    if (
        connectedPlayers.length !== count
    ) {

        return {
            ok: false,

            message:
                "Có người đang mất kết nối. Vui lòng chờ phòng cập nhật."
        };
    }

    const notReady =
        connectedPlayers.filter(
            p =>
                p.id !== room.hostId &&
                p.ready !== true
        );

    if (
        notReady.length > 0
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
        [...roles];

    room.pendingNightDeaths =
        [];

    connectedPlayers.forEach(
        (player, index) => {

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

    for (
        const player
        of connectedPlayers
    ) {

        io.to(player.id).emit(
            "roleAssigned",
            {
                role:
                    player.role
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


/* =========================
   END GAME
========================= */

function endGame(
    winner,
    message
) {

    if (!room.started) {
        return;
    }

    stopTimer();

    const revealed =
        publicPlayers(true);

    io.emit(
        "gameEnded",
        {
            winner,

            message,

            players:
                revealed
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
        const p of room.players
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


/* =========================
   CHOOSE HOST
========================= */

function chooseHost() {

    const player =
        room.players.find(
            p =>
                p.connected
        );

    room.hostId =
        player?.id || null;
}


/* =========================
   RESET ROOM
========================= */

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
        const p of room.players
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

    addAdminLog(
        "Admin reset phòng."
    );

    emitRoom();

    sendAdminState();
}


/* =========================
   SOCKET
========================= */

io.on(
    "connection",
    socket => {

        socket.data.isAdmin =
            false;

        socket.data.playerId =
            null;


        /* =====================
           ADMIN LOGIN
        ===================== */

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
                    password ===
                        ADMIN_PASSWORD
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


        /* =====================
           ADMIN REFRESH
        ===================== */

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


        /* =====================
           ADMIN RESET
        ===================== */

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


        /* =====================
           ADMIN END GAME
        ===================== */

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


        /* =====================
           ADMIN KICK PLAYER
        ===================== */

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

                if (!player) {
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
                        room.phase ===
                        "night"
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


        /* =====================
           ADMIN KICK ALL
        ===================== */

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

                    if (s) {

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

                addAdminLog(
                    "Admin kick tất cả."
                );

                emitRoom();

                sendAdminState();
            }
        );


        /* =====================
           JOIN / RECONNECT
        ===================== */

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

                if (!name) {

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


                /* =========================
                   RECONNECT GAME
                ========================= */

                if (room.started) {

                    const reconnectPlayer =
                        findPlayerByDeviceId(
                            deviceId
                        );

                    /*
                     * Chỉ cho người cũ đã offline
                     * vào lại.
                     */
                    if (
                        reconnectPlayer &&
                        !reconnectPlayer.connected
                    ) {

                        const oldId =
                            reconnectPlayer.id;

                        const newId =
                            socket.id;

                        /*
                         * Đổi socket ID.
                         * Giữ nguyên toàn bộ trạng thái.
                         */
                        reconnectPlayer.id =
                            newId;

                        reconnectPlayer.connected =
                            true;

                        /*
                         * Host.
                         */
                        if (
                            room.hostId === oldId
                        ) {

                            room.hostId =
                                newId;
                        }

                        /*
                         * Người yêu.
                         */
                        for (
                            const p of room.players
                        ) {

                            if (
                                p.loverId === oldId
                            ) {

                                p.loverId =
                                    newId;
                            }
                        }

                        /*
                         * Vote ban ngày.
                         */
                        if (
                            room.dayVotes.has(oldId)
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
                                targetId === oldId
                            ) {

                                room.dayVotes.set(
                                    voterId,
                                    newId
                                );
                            }
                        }

                        /*
                         * Dữ liệu ban đêm.
                         */
                        if (room.night) {

                            /*
                             * Vote Sói của chính người reconnect.
                             */
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

                            /*
                             * Nếu ai đó đang vote
                             * vào người reconnect.
                             */
                            for (
                                const [
                                    wolfId,
                                    targetId
                                ]
                                of room.night.wolfVotes
                            ) {

                                if (
                                    targetId === oldId
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

                            /*
                             * Tiên tri.
                             */
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
                         * Thợ săn đang chờ.
                         */
                        if (
                            room.pendingHunter &&
                            room.pendingHunter.id ===
                            oldId
                        ) {

                            room.pendingHunter.id =
                                newId;
                        }

                        /*
                         * Gắn socket mới vào player cũ.
                         */
                        socket.data.playerId =
                            newId;

                        /*
                         * Báo client đây là reconnect.
                         */
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
                                    newId,

                                yourName:
                                    reconnectPlayer.name,

                                isHost:
                                    newId ===
                                    room.hostId,

                                reconnect:
                                    true
                            }
                        );

                        /*
                         * Gửi lại vai.
                         */
                        socket.emit(
                            "roleAssigned",
                            {
                                role:
                                    reconnectPlayer.role
                            }
                        );

                        /*
                         * Gửi phase hiện tại.
                         */
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

                        /*
                         * Gửi timer hiện tại.
                         */
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

                        addLog(
                            `${reconnectPlayer.name} đã vào lại game.`
                        );

                        addAdminLog(
                            `${reconnectPlayer.name} đã kết nối lại.`
                        );

                        broadcastPlayers();

                        return;
                    }

                    /*
                     * Người mới không được vào
                     * khi game đang chạy.
                     */
                    socket.emit(
                        "enterError",
                        {
                            message:
                                "Game đang chạy. Chỉ người chơi cũ mới được vào lại."
                        }
                    );

                    return;
                }


                /* =========================
                   LOBBY JOIN
                ========================= */

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

                /*
                 * Thiết bị đang online.
                 */
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

                /*
                 * Tên đang online.
                 */
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
                                MAX_PLAYERS
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


        /* =====================
           READY
        ===================== */

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

                if (!player) {
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


        /* =====================
           START GAME
        ===================== */

        socket.on(
            "startGame",
            () => {

                const player =
                    findPlayer(
                        socket.data.playerId
                    );

                if (!player) {
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


        /* =====================
           WOLF
        ===================== */

        socket.on(
            "wolfVote",
            data => {

                if (
                    room.phase !==
                    "night"
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

                if (
                    !wolf ||
                    !wolf.alive ||
                    wolf.role !== "Sói" ||
                    !target ||
                    !target.alive ||
                    target.id === wolf.id
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

                room.night.wolfVotes.set(
                    wolf.id,
                    target.id
                );

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

                addAdminLog(
                    `Sói ${wolf.name} chọn ${target.name}.`
                );

                sendAdminState();
            }
        );


        /* =====================
           GUARD
        ===================== */

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

                if (
                    room.phase !==
                    "night" ||
                    !guard ||
                    !guard.alive ||
                    guard.role !== "Bảo vệ" ||
                    !target ||
                    !target.alive
                ) {

                    return;
                }

                room.night.guardTargetId =
                    target.id;

                socket.emit(
                    "actionAccepted",
                    {
                        type:
                            "guard"
                    }
                );

                addAdminLog(
                    `Bảo vệ ${guard.name} bảo vệ ${target.name}.`
                );

                sendAdminState();
            }
        );


        /* =====================
           SEER
        ===================== */

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
                    room.phase !==
                    "night" ||
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

                /*
                 * Tiên tri chỉ cần biết
                 * mục tiêu thuộc phe Sói hay phe Dân.
                 */
                let result;

                if (
                    target.role ===
                    "Sói"
                ) {

                    result =
                        "🐺 Sói";

                } else {

                    result =
                        "👨‍🌾 Phe Dân";
                }

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


        /* =====================
           WITCH SAVE
        ===================== */

        socket.on(
            "witchSave",
            () => {

                const witch =
                    findPlayer(
                        socket.data.playerId
                    );

                if (
                    room.phase !==
                    "night" ||
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

                const target =
                    calculateWolfTarget();

                if (!target) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "Chưa có mục tiêu Sói."
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

                addAdminLog(
                    `Phù thủy ${witch.name} dùng bình cứu.`
                );

                sendAdminState();
            }
        );


        /* =====================
           WITCH POISON
        ===================== */

        socket.on(
            "witchPoison",
            data => {

                const witch =
                    findPlayer(
                        socket.data.playerId
                    );

                const target =
                    findPlayer(
                        data?.targetId
                    );

                if (
                    room.phase !==
                    "night" ||
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
                    !target.alive ||
                    target.id === witch.id
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


        /* =====================
           CUPID
        ===================== */

        socket.on(
            "cupidPair",
            data => {

                const cupid =
                    findPlayer(
                        socket.data.playerId
                    );

                if (
                    room.phase !==
                    "night" ||
                    room.nightNumber !== 1 ||
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

                io.to(
                    first.id
                ).emit(
                    "loverLinked",
                    {
                        loverId:
                            second.id,

                        loverName:
                            second.name
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
                            first.name
                    }
                );

                addAdminLog(
                    `Cupid ghép ${first.name} ❤️ ${second.name}.`
                );

                sendAdminState();
            }
        );


        /* =====================
           HUNTER
        ===================== */

        socket.on(
            "hunterShoot",
            data => {

                if (
                    !room.pendingHunter
                ) {

                    return;
                }

                if (
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

                /*
                 * Ban đêm:
                 * không công bố ngay.
                 */
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

                    startDaySpeech();

                    return;
                }

                /*
                 * Ban ngày:
                 * công bố ngay.
                 */
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


        /* =====================
           DAY VOTE
        ===================== */

        socket.on(
            "dayVote",
            data => {

                if (
                    room.phase !==
                    "dayVote"
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


        /* =====================
           CHAT
        ===================== */

        socket.on(
            "chatMessage",
            data => {

                const player =
                    findPlayer(
                        socket.data.playerId
                    );

                if (!player) {
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

                let recipients = [];

                /*
                 * NGƯỜI CHẾT:
                 * chỉ người chết thấy.
                 */
                if (
                    !player.alive
                ) {

                    recipients =
                        room.players.filter(
                            p =>
                                !p.alive &&
                                p.connected
                        );

                /*
                 * BAN NGÀY:
                 * người sống chat với người sống.
                 */
                } else if (
                    room.phase ===
                    "daySpeech" ||
                    room.phase ===
                    "dayVote"
                ) {

                    recipients =
                        room.players.filter(
                            p =>
                                p.alive &&
                                p.connected
                        );

                /*
                 * BAN ĐÊM:
                 * chỉ Sói chat với Sói.
                 */
                } else if (
                    room.phase ===
                    "night" &&
                    player.role ===
                    "Sói"
                ) {

                    recipients =
                        room.players.filter(
                            p =>
                                p.alive &&
                                p.role ===
                                "Sói" &&
                                p.connected
                        );

                } else {

                    socket.emit(
                        "chatError",
                        {
                            message:
                                "Không thể chat lúc này."
                        }
                    );

                    return;
                }

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
                                !player.alive,

                            wolfChat:
                                room.phase ===
                                "night" &&
                                player.role ===
                                "Sói"
                        }
                    );
                }
            }
        );


        /* =====================
           LEAVE
        ===================== */

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


        /* =====================
           DISCONNECT
        ===================== */

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


/* =========================
   HANDLE DISCONNECT
========================= */

function handleDisconnect(
    socket,
    voluntary
) {

    const player =
        findPlayer(
            socket.data.playerId
        );

    if (!player) {
        return;
    }

    if (
        !player.connected
    ) {
        return;
    }


    /* =========================
       LOBBY
       XÓA HẲN PLAYER
    ========================= */

    if (
        !room.started
    ) {

        player.connected =
            false;

        const wasHost =
            room.hostId === player.id;

        room.players =
            room.players.filter(
                p =>
                    p.id !== player.id
            );

        if (wasHost) {

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


    /* =========================
       GAME ĐANG CHẠY
    ========================= */

    /*
     * Nếu người chơi chủ động bấm
     * "Rời game":
     *
     * -> xử lý như rời game thật.
     */
    if (voluntary) {

        if (player.alive) {

            const deaths =
                killPlayer(
                    player,
                    "Rời game"
                );

            if (
                room.phase ===
                "night"
            ) {

                room.pendingNightDeaths.push(
                    ...deaths
                );

                /*
                 * Nếu là Thợ săn đang chờ bắn.
                 */
                if (
                    room.pendingHunter &&
                    room.pendingHunter.id ===
                    player.id
                ) {

                    room.pendingHunter =
                        null;

                    addAdminLog(
                        `${player.name} rời game khi đang chờ Thợ săn.`
                    );

                    broadcastPlayers();

                    if (
                        checkWinner()
                    ) {

                        return;
                    }

                    startDaySpeech();

                    return;
                }

                broadcastPlayers();

                checkWinner();

            } else {

                if (
                    deaths.length > 0
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


    /* =========================
       MẤT KẾT NỐI
    ========================= */

    /*
     * QUAN TRỌNG:
     *
     * Mất mạng KHÔNG được chết.
     *
     * Chỉ đánh dấu:
     *
     * connected = false
     *
     * Toàn bộ trạng thái vẫn giữ nguyên:
     * - role
     * - alive
     * - loverId
     * - used
     * - vote
     * - seerUsedNight
     * - ...
     *
     * Sau đó người chơi có thể dùng
     * deviceId để vào lại.
     */

    player.connected =
        false;

    addLog(
        `${player.name} mất kết nối. Có thể vào lại game.`
    );

    addAdminLog(
        `${player.name} mất kết nối. Chờ kết nối lại.`
    );


    /* =========================
       THỢ SĂN
    ========================= */

    /*
     * Nếu Thợ săn đang được yêu cầu
     * bắn nhưng mất kết nối thì không thể
     * chờ vô hạn.
     */
    if (
        room.pendingHunter &&
        room.pendingHunter.id ===
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

        startDaySpeech();

        return;
    }


    /* =========================
       KHÔNG GIẾT
    ========================= */

    broadcastPlayers();

    sendAdminState();

    return;
}


/* =========================
   START SERVER
========================= */

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
            `🌐 Frontend: ${FRONTEND_URL}`
        );
    }
);
