const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const PHASE_MS = {
    night: 60_000,
    daySpeech: 5 * 60_000,
    dayVote: 30_000
};

const ALLOWED_PLAYER_COUNTS = new Set([
    6,
    8,
    10,
    12,
    14,
    15
]);

const ROLE_META = {
    "Sói": {
        icon: "🐺",
        team: "wolf"
    },

    "Tiên tri": {
        icon: "🔮",
        team: "village"
    },

    "Bảo vệ": {
        icon: "🛡️",
        team: "village"
    },

    "Phù thủy": {
        icon: "🧪",
        team: "village"
    },

    "Thợ săn": {
        icon: "🏹",
        team: "village"
    },

    "Cupid": {
        icon: "💘",
        team: "village"
    },

    "Dân làng": {
        icon: "👨‍🌾",
        team: "village"
    }
};


// ============================================================
// HTTP
// ============================================================

const server = http.createServer((req, res) => {

    res.writeHead(
        200,
        {
            "Content-Type":
                "text/plain; charset=utf-8"
        }
    );

    res.end(
        "🐺 Ma Sói Online server đang chạy."
    );
});


// ============================================================
// SOCKET.IO
// ============================================================

const io = new Server(
    server,
    {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },

        transports: [
            "websocket",
            "polling"
        ]
    }
);


// ============================================================
// ROOM
// ============================================================

const room = {

    started: false,

    phase: "lobby",

    nightNumber: 0,

    hostId: null,

    players: [],

    logs: [],

    roleComposition: [],

    timer: null,

    timerTicker: null,

    timerEndsAt: 0,

    dayVotes: new Map(),

    night: null,

    epoch: 0,

    resolvingHunters: false,

    hunterQueue: [],

    hunterResolver: null
};


// ============================================================
// HELPERS
// ============================================================

function shuffle(arr) {

    const copy = [...arr];

    for (
        let i = copy.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() *
                (i + 1)
            );

        [
            copy[i],
            copy[j]
        ] = [
            copy[j],
            copy[i]
        ];
    }

    return copy;
}


function getPlayer(id) {

    return (
        room.players.find(
            player =>
                player.id === id
        ) || null
    );
}


function livingPlayers() {

    return room.players.filter(
        player =>
            player.alive
    );
}


function livingWolves() {

    return room.players.filter(
        player =>
            player.alive &&
            player.role === "Sói"
    );
}


function publicPlayers(
    revealRoles = false
) {

    return room.players.map(
        player => {

            const data = {

                id:
                    player.id,

                name:
                    player.name,

                alive:
                    player.alive,

                connected:
                    player.connected,

                isHost:
                    player.id === room.hostId,

                deathReasons:
                    [
                        ...(player.deathReasons || [])
                    ]
            };

            if (revealRoles) {

                data.role =
                    player.role || null;
            }

            return data;
        }
    );
}


function publicRoom() {

    return {

        started:
            room.started,

        phase:
            room.phase,

        nightNumber:
            room.nightNumber,

        hostId:
            room.hostId,

        players:
            publicPlayers(false),

        logs:
            [...room.logs],

        roleComposition:
            [...room.roleComposition],

        timerEndsAt:
            room.timerEndsAt
    };
}


function broadcastRoom() {

    const players =
        publicPlayers(false);

    io.emit(
        "roomUpdate",
        {
            room:
                publicRoom(),

            players
        }
    );

    io.emit(
        "playersUpdate",
        {
            players
        }
    );
}


function addLog(text) {

    room.logs.push({

        text:
            String(text),

        time:
            Date.now()
    });

    if (
        room.logs.length > 150
    ) {

        room.logs.shift();
    }

    broadcastRoom();
}


function compositionFromRoles(
    roles
) {

    const order = [
        "Sói",
        "Tiên tri",
        "Bảo vệ",
        "Phù thủy",
        "Thợ săn",
        "Cupid",
        "Dân làng"
    ];

    const counts =
        new Map();

    for (
        const role of roles
    ) {

        counts.set(
            role,
            (
                counts.get(role) || 0
            ) + 1
        );
    }

    return order
        .filter(
            role =>
                counts.has(role)
        )
        .map(
            role => ({

                role,

                count:
                    counts.get(role),

                icon:
                    ROLE_META[role].icon
            })
        );
}


// ============================================================
// ROLE SETUP
// ============================================================

