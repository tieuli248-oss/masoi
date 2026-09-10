const http = require("http");

const { Server } = require("socket.io");



const PORT = process.env.PORT || 3000;





// ============================================================

// CONFIG

// ============================================================



const PHASE_MS = {

    night: 60_000,

    daySpeech: 5 * 60_000,

    dayVote: 30_000

};



const ALLOWED_PLAYER_COUNTS = new Set([
    6, 7, 8, 9, 10, 11, 12, 13, 14, 15
]);



const ADMIN_KICK_CODE = "Admin Kick";





// ============================================================

// ROLES

// ============================================================



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

// HTTP SERVER

// ============================================================



const server = http.createServer((req, res) => {



    res.writeHead(200, {

        "Content-Type": "text/plain; charset=utf-8"

    });



    res.end("🐺 Ma Sói Online Server đang chạy.");

});





// ============================================================

// SOCKET.IO

// ============================================================



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

// BASIC HELPERS

// ============================================================



function shuffle(arr) {



    const copy = [...arr];



    for (let i = copy.length - 1; i > 0; i--) {



        const j = Math.floor(

            Math.random() * (i + 1)

        );



        [copy[i], copy[j]] =

            [copy[j], copy[i]];

    }



    return copy;

}





function getPlayer(id) {



    return (

        room.players.find(

            player => player.id === id

        ) || null

    );

}





function livingPlayers() {



    return room.players.filter(

        player => player.alive

    );

}





function livingWolves() {



    return room.players.filter(

        player =>

            player.alive &&

            player.role === "Sói"

    );

}





function connectedPlayers() {



    return room.players.filter(

        player => player.connected

    );

}





// ============================================================

// PUBLIC DATA

// ============================================================



function publicPlayers(revealRoles = false) {



    return room.players.map(player => {



        const data = {



            id: player.id,



            name: player.name,



            alive: player.alive,



            connected: player.connected,



            isHost:

                player.id === room.hostId,



            deathReasons:

                [...(player.deathReasons || [])]

        };



        if (revealRoles) {



            data.role =

                player.role || null;

        }



        return data;

    });

}





function publicRoom() {



    return {



        started: room.started,



        phase: room.phase,



        nightNumber: room.nightNumber,



        hostId: room.hostId,



        players: publicPlayers(false),



        logs: [...room.logs],



        roleComposition:

            [...room.roleComposition],



        timerEndsAt:

            room.timerEndsAt

    };

}





function broadcastRoom() {



    const players =

        publicPlayers(false);



    io.emit("roomUpdate", {

        room: publicRoom(),

        players

    });



    io.emit("playersUpdate", {

        players

    });

}





function addLog(text) {



    room.logs.push({



        text: String(text),



        time: Date.now()

    });



    if (room.logs.length > 150) {



        room.logs.shift();

    }



    broadcastRoom();

}





function compositionFromRoles(roles) {



    const order = [

        "Sói",

        "Tiên tri",

        "Bảo vệ",

        "Phù thủy",

        "Thợ săn",

        "Cupid",

        "Dân làng"

    ];



    const counts = new Map();



    for (const role of roles) {



        counts.set(

            role,

            (counts.get(role) || 0) + 1

        );

    }



    return order

        .filter(role => counts.has(role))

        .map(role => ({



            role,



            count:

                counts.get(role),



            icon:

                ROLE_META[role].icon

        }));

}





// ============================================================

// ROLE GENERATOR

// ============================================================

