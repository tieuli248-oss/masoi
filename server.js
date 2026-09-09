const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;


/* =========================================================
   SERVER STATUS
========================================================= */

app.get("/", (req, res) => {
    res.send("🐺 MA SÓI SERVER ONLINE!");
});


/* =========================================================
   DATA
========================================================= */

const rooms = new Map();

const ROOM_NAMES = [
    "Làng Trăng Máu",
    "Làng Trăng Tím",
    "Làng Rừng Sương",
    "Làng Huyết Nguyệt",
    "Làng Đêm Sương",
    "Làng Bí Ẩn",
    "Làng Sói Đêm",
    "Làng Miller",
    "Làng Ánh Trăng",
    "Làng Bóng Tối",
    "Làng Sương Mù",
    "Làng Hoang Vắng",
    "Làng Đêm Đen",
    "Làng Nguyệt Thực",
    "Làng Hoa Máu"
];


/* =========================================================
   UTILITY
========================================================= */

function randomRoomName() {

    return ROOM_NAMES[
        Math.floor(Math.random() * ROOM_NAMES.length)
    ];
}


function createRoomCode() {

    let code;

    do {

        code =
            Math.random()
                .toString(36)
                .substring(2, 8)
                .toUpperCase();

    } while (rooms.has(code));

    return code;
}