function makeRoles(
    count
) {

    if (
        !ALLOWED_PLAYER_COUNTS.has(count)
    ) {

        return null;
    }


    // 6
    if (count === 6) {

        const special =
            Math.random() < 0.5
                ? "Tiên tri"
                : "Bảo vệ";

        return shuffle([

            "Sói",
            "Sói",

            special,

            "Dân làng",
            "Dân làng",
            "Dân làng"
        ]);
    }


    // 8
    if (count === 8) {

        return shuffle([

            "Sói",
            "Sói",

            "Tiên tri",

            "Bảo vệ",

            "Dân làng",
            "Dân làng",
            "Dân làng",
            "Dân làng"
        ]);
    }


    // 10
    if (count === 10) {

        const wolfCount =
            Math.random() < 0.5
                ? 2
                : 3;

        const roles = [

            ...Array(
                wolfCount
            ).fill("Sói"),

            "Tiên tri",

            "Bảo vệ",

            "Phù thủy"
        ];

        while (
            roles.length < count
        ) {

            roles.push(
                "Dân làng"
            );
        }

        return shuffle(
            roles
        );
    }


    // 12
    if (count === 12) {

        const roles = [

            "Sói",
            "Sói",
            "Sói",

            "Tiên tri",

            "Bảo vệ",

            "Phù thủy",

            "Thợ săn"
        ];

        while (
            roles.length < count
        ) {

            roles.push(
                "Dân làng"
            );
        }

        return shuffle(
            roles
        );
    }


    // 14 - 15
    const wolfCount =
        Math.random() < 0.5
            ? 3
            : 4;

    const roles = [

        ...Array(
            wolfCount
        ).fill("Sói"),

        "Tiên tri",

        "Bảo vệ",

        "Phù thủy",

        "Thợ săn",

        "Cupid"
    ];

    while (
        roles.length < count
    ) {

        roles.push(
            "Dân làng"
        );
    }

    return shuffle(
        roles
    );
}


// ============================================================
// TIMER
// ============================================================

function clearPhaseTimer() {

    if (room.timer) {

        clearTimeout(
            room.timer
        );

        room.timer = null;
    }

    if (
        room.timerTicker
    ) {

        clearInterval(
            room.timerTicker
        );

        room.timerTicker = null;
    }

    room.timerEndsAt = 0;
}


function startPhaseTimer(
    ms,
    callback
) {

    clearPhaseTimer();

    const epoch =
        room.epoch;

    room.timerEndsAt =
        Date.now() + ms;


    function emitTime() {

        if (
            !room.started ||
            room.epoch !== epoch
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
                remaining
            }
        );
    }


    emitTime();


    room.timerTicker =
        setInterval(
            () => {

                if (
                    !room.started ||
                    room.epoch !== epoch
                ) {

                    clearPhaseTimer();

                    return;
                }

                emitTime();
            },
            250
        );


    room.timer =
        setTimeout(
            () => {

                clearPhaseTimer();

                if (
                    room.started &&
                    room.epoch === epoch
                ) {

                    callback();
                }
            },
            ms + 50
        );
}


// ============================================================
// PHASE
// ============================================================

function emitPhaseChanged() {

    io.emit(
        "phaseChanged",
        {

            phase:
                room.phase,

            nightNumber:
                room.nightNumber,

            players:
                publicPlayers(false),

            roleComposition:
                room.roleComposition
        }
    );

    broadcastRoom();
}


// ============================================================
// NIGHT
// ============================================================

function resetNightState() {

    room.night = {

        wolfVotes:
            new Map(),

        guardTarget:
            null,

        witchSave:
            false,

        witchPoisonTarget:
            null
    };
}


// ============================================================
// ROLE
// ============================================================

function sendPrivateRoleAssignments() {

    for (
        const player of room.players
    ) {

        io.to(
            player.id
        ).emit(
            "roleAssigned",
            {
                role:
                    player.role
            }
        );
    }
}


function playerCanAct(
    player,
    role
) {

    return Boolean(

        player &&

        room.started &&

        room.phase === "night" &&

        player.alive &&

        player.role === role
    );
}


// ============================================================
// DEATH
// ============================================================

function markDead(
    player,
    reason,
    cause
) {

    if (
        !player ||
        !player.alive
    ) {

        return [];
    }

    player.alive = false;

    if (
        !Array.isArray(
            player.deathReasons
        )
    ) {

        player.deathReasons = [];
    }

    player.deathReasons.push(
        reason
    );


    const deaths = [

        {
            player,

            reason,

            cause
        }
    ];


    // Lover chết theo
    if (
        player.loverId
    ) {

        const lover =
            getPlayer(
                player.loverId
            );

        if (
            lover &&
            lover.alive
        ) {

            deaths.push(
                ...markDead(
                    lover,

                    "💔 Chết theo người yêu",

                    "lover"
                )
            );
        }
    }

    return deaths;
}


function dedupeDeaths(
    deaths
) {

    const map =
        new Map();

    for (
        const death of deaths
    ) {

        if (
            !map.has(
                death.player.id
            )
        ) {

            map.set(
                death.player.id,
                death
            );
        }
    }

    return [
        ...map.values()
    ];
}


function announceDeaths(
    deaths
) {

    for (
        const death of dedupeDeaths(deaths)
    ) {

        io.emit(
            "dead",
            {

                playerId:
                    death.player.id,

                message:
                    `☠️ ${death.player.name} đã chết.`
            }
        );
    }
}


// ============================================================
// WINNER
// ============================================================

function getWinner() {

    const alive =
        livingPlayers();

    const wolves =
        alive.filter(
            player =>
                player.role === "Sói"
        ).length;

    const nonWolves =
        alive.length -
        wolves;


    if (
        wolves === 0
    ) {

        return "Dân";
    }


    if (
        wolves >= nonWolves
    ) {

        return "Sói";
    }


    return null;
}


// ============================================================
// HUNTER
// ============================================================