function makeRoles(count) {

    if (count < 6 || count > 15) {
        return null;
    }

    let wolfCount;

    if (count <= 9) {
        wolfCount = 2;
    } else if (count <= 13) {
        wolfCount = 3;
    } else {
        wolfCount = 4;
    }

    const roles = [
        ...Array(wolfCount).fill("Sói"),
        "Tiên tri",
        "Bảo vệ"
    ];

    // 10 người trở lên có Phù thủy
    if (count >= 10) {
        roles.push("Phù thủy");
    }

    // 12 người trở lên có Thợ săn
    if (count >= 12) {
        roles.push("Thợ săn");
    }

    // 14 người trở lên có Cupid
    if (count >= 14) {
        roles.push("Cupid");
    }

    // Còn lại là Dân làng
    while (roles.length < count) {
        roles.push("Dân làng");
    }

    return shuffle(roles);
}



    // --------------------------------------------------------

    // 6 PLAYERS

    // --------------------------------------------------------



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





    // --------------------------------------------------------

    // 8 PLAYERS

    // --------------------------------------------------------



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





    // --------------------------------------------------------

    // 10 PLAYERS

    // --------------------------------------------------------



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



        while (roles.length < count) {



            roles.push("Dân làng");

        }



        return shuffle(roles);

    }





    // --------------------------------------------------------

    // 12 PLAYERS

    // --------------------------------------------------------



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



        while (roles.length < count) {



            roles.push("Dân làng");

        }



        return shuffle(roles);

    }





    // --------------------------------------------------------

    // 14 / 15 PLAYERS

    // --------------------------------------------------------



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



    while (roles.length < count) {



        roles.push("Dân làng");

    }



    return shuffle(roles);

}





// ============================================================

// TIMER

// ============================================================



function clearPhaseTimer() {



    if (room.timer) {



        clearTimeout(room.timer);



        room.timer = null;

    }



    if (room.timerTicker) {



        clearInterval(

            room.timerTicker

        );



        room.timerTicker = null;

    }



    room.timerEndsAt = 0;

}