function shuffle(array) {

    const arr = [...array];

    for (
        let i = arr.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(Math.random() * (i + 1));

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


function getRoom(socket) {

    const code = socket.data.room;

    if (!code) return null;

    return rooms.get(code) || null;
}


function getPlayer(room, id) {

    if (!room) return null;

    return room.players.get(id) || null;
}


function getAlivePlayers(room) {

    return Array.from(room.players.values())
        .filter(player => player.alive);
}


function getAliveWolves(room) {

    return getAlivePlayers(room)
        .filter(player => player.role === "wolf");
}


function getAliveVillagers(room) {

    return getAlivePlayers(room)
        .filter(player => player.role !== "wolf");
}


/* =========================================================
   PUBLIC PLAYER DATA
   Không gửi role trong lúc game đang chạy
========================================================= */

function getPublicPlayers(room) {

    const ended =
        room.phase === "ended";

    return Array.from(room.players.values())
        .map(player => {

            const result = {
                id: player.id,
                name: player.name,
                alive: player.alive
            };

            if (ended) {
                result.role = player.role;
            }

            return result;
        });
}


/* =========================================================
   PUBLIC ROOM STATE
========================================================= */

function getRoomState(room) {

    return {
        code: room.code,
        name: room.name,

        hostId: room.host,

        maxPlayers: room.maxPlayers,

        phase: room.phase,

        step: room.step,

        nightNumber: room.nightNumber,

        players: getPublicPlayers(room),

        deaths: room.deaths,

        logs: room.logs,

        votes: getVoteCounts(room),

        winner: room.winner || null
    };
}


function emitRoomState(room) {

    io.to(room.code)
        .emit(
            "roomState",
            getRoomState(room)
        );
}


function addLog(room, message) {

    room.logs.push(message);

    if (room.logs.length > 100) {
        room.logs.shift();
    }

    emitRoomState(room);
}


/* =========================================================
   VOTE COUNTS
========================================================= */

function getVoteCounts(room) {

    const counts = {};

    for (const targetId of room.votes.values()) {

        counts[targetId] =
            (counts[targetId] || 0) + 1;
    }

    return counts;
}


/* =========================================================
   ROLE GENERATION
========================================================= */

function generateRoles(count) {

    const roles = [];

    /*
       Sói
       6 người -> 2 Sói
       8 người -> 2 Sói
       12 người -> 3 Sói
    */

    const wolfCount =
        Math.max(
            2,
            Math.floor(count / 4)
        );


    for (
        let i = 0;
        i < wolfCount;
        i++
    ) {

        roles.push("wolf");
    }


    /*
       Tiên Tri
    */

    if (count >= 6) {

        roles.push("seer");
    }


    /*
       Phù Thủy
    */

    if (count >= 6) {

        roles.push("witch");
    }


    /*
       Thợ Săn
    */

    if (count >= 8) {

        roles.push("hunter");
    }


    /*
       Dân Làng
    */

    while (roles.length < count) {

        roles.push("villager");
    }


    return shuffle(roles);
}


/* =========================================================
   SEND ROLES
========================================================= */

function assignRoles(room) {

    const players =
        Array.from(room.players.values());

    const roles =
        generateRoles(players.length);

    players.forEach((player, index) => {

        player.role =
            roles[index];

        player.alive = true;

        player.witchSaveUsed = false;
        player.witchKillUsed = false;
    });


    /*
       Gửi vai trò riêng cho từng người
    */

    players.forEach(player => {

        io.to(player.id)
            .emit("roleAssigned", {
                role: player.role
            });
    });


    /*
       Gửi danh sách Sói cho Sói
    */

    const wolves =
        players.filter(
            player =>
                player.role === "wolf"
        );


    const wolfData =
        wolves.map(player => ({
            id: player.id,
            name: player.name
        }));


    wolves.forEach(wolf => {

        io.to(wolf.id)
            .emit("wolfTeam", {
                players: wolfData
            });
    });
}


/* =========================================================
   START NIGHT
========================================================= */

function startNight(room) {

    room.phase = "night";

    room.step = "wolf";

    room.nightNumber =
        room.nightNumber || 1;

    room.wolfTarget = null;

    room.seerTarget = null;

    room.witchTarget = null;

    room.witchSave = false;

    room.witchKillTarget = null;

    room.hunterTarget = null;

    room.votes.clear();

    emitRoomState(room);

    addLog(
        room,
        `🌙 Đêm ${room.nightNumber} bắt đầu.`
    );
}


/* =========================================================
   START WOLF STEP
========================================================= */

function startWolfStep(room) {

    room.step = "wolf";

    room.wolfTarget = null;

    emitRoomState(room);
}


/* =========================================================
   WOLF ACTION
========================================================= */

io.on("connection", socket => {

    console.log(
        "🟢 Người chơi kết nối:",
        socket.id
    );


    /* =====================================================
       CREATE ROOM
    ===================================================== */

    socket.on(
        "createRoom",
        ({ name, maxPlayers }) => {

            if (!name || !name.trim()) {

                socket.emit(
                    "errorMessage",
                    "Vui lòng nhập tên!"
                );

                return;
            }


            name = name.trim();


            if (name.length > 20) {

                socket.emit(
                    "errorMessage",
                    "Tên tối đa 20 ký tự!"
                );

                return;
            }


            maxPlayers =
                Number(maxPlayers) || 6;


            if (maxPlayers < 6) {
                maxPlayers = 6;
            }

            if (maxPlayers > 30) {
                maxPlayers = 30;
            }


            const code =
                createRoomCode();


            const room = {

                code,

                name:
                    randomRoomName(),

                maxPlayers,

                host:
                    socket.id,

                phase:
                    "waiting",

                step:
                    "lobby",

                nightNumber:
                    1,

                players:
                    new Map(),

                deaths:
                    [],

                logs:
                    [],

                votes:
                    new Map(),

                winner:
                    null,

                wolfTarget:
                    null,

                seerTarget:
                    null,

                witchTarget:
                    null,

                witchSave:
                    false,

                witchKillTarget:
                    null,

                hunterTarget:
                    null
            };


            room.players.set(
                socket.id,
                {
                    id: socket.id,
                    name,
                    alive: true,
                    role: null,
                    witchSaveUsed: false,
                    witchKillUsed: false
                }
            );


            rooms.set(code, room);

            socket.join(code);

            socket.data.room = code;


            console.log(
                `🏠 Phòng ${code} được tạo bởi ${name}`
            );


            socket.emit(
                "roomCreated",
                {
                    room: code,
                    host: true
                }
            );


            addLog(
                room,
                `🏠 ${name} đã tạo phòng.`
            );

            emitRoomState(room);
        }
    );


    /* =====================================================
       JOIN ROOM
    ===================================================== */

socket.on(
    "joinRoom",
    ({ name, code }) => {

        if (!name || !name.trim()) {
            socket.emit(
                "errorMessage",
                "Vui lòng nhập tên!"
            );
            return;
        }

        if (!code) {
            socket.emit(
                "errorMessage",
                "Vui lòng nhập mã phòng!"
            );
            return;
        }

        name = name.trim();

        const roomCode =
            code.trim().toUpperCase();

        if (name.length > 20) {
            socket.emit(
                "errorMessage",
                "Tên tối đa 20 ký tự!"
            );
            return;
        }

        const room =
            rooms.get(roomCode);

        if (!room) {
            socket.emit(
                "errorMessage",
                "Không tìm thấy phòng!"
            );
            return;
        }

        if (room.phase !== "waiting") {
            socket.emit(
                "errorMessage",
                "Trò chơi đã bắt đầu!"
            );
            return;
        }

        if (
            room.players.size >=
            room.maxPlayers
        ) {
            socket.emit(
                "errorMessage",
                "Phòng đã đầy!"
            );
            return;
        }

        const duplicate =
            Array.from(
                room.players.values()
            ).some(
                player =>
                    player.name.toLowerCase() ===
                    name.toLowerCase()
            );

        if (duplicate) {
            socket.emit(
                "errorMessage",
                "Tên này đã có người sử dụng!"
            );
            return;
        }

        room.players.set(
            socket.id,
            {
                id: socket.id,
                name,
                alive: true,
                role: null,
                witchSaveUsed: false,
                witchKillUsed: false
            }
        );

        socket.join(roomCode);

        socket.data.room =
            roomCode;

        console.log(
            `👤 ${name} vào phòng ${roomCode}`
        );

        socket.emit(
            "roomJoined",
            {
                room: roomCode,
                host: false
            }
        );

        addLog(
            room,
            `👤 ${name} đã vào làng.`
        );

        emitRoomState(room);
    }
);


    /* =====================================================
       START GAME
    ===================================================== */

    socket.on(
        "startGame",
        () => {

            const room =
                getRoom(socket);

            if (!room) return;


            if (room.host !== socket.id) {

                socket.emit(
                    "errorMessage",
                    "Chỉ chủ phòng mới có thể bắt đầu!"
                );

                return;
            }


            if (room.phase !== "waiting") {

                socket.emit(
                    "errorMessage",
                    "Game đã bắt đầu!"
                );

                return;
            }


            if (room.players.size < 6) {

                socket.emit(
                    "errorMessage",
                    "Cần ít nhất 6 người chơi!"
                );

                return;
            }


            assignRoles(room);


            room.phase =
                "night";

            room.step =
                "wolf";

            room.nightNumber =
                1;

            room.deaths =
                [];

            room.logs =
                [];

            room.votes =
                new Map();

            room.wolfTarget =
                null;

            room.seerTarget =
                null;

            room.witchTarget =
                null;

            room.witchSave =
                false;

            room.witchKillTarget =
                null;

            room.hunterTarget =
                null;

            room.winner =
                null;


            addLog(
                room,
                "🎭 Vai trò đã được chia."
            );

            addLog(
                room,
                "🌙 Đêm 1 bắt đầu."
            );

            emitRoomState(room);
        }
    );


    /* =====================================================
       WOLF ACTION
    ===================================================== */

    socket.on(
        "wolfAction",
        targetId => {

            const room =
                getRoom(socket);

            if (!room) return;


            const player =
                getPlayer(
                    room,
                    socket.id
                );


            if (!player) return;


            if (player.role !== "wolf") {

                socket.emit(
                    "errorMessage",
                    "Bạn không phải Ma Sói!"
                );

                return;
            }


            if (!player.alive) {

                socket.emit(
                    "errorMessage",
                    "Bạn đã chết!"
                );

                return;
            }


            if (room.step !== "wolf") {

                socket.emit(
                    "errorMessage",
                    "Không phải lượt Ma Sói!"
                );

                return;
            }


            const target =
                getPlayer(
                    room,
                    targetId
                );


            if (!target) return;


            if (!target.alive) {

                socket.emit(
                    "errorMessage",
                    "Người này đã chết!"
                );

                return;
            }


            if (target.role === "wolf") {

                socket.emit(
                    "errorMessage",
                    "Không thể cắn đồng đội!"
                );

                return;
            }


            room.wolfTarget =
                target.id;


            addLog(
                room,
                "🐺 Ma Sói đã chọn mục tiêu."
            );


            /*
               Chuyển sang Tiên Tri
            */

            room.step =
                "seer";


            emitRoomState(room);
        }
    );


    /* =====================================================
       SEER ACTION
    ===================================================== */

    socket.on(
        "seerAction",
        targetId => {

            const room =
                getRoom(socket);

            if (!room) return;


            const player =
                getPlayer(
                    room,
                    socket.id
                );


            if (!player) return;


            if (player.role !== "seer") {

                socket.emit(
                    "errorMessage",
                    "Bạn không phải Tiên Tri!"
                );

                return;
            }


            if (!player.alive) {

                socket.emit(
                    "errorMessage",
                    "Bạn đã chết!"
                );

                return;
            }


            if (room.step !== "seer") {

                socket.emit(
                    "errorMessage",
                    "Không phải lượt Tiên Tri!"
                );

                return;
            }


            const target =
                getPlayer(
                    room,
                    targetId
                );


            if (!target) return;


            if (!target.alive) {

                socket.emit(
                    "errorMessage",
                    "Người này đã chết!"
                );

                return;
            }


            if (target.id === player.id) {

                socket.emit(
                    "errorMessage",
                    "Không thể kiểm tra chính mình!"
                );

                return;
            }


            room.seerTarget =
                target.id;


            /*
               Chỉ Tiên Tri nhận kết quả
            */

            socket.emit(
                "seerResult",
                {
                    id: target.id,
                    name: target.name,
                    role: target.role
                }
            );


            room.step =
                "seer_result";


            emitRoomState(room);
        }
    );


    /* =====================================================
       SEER CONTINUE
    ===================================================== */

    socket.on(
        "seerContinue",
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


            if (
                player.role !== "seer" ||
                !player.alive
            ) {
                return;
            }


            if (room.step !== "seer_result") {
                return;
            }


            room.step =
                "witch";


            sendWitchInformation(room);

            emitRoomState(room);
        }
    );


    /* =====================================================
       SEND WITCH INFO
    ===================================================== */

    function sendWitchInformation(room) {

        const witch =
            Array.from(
                room.players.values()
            ).find(
                player =>
                    player.role === "witch"
            );


        if (!witch) {

            room.step =
                "resolve_night";

            emitRoomState(room);

            return;
        }


        if (!witch.alive) {

            room.step =
                "resolve_night";

            emitRoomState(room);

            return;
        }


        const target =
            room.wolfTarget
                ? getPlayer(
                    room,
                    room.wolfTarget
                )
                : null;


        room.witchTarget =
            target
                ? target.id
                : null;


        socketEmitWitch(
            witch,
            room
        );
    }


    function socketEmitWitch(
        witch,
        room
    ) {

        io.to(witch.id)
            .emit(
                "witchTarget",
                {
                    targetId:
                        room.witchTarget,

                    saveAvailable:
                        !witch.witchSaveUsed,

                    killAvailable:
                        !witch.witchKillUsed
                }
            );
    }


    /* =====================================================
       WITCH ACTION
    ===================================================== */

    socket.on(
        "witchAction",
        data => {

            const room =
                getRoom(socket);

            if (!room) return;


            const witch =
                getPlayer(
                    room,
                    socket.id
                );


            if (!witch) return;


            if (witch.role !== "witch") {

                socket.emit(
                    "errorMessage",
                    "Bạn không phải Phù Thủy!"
                );

                return;
            }


            if (!witch.alive) {

                socket.emit(
                    "errorMessage",
                    "Bạn đã chết!"
                );

                return;
            }


            if (room.step !== "witch") {

                socket.emit(
                    "errorMessage",
                    "Không phải lượt Phù Thủy!"
                );

                return;
            }


            const action =
                data?.action;


            /*
               CỨU
            */

            if (action === "save") {

                if (witch.witchSaveUsed) {

                    socket.emit(
                        "errorMessage",
                        "Bạn đã dùng bình cứu!"
                    );

                    return;
                }


                if (!room.witchTarget) {

                    socket.emit(
                        "errorMessage",
                        "Đêm nay không có ai bị Sói cắn."
                    );

                    return;
                }


                witch.witchSaveUsed =
                    true;

                room.witchSave =
                    true;


                addLog(
                    room,
                    "🧙 Phù Thủy đã sử dụng bình cứu."
                );


                room.step =
                    "resolve_night";


                emitRoomState(room);

                return;
            }


            /*
               ĐỘC
            */

            if (action === "kill") {

                if (witch.witchKillUsed) {

                    socket.emit(
                        "errorMessage",
                        "Bạn đã dùng bình độc!"
                    );

                    return;
                }


                const target =
                    getPlayer(
                        room,
                        data.targetId
                    );


                if (!target) return;


                if (!target.alive) {

                    socket.emit(
                        "errorMessage",
                        "Người này đã chết!"
                    );

                    return;
                }


                if (target.id === witch.id) {

                    socket.emit(
                        "errorMessage",
                        "Không thể tự độc chính mình!"
                    );

                    return;
                }


                witch.witchKillUsed =
                    true;

                room.witchKillTarget =
                    target.id;


                addLog(
                    room,
                    "🧙 Phù Thủy đã sử dụng bình độc."
                );


                room.step =
                    "resolve_night";


                emitRoomState(room);

                return;
            }


            /*
               BỎ QUA
            */

            if (action === "skip") {

                room.step =
                    "resolve_night";


                emitRoomState(room);

                return;
            }
        }
    );


    /* =====================================================
       HOST SKIP
    ===================================================== */

    socket.on(
        "hostSkip",
        () => {

            const room =
                getRoom(socket);

            if (!room) return;


            if (room.host !== socket.id) {

                socket.emit(
                    "errorMessage",
                    "Chỉ chủ phòng mới có thể bỏ qua!"
                );

                return;
            }


            switch (room.step) {

                case "wolf":

                    room.step =
                        "seer";

                    break;


                case "seer":

                    room.step =
                        "witch";

                    sendWitchInformation(room);

                    return;


                case "seer_result":

                    room.step =
                        "witch";

                    sendWitchInformation(room);

                    return;


                case "witch":

                    room.step =
                        "resolve_night";

                    break;


                case "hunter":

                    finishHunterStep(room);

                    return;


                default:

                    return;
            }


            emitRoomState(room);
        }
    );


    /* =====================================================
       HOST RESOLVE NIGHT
    ===================================================== */

    socket.on(
        "hostResolveNight",
        () => {

            const room =
                getRoom(socket);

            if (!room) return;


            if (room.host !== socket.id) {

                socket.emit(
                    "errorMessage",
                    "Chỉ chủ phòng mới có thể kết thúc đêm!"
                );

                return;
            }


            if (
                room.step !==
                "resolve_night"
            ) {

                return;
            }


            resolveNight(room);
        }
    );


    /* =====================================================
       RESOLVE NIGHT
    ===================================================== */

    function resolveNight(room) {

        const killedIds = [];


        /*
           Sói giết
        */

        if (
            room.wolfTarget &&
            !room.witchSave
        ) {

            const target =
                getPlayer(
                    room,
                    room.wolfTarget
                );


            if (
                target &&
                target.alive
            ) {

                killedIds.push(
                    target.id
                );
            }
        }


        /*
           Phù Thủy độc
        */

        if (
            room.witchKillTarget
        ) {

            const target =
                getPlayer(
                    room,
                    room.witchKillTarget
                );


            if (
                target &&
                target.alive &&
                !killedIds.includes(
                    target.id
                )
            ) {

                killedIds.push(
                    target.id
                );
            }
        }


        /*
           Xử lý người chết
        */

        const newlyDead = [];


        killedIds.forEach(id => {

            const player =
                getPlayer(
                    room,
                    id
                );


            if (
                player &&
                player.alive
            ) {

                player.alive =
                    false;

                newlyDead.push(player);

                room.deaths.push({
                    id: player.id,
                    name: player.name,
                    reason: "night"
                });
            }
        });


        /*
           Log
        */

        if (!newlyDead.length) {

            room.logs.push(
                "🌙 Đêm nay không có ai chết."
            );

        } else {

            newlyDead.forEach(
                player => {

                    room.logs.push(
                        `💀 ${player.name} đã chết trong đêm.`
                    );
                }
            );
        }


        /*
           Kiểm tra thắng
        */

        const winner =
            checkWinner(room);


        if (winner) {

            endGame(
                room,
                winner
            );

            return;
        }


        /*
           Nếu có Thợ Săn chết
        */

        const deadHunter =
            newlyDead.find(
                player =>
                    player.role === "hunter"
            );


        if (deadHunter) {

            startHunterStep(
                room,
                deadHunter
            );

            return;
        }


        /*
           Sang ban ngày
        */

        startDiscussion(room);
    }


    /* =====================================================
       HUNTER
    ===================================================== */

    function startHunterStep(
        room,
        hunter
    ) {

        room.step =
            "hunter";

        room.hunterTarget =
            null;


        io.to(hunter.id)
            .emit(
                "hunterAction",
                {
                    canShoot: true
                }
            );


        room.logs.push(
            `🔫 ${hunter.name} là Thợ Săn và được phép kéo một người theo.`
        );


        emitRoomState(room);
    }


    socket.on(
        "hunterAction",
        targetId => {

            const room =
                getRoom(socket);

            if (!room) return;


            const hunter =
                getPlayer(
                    room,
                    socket.id
                );


            if (!hunter) return;


            if (hunter.role !== "hunter") {

                socket.emit(
                    "errorMessage",
                    "Bạn không phải Thợ Săn!"
                );

                return;
            }


            if (room.step !== "hunter") {

                socket.emit(
                    "errorMessage",
                    "Không phải lượt Thợ Săn!"
                );

                return;
            }


            const target =
                getPlayer(
                    room,
                    targetId
                );


            if (!target) return;


            if (!target.alive) {

                socket.emit(
                    "errorMessage",
                    "Người này đã chết!"
                );

                return;
            }


            if (target.id === hunter.id) {

                socket.emit(
                    "errorMessage",
                    "Không thể chọn chính mình!"
                );

                return;
            }


            target.alive =
                false;


            room.deaths.push({
                id: target.id,
                name: target.name,
                reason: "hunter"
            });


            room.logs.push(
                `🔫 Thợ Săn đã kéo ${target.name} chết cùng.`
            );


            room.hunterTarget =
                target.id;


            finishHunterStep(room);
        }
    );


    function finishHunterStep(room) {

        room.hunterTarget =
            room.hunterTarget || null;


        const winner =
            checkWinner(room);


        if (winner) {

            endGame(
                room,
                winner
            );

            return;
        }


        startDiscussion(room);
    }


    /* =====================================================
       DISCUSSION
    ===================================================== */

    function startDiscussion(room) {

        room.phase =
            "day";

        room.step =
            "discussion";


        room.votes =
            new Map();


        room.logs.push(
            "☀️ Trời sáng. Mọi người bắt đầu thảo luận."
        );


        emitRoomState(room);
    }


    /* =====================================================
       START VOTE
    ===================================================== */

    socket.on(
        "startVote",
        () => {

            const room =
                getRoom(socket);

            if (!room) return;


            if (room.host !== socket.id) {

                socket.emit(
                    "errorMessage",
                    "Chỉ chủ phòng mới có thể bắt đầu vote!"
                );

                return;
            }


            if (
                room.phase !== "day" ||
                room.step !== "discussion"
            ) {

                return;
            }


            room.step =
                "vote";


            room.votes =
                new Map();


            room.logs.push(
                "⚖️ Cuộc bỏ phiếu bắt đầu."
            );


            emitRoomState(room);
        }
    );


    /* =====================================================
       VOTE
    ===================================================== */

    socket.on(
        "vote",
        targetId => {

            const room =
                getRoom(socket);

            if (!room) return;


            if (room.step !== "vote") {

                socket.emit(
                    "errorMessage",
                    "Hiện chưa đến lúc bỏ phiếu!"
                );

                return;
            }


            const voter =
                getPlayer(
                    room,
                    socket.id
                );


            const target =
                getPlayer(
                    room,
                    targetId
                );


            if (!voter || !target) {
                return;
            }


            if (!voter.alive) {

                socket.emit(
                    "errorMessage",
                    "Bạn đã chết!"
                );

                return;
            }


            if (!target.alive) {

                socket.emit(
                    "errorMessage",
                    "Người này đã chết!"
                );

                return;
            }


            if (target.id === voter.id) {

                socket.emit(
                    "errorMessage",
                    "Không thể tự bỏ phiếu cho mình!"
                );

                return;
            }


            /*
               Một người chỉ được vote một lần
            */

            if (
                room.votes.has(
                    voter.id
                )
            ) {

                socket.emit(
                    "errorMessage",
                    "Bạn đã bỏ phiếu rồi!"
                );

                return;
            }


            room.votes.set(
                voter.id,
                target.id
            );


            emitRoomState(room);
        }
    );


    /* =====================================================
       FINISH VOTE
    ===================================================== */

    socket.on(
        "finishVote",
        () => {

            const room =
                getRoom(socket);

            if (!room) return;


            if (room.host !== socket.id) {

                socket.emit(
                    "errorMessage",
                    "Chỉ chủ phòng mới có thể kết thúc vote!"
                );

                return;
            }


            if (room.step !== "vote") {
                return;
            }


            const counts =
                getVoteCounts(room);


            let highest = 0;

            let winners = [];


            Object.entries(
                counts
            ).forEach(
                ([targetId, count]) => {

                    if (count > highest) {

                        highest =
                            count;

                        winners = [
                            targetId
                        ];

                    } else if (
                        count === highest
                    ) {

                        winners.push(
                            targetId
                        );
                    }
                }
            );


            /*
               Không có vote
            */

            if (
                highest === 0
            ) {

                room.logs.push(
                    "⚖️ Không có ai nhận phiếu."
                );

                nextNight(room);

                return;
            }


            /*
               Hòa phiếu
            */

            if (
                winners.length > 1
            ) {

                room.logs.push(
                    "⚖️ Kết quả hòa phiếu. Không ai bị treo."
                );

                nextNight(room);

                return;
            }


            const eliminated =
                getPlayer(
                    room,
                    winners[0]
                );


            if (!eliminated) {

                nextNight(room);

                return;
            }


            eliminated.alive =
                false;


            room.deaths.push({
                id: eliminated.id,
                name: eliminated.name,
                reason: "vote"
            });


            room.logs.push(
                `⚖️ ${eliminated.name} đã bị dân làng treo.`
            );


            /*
               Check winner
            */

            const winner =
                checkWinner(room);


            if (winner) {

                endGame(
                    room,
                    winner
                );

                return;
            }


            /*
               Nếu người bị treo là Hunter
            */

            if (
                eliminated.role ===
                "hunter"
            ) {

                startHunterStep(
                    room,
                    eliminated
                );

                return;
            }


            nextNight(room);
        }
    );


    /* =====================================================
       NEXT NIGHT
    ===================================================== */

    function nextNight(room) {

        room.nightNumber =
            (room.nightNumber || 1) + 1;


        room.phase =
            "night";

        room.step =
            "wolf";


        room.wolfTarget =
            null;

        room.seerTarget =
            null;

        room.witchTarget =
            null;

        room.witchSave =
            false;

        room.witchKillTarget =
            null;

        room.hunterTarget =
            null;

        room.votes =
            new Map();


        room.logs.push(
            `🌙 Đêm ${room.nightNumber} bắt đầu.`
        );


        emitRoomState(room);
    }


    /* =====================================================
       CHECK WINNER
    ===================================================== */

    function checkWinner(room) {

        const wolves =
            getAliveWolves(room).length;


        const villagers =
            getAliveVillagers(room).length;


        if (wolves === 0) {

            return "villagers";
        }


        if (wolves >= villagers) {

            return "wolves";
        }


        return null;
    }


    /* =====================================================
       END GAME
    ===================================================== */

    function endGame(
        room,
        winner
    ) {

        room.phase =
            "ended";

        room.step =
            "ended";

        room.winner =
            winner;


        if (winner === "wolves") {

            room.logs.push(
                "🐺 Ma Sói đã tiêu diệt phe Dân Làng!"
            );

        } else {

            room.logs.push(
                "🏡 Dân Làng đã tiêu diệt toàn bộ Ma Sói!"
            );
        }


        emitRoomState(room);


        io.to(room.code)
            .emit(
                "gameEnded",
                {
                    winner,

                    players:
                        Array.from(
                            room.players.values()
                        ).map(
                            player => ({
                                id: player.id,
                                name: player.name,
                                alive: player.alive,
                                role: player.role
                            })
                        ),

                    deaths:
                        room.deaths,

                    logs:
                        room.logs
                }
            );
    }


    /* =====================================================
       RESTART GAME
    ===================================================== */

    socket.on(
        "restartGame",
        () => {

            const room =
                getRoom(socket);

            if (!room) return;


            if (room.host !== socket.id) {

                socket.emit(
                    "errorMessage",
                    "Chỉ chủ phòng mới có thể chơi lại!"
                );

                return;
            }


            /*
               Reset toàn bộ người chơi
            */

            room.players.forEach(
                player => {

                    player.alive =
                        true;

                    player.role =
                        null;

                    player.witchSaveUsed =
                        false;

                    player.witchKillUsed =
                        false;
                }
            );


            room.phase =
                "waiting";

            room.step =
                "lobby";

            room.nightNumber =
                1;

            room.deaths =
                [];

            room.logs =
                [];

            room.votes =
                new Map();

            room.winner =
                null;

            room.wolfTarget =
                null;

            room.seerTarget =
                null;

            room.witchTarget =
                null;

            room.witchSave =
                false;

            room.witchKillTarget =
                null;

            room.hunterTarget =
                null;


            /*
               Xóa vai trò ở client
            */

            room.players.forEach(
                player => {

                    io.to(player.id)
                        .emit(
                            "roleAssigned",
                            {
                                role: null
                            }
                        );
                }
            );


            room.logs.push(
                "🔄 Game đã được reset. Chờ chủ phòng bắt đầu lại."
            );


            emitRoomState(room);
        }
    );


    /* =====================================================
       CHAT
    ===================================================== */

    socket.on(
        "chat",
        message => {

            const room =
                getRoom(socket);

            if (!room) return;


            const player =
                getPlayer(
                    room,
                    socket.id
                );


            if (!player) return;


            if (
                typeof message !==
                "string"
            ) {
                return;
            }


            message =
                message.trim();


            if (!message) return;


            if (message.length > 300) {

                message =
                    message.substring(
                        0,
                        300
                    );
            }


            io.to(room.code)
                .emit(
                    "chat",
                    {
                        name:
                            player.name,

                        message
                    }
                );
        }
    );


    /* =====================================================
       DISCONNECT
    ===================================================== */

    socket.on(
        "disconnect",
        () => {

            console.log(
                "🔴 Người chơi thoát:",
                socket.id
            );


            const room =
                getRoom(socket);


            if (!room) return;


            const player =
                getPlayer(
                    room,
                    socket.id
                );


            const playerName =
                player?.name ||
                "Người chơi";


            room.players.delete(
                socket.id
            );


            /*
               Không còn ai
            */

            if (
                room.players.size === 0
            ) {

                rooms.delete(
                    room.code
                );

                console.log(
                    `🗑️ Xóa phòng ${room.code}`
                );

                return;
            }


            /*
               Nếu chủ phòng thoát
            */

            if (
                room.host === socket.id
            ) {

                const newHost =
                    room.players
                        .keys()
                        .next()
                        .value;


                room.host =
                    newHost;


                io.to(room.code)
                    .emit(
                        "newHost",
                        newHost
                    );


                const newHostPlayer =
                    getPlayer(
                        room,
                        newHost
                    );


                room.logs.push(
                    `👑 ${newHostPlayer?.name || "Người chơi"} trở thành chủ phòng mới.`
                );
            }


            /*
               Nếu đang lobby
            */

            room.logs.push(
                `🚪 ${playerName} đã rời phòng.`
            );


            emitRoomState(room);
        }
    );
});


/* =========================================================
   START SERVER
========================================================= */

server.listen(
    PORT,
    () => {

        console.log(
            `🐺 Ma Sói Server đang chạy tại port ${PORT}`
        );

    }
);