function queueHunters(
    deaths,
    done
) {

    const hunters =
        dedupeDeaths(deaths)
            .map(
                death =>
                    death.player
            )
            .filter(
                player =>

                    player.role ===
                        "Thợ săn" &&

                    !player.used.hunter &&

                    !player._hunterPending
            );


    if (
        !hunters.length
    ) {

        done();

        return;
    }


    room.resolvingHunters =
        true;

    room.hunterQueue =
        hunters;

    room.hunterResolver =
        done;


    for (
        const hunter of hunters
    ) {

        hunter._hunterPending =
            true;


        io.to(
            hunter.id
        ).emit(
            "hunterActionRequired",
            {

                message:
                    "🏹 Bạn đã chết. Chọn 1 người còn sống để bắn.",

                players:
                    publicPlayers(false)
            }
        );
    }
}


function finishHunterQueueIfDone() {

    if (
        room.hunterQueue.length
    ) {

        return;
    }


    room.resolvingHunters =
        false;


    const resolver =
        room.hunterResolver;

    room.hunterResolver =
        null;


    if (resolver) {

        resolver();
    }
}


function handleHunterShoot(
    socket,
    targetId
) {

    const hunter =
        getPlayer(
            socket.id
        );


    if (
        !hunter ||
        hunter.role !== "Thợ săn" ||
        hunter.alive ||
        !hunter._hunterPending
    ) {

        socket.emit(
            "actionError",
            {
                message:
                    "🏹 Bạn không có lượt bắn."
            }
        );

        return;
    }


    const target =
        getPlayer(
            targetId
        );


    if (
        !target ||
        !target.alive ||
        target.id === hunter.id
    ) {

        socket.emit(
            "actionError",
            {
                message:
                    "🎯 Mục tiêu không hợp lệ."
            }
        );

        return;
    }


    hunter.used.hunter =
        true;

    hunter._hunterPending =
        false;


    let deaths =
        markDead(
            target,

            "🏹 Bị Thợ săn bắn",

            "hunter"
        );


    deaths =
        dedupeDeaths(
            deaths
        );


    announceDeaths(
        deaths
    );

    broadcastRoom();


    room.hunterQueue =
        room.hunterQueue.filter(
            player =>
                player.id !== hunter.id
        );


    // Nếu Hunter bắn trúng Hunter khác
    const extraHunters =
        deaths
            .map(
                death =>
                    death.player
            )
            .filter(
                player =>

                    player.role ===
                        "Thợ săn" &&

                    !player.used.hunter &&

                    !player._hunterPending
            );


    for (
        const nextHunter of extraHunters
    ) {

        nextHunter._hunterPending =
            true;

        room.hunterQueue.push(
            nextHunter
        );


        io.to(
            nextHunter.id
        ).emit(
            "hunterActionRequired",
            {

                message:
                    "🏹 Bạn đã chết. Chọn 1 người còn sống để bắn.",

                players:
                    publicPlayers(false)
            }
        );
    }


    finishHunterQueueIfDone();
}


// ============================================================
// NIGHT -> DAY
// ============================================================

function startNight() {

    if (
        !room.started
    ) {

        return;
    }


    room.phase =
        "night";


    room.nightNumber =
        Math.max(
            1,
            room.nightNumber
        );


    resetNightState();


    room.dayVotes.clear();


    emitPhaseChanged();


    addLog(
        `🌙 Đêm ${room.nightNumber} bắt đầu.`
    );


    startPhaseTimer(
        PHASE_MS.night,
        resolveNight
    );
}


function startDaySpeech() {

    if (
        !room.started
    ) {

        return;
    }


    room.phase =
        "daySpeech";


    room.night =
        null;


    emitPhaseChanged();


    addLog(
        "☀️ Bắt đầu thảo luận — 5 phút."
    );


    startPhaseTimer(
        PHASE_MS.daySpeech,
        startDayVote
    );
}


function startDayVote() {

    if (
        !room.started
    ) {

        return;
    }


    room.phase =
        "dayVote";


    room.dayVotes.clear();


    emitPhaseChanged();


    io.emit(
        "dayVoteStarted",
        {

            totalVoters:
                livingPlayers().length
        }
    );


    addLog(
        "🗳️ Biểu quyết bắt đầu — 30 giây."
    );


    startPhaseTimer(
        PHASE_MS.dayVote,
        resolveDayVote
    );
}


// ============================================================
// RESOLVE NIGHT
// ============================================================