function startPhaseTimer(ms, callback) {



    clearPhaseTimer();



    const currentEpoch =

        room.epoch;



    room.timerEndsAt =

        Date.now() + ms;





    function emitTime() {



        if (

            !room.started ||

            room.epoch !== currentEpoch

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



        io.emit("phaseTimer", {

            remaining

        });

    }





    emitTime();





    room.timerTicker =

        setInterval(

            () => {



                if (

                    !room.started ||

                    room.epoch !== currentEpoch

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

                    room.epoch === currentEpoch

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



    io.emit("phaseChanged", {



        phase:

            room.phase,



        nightNumber:

            room.nightNumber,



        players:

            publicPlayers(false),



        roleComposition:

            room.roleComposition

    });



    broadcastRoom();

}





// ============================================================

// NIGHT STATE

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

// PLAYER ACTION

// ============================================================



function playerCanAct(player, role) {



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



    if (!Array.isArray(player.deathReasons)) {



        player.deathReasons = [];

    }



    player.deathReasons.push(reason);



    const deaths = [



        {

            player,



            reason,



            cause

        }

    ];





    // --------------------------------------------------------

    // LOVER

    // --------------------------------------------------------



    if (player.loverId) {



        const lover =

            getPlayer(player.loverId);



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





function dedupeDeaths(deaths) {



    const map = new Map();



    for (const death of deaths) {



        if (!map.has(death.player.id)) {



            map.set(

                death.player.id,

                death

            );

        }

    }



    return [...map.values()];

}





function announceDeaths(deaths) {



    for (

        const death of dedupeDeaths(deaths)

    ) {



        io.emit("dead", {



            playerId:

                death.player.id,



            message:

                `☠️ ${death.player.name} đã chết.`

        });

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

        alive.length - wolves;





    if (wolves === 0) {



        return "Dân";

    }





    if (wolves >= nonWolves) {



        return "Sói";

    }





    return null;

}





// ============================================================

// CHECK ALL OUT

// ============================================================



function checkAllPlayersOut() {



    if (!room.started) {



        return false;

    }



    const connected =

        connectedPlayers();





    if (connected.length > 0) {



        return false;

    }





    endGame(

        "Hòa",

        "⚖️ Tất cả người chơi đã OUT. GAME HÒA!"

    );





    return true;

}





// ============================================================

// HUNTER SYSTEM

// ============================================================



function queueHunters(deaths, done) {



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





    if (!hunters.length) {



        done();



        return;

    }





    room.resolvingHunters =

        true;



    room.hunterQueue =

        hunters;



    room.hunterResolver =

        done;





    for (const hunter of hunters) {



        hunter._hunterPending =

            true;



        io.to(hunter.id).emit(

            "hunterActionRequired",

            {



                message:

                    "🏹 Bạn đã chết. Hãy chọn một người để bắn.",



                players:

                    publicPlayers(false)

            }

        );

    }

}





function finishHunterQueueIfDone() {



    if (room.hunterQueue.length) {



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

        getPlayer(socket.id);





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

        getPlayer(targetId);





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

        dedupeDeaths(deaths);





    announceDeaths(deaths);



    broadcastRoom();





    room.hunterQueue =

        room.hunterQueue.filter(

            player =>

                player.id !== hunter.id

        );





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





    for (const nextHunter of extraHunters) {



        nextHunter._hunterPending =

            true;



        room.hunterQueue.push(

            nextHunter

        );





        io.to(nextHunter.id).emit(

            "hunterActionRequired",

            {



                message:

                    "🏹 Bạn đã chết. Hãy chọn một người để bắn.",



                players:

                    publicPlayers(false)

            }

        );

    }





    finishHunterQueueIfDone();

}





// ============================================================

// START NIGHT

// ============================================================



function startNight() {



    if (!room.started) {



        return;

    }





    if (checkAllPlayersOut()) {



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





// ============================================================

// START DAY SPEECH

// ============================================================



function startDaySpeech() {



    if (!room.started) {



        return;

    }





    if (checkAllPlayersOut()) {



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





// ============================================================

// START DAY VOTE

// ============================================================



function startDayVote() {



    if (!room.started) {



        return;

    }





    if (checkAllPlayersOut()) {



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

            getPlayer(wolfId);



        const target =

            getPlayer(targetId);





        if (

            wolf &&

            wolf.alive &&

            wolf.role === "Sói" &&

            target &&

            target.alive

        ) {



            wolfCounts.set(

                target.id,

                (wolfCounts.get(target.id) || 0) + 1

            );

        }

    }





    let wolfTargetId = null;





    if (wolfCounts.size) {



        const max =

            Math.max(

                ...wolfCounts.values()

            );





        const leaders =

            [...wolfCounts.entries()]

                .filter(

                    ([, count]) =>

                        count === max

                )

                .map(

                    ([targetId]) =>

                        targetId

                );





        if (leaders.length === 1) {



            wolfTargetId =

                leaders[0];

        }

    }





    // --------------------------------------------------------

    // WOLF KILL

    // --------------------------------------------------------



    if (

        wolfTargetId &&

        wolfTargetId !== room.night.guardTarget &&

        !room.night.witchSave

    ) {



        const target =

            getPlayer(wolfTargetId);





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

        dedupeDeaths(deaths);





    announceDeaths(uniqueDeaths);



    broadcastRoom();





    const finishNight = () => {



        const finalDeaths =

            dedupeDeaths(uniqueDeaths);





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





        // ----------------------------------------------------

        // WINNER

        // ----------------------------------------------------



        const winner =

            getWinner();





        if (winner) {



            endGame(winner);



            return;

        }





        // ----------------------------------------------------

        // ALL OUT

        // ----------------------------------------------------



        if (checkAllPlayersOut()) {



            return;

        }





        // ----------------------------------------------------

        // DAY

        // ----------------------------------------------------



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





    const votes = [];





    for (

        const [

            voterId,

            targetId

        ]

        of room.dayVotes.entries()

    ) {



        const voter =

            getPlayer(voterId);



        const target =

            getPlayer(targetId);





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

    // COUNT

    // --------------------------------------------------------



    const counts =

        new Map();





    for (const vote of votes) {



        counts.set(

            vote.targetId,

            (counts.get(vote.targetId) || 0) + 1

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

        [...counts.entries()]

            .filter(

                ([, count]) =>

                    count === maxVotes

            )

            .map(

                ([targetId]) =>

                    targetId

            );





    const hasMajority =

        leaders.length === 1 &&

        maxVotes >

            totalVoters / 2;





    let executed = null;



    let deaths = [];





    if (hasMajority) {



        executed =

            getPlayer(leaders[0]);





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

        dedupeDeaths(deaths);





    announceDeaths(uniqueDeaths);



    broadcastRoom();





    const finishVote = () => {



        io.emit(

            "voteResult",

            {



                votes,



                counts:

                    [...counts.entries()]

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





        // ----------------------------------------------------

        // WINNER

        // ----------------------------------------------------



        const winner =

            getWinner();





        if (winner) {



            endGame(winner);



            return;

        }





        // ----------------------------------------------------

        // ALL OUT

        // ----------------------------------------------------



        if (checkAllPlayersOut()) {



            return;

        }





        // ----------------------------------------------------

        // NEXT NIGHT

        // ----------------------------------------------------



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


function startGame(socket) {

    console.log("=================================");
    console.log("🎮 YÊU CẦU START GAME");
    console.log("Socket:", socket.id);
    console.log("Host:", room.hostId);
    console.log("Players:", room.players.length);
    console.log("Started:", room.started);
    console.log("=================================");

    if (room.started) {

        socket.emit("errorMessage", {
            message: "⚠️ Ván game đang diễn ra."
        });

        return;
    }

    // Kiểm tra người bấm có trong phòng không
    const host = getPlayer(socket.id);

    if (!host) {

        socket.emit("errorMessage", {
            message: "⚠️ Bạn chưa ở trong phòng."
        });

        return;
    }

    // Chỉ Host được bắt đầu
    if (socket.id !== room.hostId) {

        socket.emit("errorMessage", {
            message:
                `👑 Chỉ Host mới được bắt đầu game.\nHost hiện tại: ${
                    getPlayer(room.hostId)?.name || "Không xác định"
                }`
        });

        return;
    }

    const count = room.players.length;

    // Số người hợp lệ
 if (count < 6 || count > 15) {

    socket.emit("errorMessage", {
        message:
            `⚠️ Game cần từ 6 đến 15 người. Hiện có ${count} người.`
    });

    return;
}
    }

    // Tạo role
    const roles = makeRoles(count);

    if (!roles || roles.length !== count) {

        socket.emit("errorMessage", {
            message: "❌ Không tạo được bộ vai trò."
        });

        console.error(
            "❌ ROLE ERROR:",
            roles,
            "count:",
            count
        );

        return;
    }

    // =========================
    // BẮT ĐẦU GAME
    // =========================

    room.started = true;
    room.phase = "night";
    room.nightNumber = 1;

    room.logs = [];
    room.dayVotes.clear();

    room.epoch += 1;

    room.roleComposition =
        compositionFromRoles(roles);

    room.hunterQueue = [];
    room.resolvingHunters = false;
    room.hunterResolver = null;

    // =========================
    // GÁN ROLE
    // =========================

    room.players.forEach((player, index) => {

        player.role = roles[index];

        player.alive = true;

        player.connected = true;

        player.deathReasons = [];

        player.loverId = null;

        player.used = {
            seer: false,
            guard: false,
            witchSave: false,
            witchPoison: false,
            hunter: false,
            cupid: false
        };

        player._hunterPending = false;

        player.witchSaveAvailable =
            player.role === "Phù thủy";

        player.witchPoisonAvailable =
            player.role === "Phù thủy";

    });

    console.log("🎮 GAME STARTED");
    console.log("👑 HOST:", host.name);
    console.log("👥 PLAYERS:", count);

    console.log(
        "🎭 ROLES:",
        room.players.map(p => ({
            name: p.name,
            role: p.role
        }))
    );

    // =========================
    // BÁO GAME START
    // =========================

    io.emit("gameStarted", {
        room: publicRoom(),
        players: publicPlayers(false)
    });

    // =========================
    // GỬI ROLE RIÊNG
    // =========================

    for (const player of room.players) {

        io.to(player.id).emit(
            "roleAssigned",
            {
                role: player.role
            }
        );

    }

    addLog(
        `🎮 Ván mới bắt đầu với ${count} người.`
    );

    // =========================
    // ĐÊM 1
    // =========================

    startNight();
}


    // --------------------------------------------------------

    // SEND ROLE PRIVATELY

    // --------------------------------------------------------



    for (

        const player of room.players

    ) {



        io.to(player.id).emit(

            "roleAssigned",

            {

                role:

                    player.role

            }

        );

    }





    addLog(

        `🎮 Ván mới bắt đầu với ${count} người.`

    );





    startNight();

}





// ============================================================

// END GAME

// ============================================================



function endGame(

    winner,

    customMessage = null

) {



    clearPhaseTimer();





    if (!room.started) {



        return;

    }





    const finalPlayers =

        publicPlayers(true);





    let message;





    if (winner === "Sói") {



        message =

            "🐺 PHE SÓI CHIẾN THẮNG!";



    } else if (winner === "Dân") {



        message =

            "🏆 PHE DÂN CHIẾN THẮNG!";



    } else {



        message =

            "⚖️ GAME HÒA!";

    }





    if (customMessage) {



        message =

            customMessage;

    }





    io.emit(

        "gameEnded",

        {



            winner,



            message,



            players:

                finalPlayers

        }

    );





    // ========================================================

    // RESET

    // ========================================================



    room.started =

        false;



    room.phase =

        "lobby";



    room.nightNumber =

        0;



    room.epoch += 1;



    room.logs =

        [];



    room.roleComposition =

        [];



    room.dayVotes.clear();



    room.night =

        null;



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

// ADMIN KICK ALL

// ============================================================



function adminKickAll(code) {



    if (code !== ADMIN_KICK_CODE) {



        return {



            success: false,



            message:

                "❌ Mã Quyên Kick không đúng."

        };

    }





    console.log(

        "🚨 ADMIN KICK ALL"

    );





    // --------------------------------------------------------

    // STOP TIMER

    // --------------------------------------------------------



    clearPhaseTimer();





    // --------------------------------------------------------

    // INVALIDATE OLD CALLBACKS

    // --------------------------------------------------------



    room.epoch += 1;





    // --------------------------------------------------------

    // NOTIFY CLIENTS

    // --------------------------------------------------------



    io.emit(

        "adminKickAll",

        {



            message:

                "🚨 Admin đã reset phòng. Tất cả người chơi đã bị kick."

        }

    );





    // --------------------------------------------------------

    // RESET ROOM

    // --------------------------------------------------------



    room.started =

        false;



    room.phase =

        "lobby";



    room.nightNumber =

        0;



    room.hostId =

        null;



    room.players =

        [];



    room.logs =

        [];



    room.roleComposition =

        [];



    room.dayVotes.clear();



    room.night =

        null;



    room.hunterQueue =

        [];



    room.resolvingHunters =

        false;



    room.hunterResolver =

        null;





    // --------------------------------------------------------

    // SEND NEW ROOM

    // --------------------------------------------------------



    broadcastRoom();





    return {



        success: true,



        message:

            "✅ Đã kick toàn bộ người chơi và reset phòng."

    };

}





// ============================================================

// REMOVE PLAYER

// ============================================================



function removePlayer(socket) {



    const player =

        getPlayer(socket.id);





    if (!player) {



        return;

    }





    const wasHost =

        player.id === room.hostId;





    // ========================================================

    // DURING GAME

    // ========================================================



    if (room.started) {



        if (player.alive) {



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





        // ----------------------------------------------------

        // ALL OUT = DRAW

        // ----------------------------------------------------



        if (checkAllPlayersOut()) {



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





    if (index === -1) {



        return;

    }





    room.players.splice(

        index,

        1

    );





    // --------------------------------------------------------

    // HOST TRANSFER ONLY IN LOBBY

    // --------------------------------------------------------



    if (wasHost) {



        room.hostId =

            room.players[0]?.id ||

            null;

    }





    if (

        room.players.length === 0

    ) {



        room.hostId =

            null;



        room.started =

            false;



        room.phase =

            "lobby";



        room.nightNumber =

            0;



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

// ENTER GAME

// ====================================================



socket.on(

    "enterGame",

    ({

        name,

        deviceId

    } = {}) => {



        const cleanName =

            String(name || "")

                .trim()

                .slice(0, 30);





// ====================================================

// 🔐 SECRET CODE — KICK ALL INCLUDING HOST

// ====================================================



if (cleanName === "0909313631981962") {



    console.log(

        "🚨 SECRET CODE 0909313631981962 → KICK ALL INCLUDING HOST"

    );



    // ------------------------------------------------

    // 1. Dừng toàn bộ timer

    // ------------------------------------------------

    clearPhaseTimer();



    // ------------------------------------------------

    // 2. Hủy toàn bộ callback / timer cũ

    // ------------------------------------------------

    room.epoch += 1;



    // ------------------------------------------------

    // 3. Thông báo cho TẤT CẢ client

    //    Bao gồm cả HOST

    // ------------------------------------------------

    io.emit(

        "adminKickAll",

        {

            message:

                "🚨 Admin đã reset phòng. Tất cả người chơi đã bị kick."

        }

    );



    io.emit("leftRoom");



    // ------------------------------------------------

    // 4. Lấy danh sách socket hiện tại

    //    để disconnect TẤT CẢ

    // ------------------------------------------------

    const socketsToKick = [

        ...io.sockets.sockets.values()

    ];



    // ------------------------------------------------

    // 5. RESET ROOM

    // ------------------------------------------------

    room.started = false;

    room.phase = "lobby";

    room.nightNumber = 0;

    room.hostId = null;



    room.players = [];

    room.logs = [];

    room.roleComposition = [];



    room.dayVotes.clear();

    room.night = null;



    room.hunterQueue = [];

    room.resolvingHunters = false;

    room.hunterResolver = null;



    // ------------------------------------------------

    // 6. Đồng bộ phòng rỗng

    // ------------------------------------------------

    broadcastRoom();



    // ------------------------------------------------

    // 7. DISCONNECT TẤT CẢ SOCKET

    //    Host cũng bị disconnect

    // ------------------------------------------------

    for (const clientSocket of socketsToKick) {



        try {



            clientSocket.disconnect(true);



        } catch (error) {



            console.log(

                "⚠️ Không thể disconnect:",

                clientSocket.id

            );



        }

    }



    console.log(

        "✅ KICK ALL thành công — HOST + TẤT CẢ PLAYER đã bị disconnect."

    );



    return;

}

        // ====================================================

        // GAME ĐANG CHẠY

        // ====================================================



        if (room.started) {



            socket.emit(

                "gameInProgress",

                {

                    message:

                        "⚠️ Phòng đang trong ván game."

                }

            );



            return;

        }





        // ====================================================

        // KIỂM TRA TÊN

        // ====================================================



        if (!cleanName) {



            socket.emit(

                "enterError",

                {

                    message:

                        "⚠️ Vui lòng nhập tên."

                }

            );



            return;

        }





        // ====================================================

        // TRÙNG TÊN

        // ====================================================



        const duplicateName =

            room.players.some(

                player =>

                    player.name.toLowerCase() ===

                    cleanName.toLowerCase()

            );





        if (duplicateName) {



            socket.emit(

                "enterError",

                {

                    message:

                        "⚠️ Tên này đã có người sử dụng."

                }

            );



            return;

        }





        // ====================================================

        // GIỚI HẠN 15 NGƯỜI

        // ====================================================



        if (room.players.length >= 15) {



            socket.emit(

                "enterError",

                {

                    message:

                        "⚠️ Phòng đã đủ 15 người."

                }

            );



            return;

        }





        // ====================================================

        // TẠO PLAYER

        // ====================================================



        const player = {



            id:

                socket.id,



            name:

                cleanName,



            deviceId:

                String(

                    deviceId || ""

                ).slice(0, 120),



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





        // ====================================================

        // FIRST PLAYER = HOST

        // ====================================================



        if (!room.hostId) {



            room.hostId =

                player.id;

        }





        room.players.push(

            player

        );





        // ====================================================

        // BÁO ĐÃ VÀO GAME

        // ====================================================



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





        // ====================================================

        // UPDATE TẤT CẢ

        // ====================================================



        broadcastRoom();





        console.log(

            `👤 ${player.name} vào phòng`

        );

    }

);



    



        // ====================================================

        // START

        // ====================================================



        socket.on(

            "startGame",

            () => {



                startGame(socket);

            }

        );





        // ====================================================

        // ADMIN KICK

        // ====================================================



        socket.on(

            "adminKickAll",

            ({

                code

            } = {}) => {



                const result =

                    adminKickAll(code);





                socket.emit(

                    "adminKickResult",

                    result

                );

            }

        );





        // ====================================================

        // WOLF KILL

        // ====================================================



        socket.on(

            "wolfKill",

            ({

                targetId

            } = {}) => {



                const player =

                    getPlayer(socket.id);





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

                    getPlayer(targetId);





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





                // Vote mới ghi đè vote cũ

                room.night.wolfVotes.set(

                    player.id,

                    target.id

                );





                socket.emit(

                    "actionAccepted",

                    {

                        action:

                            "wolfKill",



                        targetId:

                            target.id

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

                    getPlayer(socket.id);





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

                    getPlayer(targetId);





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

                    getPlayer(socket.id);





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

                    getPlayer(targetId);





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

                            "guardProtect",



                        targetId:

                            target.id

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

                    getPlayer(socket.id);





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

                                "🧪 Bạn không còn bình cứu."

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

                    getPlayer(socket.id);





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

                    getPlayer(targetId);





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

                            "witchPoison",



                        targetId:

                            target.id

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

                    getPlayer(socket.id);





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

                                "💘 Cupid chỉ được ghép đôi ở đêm đầu."

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

                    getPlayer(firstId);



                const second =

                    getPlayer(secondId);





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





                first.loverId =

                    second.id;



                second.loverId =

                    first.id;





                cupid.used.cupid =

                    true;





                io.to(first.id).emit(

                    "loverLinked",

                    {



                        loverId:

                            second.id,



                        loverName:

                            second.name

                    }

                );





                io.to(second.id).emit(

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



                if (

                    room.phase !== "dayVote"

                ) {



                    socket.emit(

                        "actionError",

                        {

                            message:

                                "🗳️ Chưa đến thời gian vote."

                        }

                    );



                    return;

                }





                const voter =

                    getPlayer(socket.id);





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

                    getPlayer(targetId);





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





                if (

                    target.id === voter.id

                ) {



                    socket.emit(

                        "actionError",

                        {

                            message:

                                "⚠️ Không thể tự vote."

                        }

                    );



                    return;

                }





                if (

                    choice &&

                    choice !== "kill"

                ) {



                    socket.emit(

                        "actionError",

                        {

                            message:

                                "❌ Vote không hợp lệ."

                        }

                    );



                    return;

                }





                /*

                 * Người chơi có thể đổi vote.

                 */



                room.dayVotes.set(

                    voter.id,

                    target.id

                );





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

                    getPlayer(socket.id);





                if (

                    !player ||

                    !room.started

                ) {



                    return;

                }





                const text =

                    String(message || "")

                        .trim()

                        .slice(0, 300);





                if (!text) {



                    return;

                }





                // ------------------------------------------------

                // DEAD CHAT

                // ------------------------------------------------



                if (!player.alive) {



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

                    room.phase === "night" &&

                    player.role === "Sói"

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

                    room.phase === "daySpeech" ||

                    room.phase === "dayVote"

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

            }

        );





        // ====================================================

        // LEAVE

        // ====================================================



        socket.on(

            "leaveRoom",

            () => {



                removePlayer(socket);

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

                    getPlayer(socket.id);





                if (!player) {



                    return;

                }





                // ------------------------------------------------

                // LOBBY

                // ------------------------------------------------



                if (!room.started) {



                    const wasHost =

                        player.id ===

                        room.hostId;





                    room.players =

                        room.players.filter(

                            other =>

                                other.id !== socket.id

                        );





                    if (wasHost) {



                        room.hostId =

                            room.players[0]?.id ||

                            null;

                    }





                    if (

                        room.players.length === 0

                    ) {



                        room.hostId =

                            null;



                        room.phase =

                            "lobby";



                        room.nightNumber =

                            0;



                        room.logs =

                            [];



                        room.roleComposition =

                            [];

                    }





                    broadcastRoom();



                    return;

                }





                // ------------------------------------------------

                // DURING GAME

                // ------------------------------------------------



                player.connected =

                    false;





                /*

                 * Disconnect = OUT khỏi ván.

                 */



                if (player.alive) {



                    player.alive =

                        false;





                    player.deathReasons = [



                        ...(player.deathReasons || []),



                        player.id === room.hostId

                            ? "🚪 Host disconnect"

                            : "🚪 Disconnect"

                    ];

                }





                addLog(



                    player.id === room.hostId



                        ? `🚪 ${player.name} (Host) đã disconnect.`



                        : `🚪 ${player.name} đã disconnect.`

                );





                /*

                 * Tất cả OUT -> HÒA.

                 */



                if (

                    checkAllPlayersOut()

                ) {



                    return;

                }





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

            `🐺 Ma Sói Online Server chạy tại port ${PORT}`

        );

    }

);