function resolveNight() {

    clearPhaseTimer();


    if (
        !room.started ||
        room.phase !== "night"
    ) {

        return;
    }


    const deaths = [];


    // --------------------------------------------------------
    // WOLF VOTES
    // Chỉ tính lựa chọn cuối cùng
    // --------------------------------------------------------

    const wolfCounts =
        new Map();


    for (
        const [
            wolfId,
            targetId
        ]
        of room.night.wolfVotes.entries()
    ) {

        const wolf =
            getPlayer(
                wolfId
            );

        const target =
            getPlayer(
                targetId
            );


        if (

            wolf &&
            wolf.alive &&
            wolf.role === "Sói" &&

            target &&
            target.alive

        ) {

            wolfCounts.set(
                target.id,

                (
                    wolfCounts.get(
                        target.id
                    ) || 0
                ) + 1
            );
        }
    }


    let wolfTargetId =
        null;


    if (
        wolfCounts.size
    ) {

        const max =
            Math.max(
                ...wolfCounts.values()
            );


        const leaders =
            [
                ...wolfCounts.entries()
            ]
            .filter(
                ([, count]) =>
                    count === max
            )
            .map(
                ([targetId]) =>
                    targetId
            );


        // Hòa phiếu Sói -> không giết
        if (
            leaders.length === 1
        ) {

            wolfTargetId =
                leaders[0];
        }
    }


    // --------------------------------------------------------
    // WOLF KILL
    // --------------------------------------------------------

    if (

        wolfTargetId &&

        wolfTargetId !==
            room.night.guardTarget &&

        !room.night.witchSave

    ) {

        const target =
            getPlayer(
                wolfTargetId
            );


        if (
            target &&
            target.alive
        ) {

            deaths.push(
                ...markDead(
                    target,

                    "🐺 Bị Sói cắn",

                    "wolf"
                )
            );
        }
    }


    // --------------------------------------------------------
    // WITCH POISON
    // --------------------------------------------------------

    if (
        room.night.witchPoisonTarget
    ) {

        const target =
            getPlayer(
                room.night.witchPoisonTarget
            );


        if (
            target &&
            target.alive
        ) {

            deaths.push(
                ...markDead(
                    target,

                    "🧪 Bị Phù thủy đầu độc",

                    "witch"
                )
            );
        }
    }


    const uniqueDeaths =
        dedupeDeaths(
            deaths
        );


    announceDeaths(
        uniqueDeaths
    );


    broadcastRoom();


    const finishNight = () => {

        const finalDeaths =
            dedupeDeaths(
                uniqueDeaths
            );


        io.emit(
            "nightResult",
            {

                nightNumber:
                    room.nightNumber,

                deaths:
                    finalDeaths.map(
                        death => ({

                            name:
                                death.player.name,

                            reasons:
                                [
                                    ...death.player.deathReasons
                                ]
                        })
                    ),

                players:
                    publicPlayers(false),

                message:
                    finalDeaths.length
                        ? `🌙 Đêm ${room.nightNumber} có người chết.`
                        : `🌙 Đêm ${room.nightNumber} không có ai chết.`
            }
        );


        broadcastRoom();


        const winner =
            getWinner();


        if (winner) {

            endGame(
                winner
            );

            return;
        }


        startDaySpeech();
    };


    queueHunters(
        uniqueDeaths,
        finishNight
    );
}


// ============================================================
// RESOLVE DAY VOTE
// ============================================================

function resolveDayVote() {

    clearPhaseTimer();


    if (
        !room.started ||
        room.phase !== "dayVote"
    ) {

        return;
    }


    /*
     * Chỉ lấy vote cuối cùng
     * của từng người.
     */

    const votes = [];


    for (
        const [
            voterId,
            targetId
        ]
        of room.dayVotes.entries()
    ) {

        const voter =
            getPlayer(
                voterId
            );

        const target =
            getPlayer(
                targetId
            );


        if (

            voter &&
            voter.alive &&

            target &&
            target.alive &&

            voter.id !== target.id

        ) {

            votes.push({

                voterId:
                    voter.id,

                voterName:
                    voter.name,

                targetId:
                    target.id,

                targetName:
                    target.name
            });
        }
    }


    // --------------------------------------------------------
    // ĐẾM PHIẾU
    // --------------------------------------------------------

    const counts =
        new Map();


    for (
        const vote of votes
    ) {

        counts.set(

            vote.targetId,

            (
                counts.get(
                    vote.targetId
                ) || 0
            ) + 1
        );
    }


    const totalVoters =
        livingPlayers().length;


    const maxVotes =
        counts.size
            ? Math.max(
                ...counts.values()
            )
            : 0;


    const leaders =
        [
            ...counts.entries()
        ]
        .filter(
            ([, count]) =>
                count === maxVotes
        )
        .map(
            ([targetId]) =>
                targetId
        );


    /*
     * QUY TẮC:
     *
     * Phải > 50% tổng số người sống.
     *
     * Ví dụ 6 người sống:
     * 4 phiếu = được xử
     * 3 phiếu = chưa đủ
     *
     * Hòa = không ai bị xử.
     */

    const hasMajority =
        leaders.length === 1 &&
        maxVotes >
            totalVoters / 2;


    let executed =
        null;

    let deaths = [];


    if (
        hasMajority
    ) {

        executed =
            getPlayer(
                leaders[0]
            );


        if (
            executed &&
            executed.alive
        ) {

            deaths =
                markDead(

                    executed,

                    "🗳️ Bị đa số phiếu loại",

                    "vote"
                );
        }
    }


    const uniqueDeaths =
        dedupeDeaths(
            deaths
        );


    announceDeaths(
        uniqueDeaths
    );


    broadcastRoom();


    const finishVote = () => {

        io.emit(
            "voteResult",
            {

                /*
                 * Đây là TOÀN BỘ PHIẾU
                 * cuối cùng của từng người.
                 *
                 * Chỉ gửi SAU 30 giây.
                 */

                votes,

                counts:
                    [
                        ...counts.entries()
                    ]
                    .map(
                        (
                            [
                                targetId,
                                count
                            ]
                        ) => {

                            const target =
                                getPlayer(
                                    targetId
                                );

                            return {

                                targetId,

                                targetName:
                                    target
                                        ? target.name
                                        : "",

                                count
                            };
                        }
                    ),

                totalVoters,

                executed:
                    executed
                        ? {
                            id:
                                executed.id,

                            name:
                                executed.name
                        }
                        : null,

                players:
                    publicPlayers(false),

                message:
                    executed
                        ? `🗳️ ${executed.name} bị loại.`

                        : "⚖️ Không đạt đa số hoặc bị hòa — không ai bị loại."
            }
        );


        room.dayVotes.clear();


        broadcastRoom();


        const winner =
            getWinner();


        if (winner) {

            endGame(
                winner
            );

            return;
        }


        room.nightNumber += 1;


        startNight();
    };


    queueHunters(
        uniqueDeaths,
        finishVote
    );
}


// ============================================================
// START GAME
// ============================================================

function startGame(
    socket
) {

    if (
        room.started
    ) {

        socket.emit(
            "errorMessage",
            {
                message:
                    "⚠️ Ván game đang diễn ra."
            }
        );

        return;
    }


    if (
        socket.id !== room.hostId
    ) {

        socket.emit(
            "errorMessage",
            {
                message:
                    "👑 Chỉ Host mới được bắt đầu game."
            }
        );

        return;
    }


    const count =
        room.players.length;


    if (
        !ALLOWED_PLAYER_COUNTS.has(count)
    ) {

        socket.emit(
            "errorMessage",
            {
                message:
                    `⚠️ Game cần đúng 6, 8, 10, 12, 14 hoặc 15 người. Hiện có ${count}.`
            }
        );

        return;
    }


    const roles =
        makeRoles(count);


    if (!roles) {

        socket.emit(
            "errorMessage",
            {
                message:
                    "Không tạo được bộ role."
            }
        );

        return;
    }


    room.started =
        true;

    room.phase =
        "night";

    room.nightNumber =
        1;

    room.logs =
        [];

    room.dayVotes.clear();

    room.epoch += 1;


    room.roleComposition =
        compositionFromRoles(
            roles
        );


    room.hunterQueue =
        [];

    room.resolvingHunters =
        false;

    room.hunterResolver =
        null;


    room.players.forEach(
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

            player.loverId =
                null;

            player.connected =
                true;


            player.used = {

                seer:
                    false,

                guard:
                    false,

                witchSave:
                    false,

                witchPoison:
                    false,

                hunter:
                    false,

                cupid:
                    false
            };


            player._hunterPending =
                false;


            player.witchSaveAvailable =
                player.role ===
                    "Phù thủy";


            player.witchPoisonAvailable =
                player.role ===
                    "Phù thủy";
        }
    );


    io.emit(
        "gameStarted",
        {

            room:
                publicRoom(),

            players:
                publicPlayers(false)
        }
    );


    sendPrivateRoleAssignments();


    addLog(
        `🎮 Ván mới bắt đầu với ${count} người.`
    );


    startNight();
}


// ============================================================
// END GAME
// ============================================================

function endGame(
    winner
) {

    clearPhaseTimer();


    if (
        !room.started
    ) {

        return;
    }


    const finalPlayers =
        publicPlayers(
            true
        );


    const message =
        winner === "Sói"

            ? "🐺 PHE SÓI CHIẾN THẮNG!"

            : "🏆 PHE DÂN CHIẾN THẮNG!";


    io.emit(
        "gameEnded",
        {

            winner,

            message,

            players:
                finalPlayers
        }
    );


    /*
     * Sau game:
     *
     * - xóa role
     * - xóa logs
     * - xóa kết quả riêng của ván
     *
     * Nhưng KHÔNG đổi Host.
     *
     * Người đã là Host trước đó
     * vẫn là Host khi về lobby.
     */

    room.started =
        false;

    room.phase =
        "lobby";

    room.epoch += 1;


    room.logs =
        [];

    room.roleComposition =
        [];


    room.dayVotes.clear();

    room.night =
        null;

    room.nightNumber =
        0;


    room.hunterQueue =
        [];

    room.resolvingHunters =
        false;

    room.hunterResolver =
        null;


    room.players.forEach(
        player => {

            player.role =
                null;

            player.alive =
                true;

            player.deathReasons =
                [];

            player.loverId =
                null;

            player.used =
                {};

            player.witchSaveAvailable =
                false;

            player.witchPoisonAvailable =
                false;

            player._hunterPending =
                false;
        }
    );


    broadcastRoom();
}


// ============================================================
// LEAVE ROOM
// ============================================================

function removePlayer(
    socket
) {

    const player =
        getPlayer(
            socket.id
        );


    if (!player) {
        return;
    }


    const wasHost =
        player.id === room.hostId;


    // ========================================================
    // ĐANG TRONG VÁN
    // ========================================================

    if (
        room.started
    ) {

        /*
         * QUAN TRỌNG:
         *
         * Host thoát trong ván:
         * - vẫn giữ Host
         * - không chuyển Host
         * - không cho người khác lên Host
         *
         * Player vẫn được giữ trong room để
         * giữ vai trò và quyền Host.
         */

        if (
            player.alive
        ) {

            player.alive =
                false;

            player.deathReasons = [

                ...(player.deathReasons || []),

                wasHost
                    ? "🚪 Host rời game"
                    : "🚪 Rời game"
            ];
        }


        player.connected =
            false;


        addLog(

            wasHost

                ? `🚪 ${player.name} (Host) đã rời game.`

                : `🚪 ${player.name} đã rời game.`
        );


        /*
         * Không xóa player.
         * Không đổi room.hostId.
         */


        const winner =
            getWinner();


        if (winner) {

            endGame(
                winner
            );

            return;
        }


        socket.emit(
            "leftRoom"
        );


        broadcastRoom();

        return;
    }


    // ========================================================
    // LOBBY
    // ========================================================

    const index =
        room.players.findIndex(
            player =>
                player.id === socket.id
        );


    if (
        index === -1
    ) {

        return;
    }


    room.players.splice(
        index,
        1
    );


    /*
     * Chỉ Lobby mới đổi Host.
     */

    if (
        wasHost
    ) {

        room.hostId =
            room.players[0]?.id ||
            null;
    }


    if (
        room.players.length === 0
    ) {

        room.started =
            false;

        room.phase =
            "lobby";

        room.nightNumber =
            0;

        room.hostId =
            null;

        room.logs =
            [];

        room.roleComposition =
            [];

        room.dayVotes.clear();

        room.night =
            null;

        clearPhaseTimer();

        room.epoch += 1;
    }


    socket.emit(
        "leftRoom"
    );


    broadcastRoom();
}


// ============================================================
// SOCKET CONNECTION
// ============================================================

io.on(
    "connection",
    socket => {

        console.log(
            "✅ Connect:",
            socket.id
        );


        // ====================================================
        // ENTER
        // ====================================================

        socket.on(
            "enterGame",
            ({
                name,
                deviceId
            } = {}) => {

                /*
                 * Game đang diễn ra:
                 * Người mới không được vào.
                 */

                if (
                    room.started
                ) {

                    socket.emit(
                        "gameInProgress",
                        {
                            message:
                                "⚠️ Phòng đang trong ván game…"
                        }
                    );

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


                const duplicateName =
                    room.players.some(
                        player =>

                            player.name
                                .toLowerCase() ===
                            cleanName
                                .toLowerCase()
                    );


                if (
                    duplicateName
                ) {

                    socket.emit(
                        "enterError",
                        {
                            message:
                                "Tên này đã có người dùng."
                        }
                    );

                    return;
                }


                if (
                    room.players.length >= 15
                ) {

                    socket.emit(
                        "enterError",
                        {
                            message:
                                "⚠️ Phòng đã đủ 15 người."
                        }
                    );

                    return;
                }


                const player = {

                    id:
                        socket.id,

                    name:
                        cleanName,

                    deviceId:
                        String(
                            deviceId || ""
                        ).slice(
                            0,
                            120
                        ),

                    alive:
                        true,

                    connected:
                        true,

                    role:
                        null,

                    deathReasons:
                        [],

                    loverId:
                        null,

                    used:
                        {},

                    witchSaveAvailable:
                        false,

                    witchPoisonAvailable:
                        false,

                    _hunterPending:
                        false
                };


                /*
                 * Người đầu tiên = Host
                 */

                if (
                    !room.hostId
                ) {

                    room.hostId =
                        player.id;
                }


                room.players.push(
                    player
                );


                /*
                 * DỮ LIỆU NÀY PHẢI KHỚP HTML
                 *
                 * HTML đọc:
                 *
                 * data.me.id
                 * data.me.name
                 * data.me.isHost
                 */

                socket.emit(
                    "enteredGame",
                    {

                        me: {

                            id:
                                player.id,

                            name:
                                player.name,

                            isHost:
                                player.id ===
                                room.hostId
                        },

                        room:
                            publicRoom(),

                        players:
                            publicPlayers(false)
                    }
                );


                broadcastRoom();


                console.log(
                    `👤 ${player.name} vào phòng`
                );
            }
        );


        // ====================================================
        // START GAME
        // ====================================================

        socket.on(
            "startGame",
            () => {

                startGame(
                    socket
                );
            }
        );


        // ====================================================
        // WOLF
        // ====================================================

        socket.on(
            "wolfKill",
            ({
                targetId
            } = {}) => {

                const player =
                    getPlayer(
                        socket.id
                    );


                if (
                    !playerCanAct(
                        player,
                        "Sói"
                    )
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "🐺 Bạn không thể chọn mục tiêu lúc này."
                        }
                    );

                    return;
                }


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !target ||
                    !target.alive ||
                    target.id === player.id
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "🎯 Mục tiêu không hợp lệ."
                        }
                    );

                    return;
                }


                /*
                 * Vote Sói có thể đổi liên tục.
                 * Chỉ giữ lựa chọn mới nhất.
                 */

                room.night.wolfVotes.set(
                    player.id,
                    target.id
                );


                socket.emit(
                    "actionAccepted",
                    {
                        action:
                            "wolfKill"
                    }
                );
            }
        );


        // ====================================================
        // SEER
        // ====================================================

        socket.on(
            "seerInspect",
            ({
                targetId
            } = {}) => {

                const player =
                    getPlayer(
                        socket.id
                    );


                if (
                    !playerCanAct(
                        player,
                        "Tiên tri"
                    ) ||
                    player.used.seer
                ) {

                    socket.emit(
                        "seerError",
                        {
                            message:
                                "🔮 Bạn không thể soi lúc này."
                        }
                    );

                    return;
                }


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !target ||
                    !target.alive ||
                    target.id === player.id
                ) {

                    socket.emit(
                        "seerError",
                        {
                            message:
                                "🎯 Mục tiêu không hợp lệ."
                        }
                    );

                    return;
                }


                player.used.seer =
                    true;


                let result =
                    "❓ Không rõ";


                if (
                    target.role === "Sói"
                ) {

                    result =
                        "🐺 Ma Sói";

                } else if (
                    target.role === "Dân làng"
                ) {

                    result =
                        "👨‍🌾 Dân làng";
                }


                socket.emit(
                    "seerResult",
                    {

                        targetName:
                            target.name,

                        result
                    }
                );
            }
        );


        // ====================================================
        // GUARD
        // ====================================================

        socket.on(
            "guardProtect",
            ({
                targetId
            } = {}) => {

                const player =
                    getPlayer(
                        socket.id
                    );


                if (
                    !playerCanAct(
                        player,
                        "Bảo vệ"
                    ) ||
                    player.used.guard
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "🛡️ Bạn không thể bảo vệ lúc này."
                        }
                    );

                    return;
                }


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !target ||
                    !target.alive
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "🎯 Mục tiêu không hợp lệ."
                        }
                    );

                    return;
                }


                player.used.guard =
                    true;


                room.night.guardTarget =
                    target.id;


                socket.emit(
                    "actionAccepted",
                    {
                        action:
                            "guardProtect"
                    }
                );
            }
        );


        // ====================================================
        // WITCH SAVE
        // ====================================================

        socket.on(
            "witchSave",
            () => {

                const player =
                    getPlayer(
                        socket.id
                    );


                if (
                    !playerCanAct(
                        player,
                        "Phù thủy"
                    ) ||
                    !player.witchSaveAvailable
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "❤️ Bạn không còn bình cứu."
                        }
                    );

                    return;
                }


                player.witchSaveAvailable =
                    false;


                room.night.witchSave =
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


        // ====================================================
        // WITCH POISON
        // ====================================================

        socket.on(
            "witchPoison",
            ({
                targetId
            } = {}) => {

                const player =
                    getPlayer(
                        socket.id
                    );


                if (
                    !playerCanAct(
                        player,
                        "Phù thủy"
                    ) ||
                    !player.witchPoisonAvailable
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "🧪 Bạn không còn bình độc."
                        }
                    );

                    return;
                }


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !target ||
                    !target.alive ||
                    target.id === player.id
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "🎯 Mục tiêu không hợp lệ."
                        }
                    );

                    return;
                }


                player.witchPoisonAvailable =
                    false;


                room.night.witchPoisonTarget =
                    target.id;


                socket.emit(
                    "actionAccepted",
                    {
                        action:
                            "witchPoison"
                    }
                );
            }
        );


        // ====================================================
        // CUPID
        // ====================================================

        socket.on(
            "cupidLink",
            ({
                firstId,
                secondId
            } = {}) => {

                const cupid =
                    getPlayer(
                        socket.id
                    );


                if (
                    !playerCanAct(
                        cupid,
                        "Cupid"
                    ) ||
                    room.nightNumber !== 1 ||
                    cupid.used.cupid
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "💘 Cupid chỉ được ghép đôi một lần ở đêm đầu."
                        }
                    );

                    return;
                }


                if (
                    !firstId ||
                    !secondId ||
                    firstId === secondId
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "💘 Hãy chọn 2 người khác nhau."
                        }
                    );

                    return;
                }


                const first =
                    getPlayer(
                        firstId
                    );

                const second =
                    getPlayer(
                        secondId
                    );


                if (
                    !first ||
                    !second ||
                    !first.alive ||
                    !second.alive
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "💘 Người được chọn không hợp lệ."
                        }
                    );

                    return;
                }


                if (
                    first.loverId ||
                    second.loverId
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "💘 Một trong hai người đã có người yêu."
                        }
                    );

                    return;
                }


                first.loverId =
                    second.id;


                second.loverId =
                    first.id;


                cupid.used.cupid =
                    true;


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


                socket.emit(
                    "actionAccepted",
                    {
                        action:
                            "cupidLink"
                    }
                );


                addLog(
                    "💘 Cupid đã ghép một đôi tình nhân."
                );
            }
        );


        // ====================================================
        // HUNTER
        // ====================================================

        socket.on(
            "hunterShoot",
            ({
                targetId
            } = {}) => {

                handleHunterShoot(
                    socket,
                    targetId
                );
            }
        );


        // ====================================================
        // DAY VOTE
        // ====================================================

        socket.on(
            "dayVote",
            ({
                targetId,
                choice
            } = {}) => {

                /*
                 * Chỉ nhận vote trong 30 giây.
                 */

                if (
                    room.phase !==
                    "dayVote"
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "🗳️ Chưa đến thời gian biểu quyết."
                        }
                    );

                    return;
                }


                const voter =
                    getPlayer(
                        socket.id
                    );


                if (
                    !voter ||
                    !voter.alive
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "☠️ Bạn không thể vote."
                        }
                    );

                    return;
                }


                const target =
                    getPlayer(
                        targetId
                    );


                if (
                    !target ||
                    !target.alive
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "🎯 Người chơi này không còn sống."
                        }
                    );

                    return;
                }


                /*
                 * Không tự vote.
                 */

                if (
                    target.id === voter.id
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "⚠️ Bạn không thể tự biểu quyết chính mình."
                        }
                    );

                    return;
                }


                /*
                 * Choice hiện tại là "kill".
                 * Server vẫn kiểm tra để HTML
                 * có thể gửi choice.
                 */

                if (
                    choice &&
                    choice !== "kill"
                ) {

                    socket.emit(
                        "actionError",
                        {
                            message:
                                "Lựa chọn vote không hợp lệ."
                        }
                    );

                    return;
                }


                /*
                 * CỰC KỲ QUAN TRỌNG:
                 *
                 * set() sẽ GHI ĐÈ vote cũ.
                 *
                 * B -> C
                 * B -> A
                 * B -> C
                 *
                 * Cuối cùng chỉ có C.
                 */

                room.dayVotes.set(
                    voter.id,
                    target.id
                );


                /*
                 * Không broadcast
                 * cho người khác.
                 *
                 * Chỉ người vote nhận lại.
                 */

                socket.emit(
                    "dayVoteAccepted",
                    {
                        targetId:
                            target.id
                    }
                );
            }
        );


        // ====================================================
        // CHAT
        // ====================================================

        socket.on(
            "chatMessage",
            ({
                message
            } = {}) => {

                const player =
                    getPlayer(
                        socket.id
                    );


                if (
                    !player ||
                    !room.started
                ) {

                    socket.emit(
                        "chatError",
                        {
                            message:
                                "Bạn không thể chat lúc này."
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


                // ------------------------------------------------
                // DEAD CHAT
                // ------------------------------------------------

                if (
                    !player.alive
                ) {

                    const payload = {

                        channel:
                            "dead",

                        playerName:
                            player.name,

                        message:
                            text,

                        time:
                            Date.now()
                    };


                    room.players
                        .filter(
                            other =>
                                !other.alive
                        )
                        .forEach(
                            deadPlayer => {

                                io.to(
                                    deadPlayer.id
                                ).emit(
                                    "chatMessage",
                                    payload
                                );
                            }
                        );


                    return;
                }


                // ------------------------------------------------
                // WOLF CHAT
                // ------------------------------------------------

                if (

                    room.phase ===
                        "night" &&

                    player.role ===
                        "Sói"

                ) {

                    const payload = {

                        channel:
                            "wolf",

                        playerName:
                            player.name,

                        message:
                            text,

                        time:
                            Date.now()
                    };


                    livingWolves()
                        .forEach(
                            wolf => {

                                io.to(
                                    wolf.id
                                ).emit(
                                    "chatMessage",
                                    payload
                                );
                            }
                        );


                    return;
                }


                // ------------------------------------------------
                // DAY CHAT
                // ------------------------------------------------

                if (

                    room.phase ===
                        "daySpeech" ||

                    room.phase ===
                        "dayVote"

                ) {

                    const payload = {

                        channel:
                            "day",

                        playerName:
                            player.name,

                        message:
                            text,

                        time:
                            Date.now()
                    };


                    livingPlayers()
                        .forEach(
                            living => {

                                io.to(
                                    living.id
                                ).emit(
                                    "chatMessage",
                                    payload
                                );
                            }
                        );


                    return;
                }


                socket.emit(
                    "chatError",
                    {
                        message:
                            "🌙 Ban đêm chỉ Sói mới được chat."
                    }
                );
            }
        );


        // ====================================================
        // LEAVE
        // ====================================================

        socket.on(
            "leaveRoom",
            () => {

                removePlayer(
                    socket
                );
            }
        );


        // ====================================================
        // DISCONNECT
        // ====================================================

        socket.on(
            "disconnect",
            reason => {

                console.log(
                    "❌ Disconnect:",
                    socket.id,
                    reason
                );


                const player =
                    getPlayer(
                        socket.id
                    );


                if (!player) {

                    return;
                }


                // ------------------------------------------------
                // LOBBY
                // ------------------------------------------------

                if (
                    !room.started
                ) {

                    const wasHost =
                        player.id ===
                        room.hostId;


                    room.players =
                        room.players.filter(
                            other =>
                                other.id !==
                                socket.id
                        );


                    /*
                     * Lobby:
                     * Host disconnect -> người đầu tiên còn lại
                     * thành Host.
                     */

                    if (
                        wasHost
                    ) {

                        room.hostId =
                            room.players[0]?.id ||
                            null;
                    }


                    if (
                        room.players.length === 0
                    ) {

                        room.hostId =
                            null;

                        room.logs =
                            [];

                        room.roleComposition =
                            [];

                        room.phase =
                            "lobby";

                        room.nightNumber =
                            0;
                    }


                    broadcastRoom();


                    return;
                }


                // ------------------------------------------------
                // GAME
                // ------------------------------------------------

                /*
                 * Đang trong ván:
                 *
                 * KHÔNG xóa player.
                 * KHÔNG đổi Host.
                 */

                player.connected =
                    false;


                broadcastRoom();
            }
        );
    }
);


// ============================================================
// START SERVER
// ============================================================

server.listen(
    PORT,
    () => {

        console.log(
            `🐺 Ma Sói Online đang chạy tại port ${PORT}`
        );
    }
);
