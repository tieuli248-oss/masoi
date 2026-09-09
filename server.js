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

/* =====================================================
   DATA
===================================================== */

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


/* =====================================================
   UTILITIES
===================================================== */

function randomRoomName() {
    return ROOM_NAMES[
        Math.floor(Math.random() * ROOM_NAMES.length)
    ];
}


function createRoomCode() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars[
            Math.floor(Math.random() * chars.length)
        ];
    }

    return code;
}


function getUniqueRoomCode() {

    let code;

    do {
        code = createRoomCode();
    } while (rooms.has(code));

    return code;
}


function cleanName(name) {

    if (typeof name !== "string") {
        return "";
    }

    return name
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 20);
}


function cleanCode(code) {

    if (typeof code !== "string") {
        return "";
    }

    return code
        .trim()
        .toUpperCase();
}


function getRoom(socket) {

    for (const room of rooms.values()) {

        if (room.players.has(socket.id)) {
            return room;
        }

    }

    return null;
}


function getPlayer(room, socketId) {

    if (!room) return null;

    return room.players.get(socketId) || null;
}


/* =====================================================
   PUBLIC ROOM STATE
===================================================== */

/*
   HTML hiện tại cần:

   room.name
   room.code
   room.hostId
   room.players
   room.logs
   room.phase
   room.step
   room.day
*/

function getRoomState(room) {

    return {

        code: room.code,

        name: room.name,

        maxPlayers: room.maxPlayers,

        hostId: room.hostId,

        phase: room.phase,

        step: room.step,

        day: room.day,

        players: Array.from(room.players.values()).map(player => {

            return {

                id: player.id,

                name: player.name,

                role: player.role,

                alive: player.alive

            };

        }),

        logs: [...room.logs],

        deaths: [...room.deaths]

    };
}


/* =====================================================
   SEND ROOM STATE
===================================================== */

function emitRoomState(room) {

    if (!room) return;

    io.to(room.code).emit(
        "roomState",
        getRoomState(room)
    );
}


/* =====================================================
   LOG
===================================================== */

function addLog(room, text) {

    if (!room) return;

    room.logs.push(text);

    /*
       Giữ log không quá dài
    */

    if (room.logs.length > 100) {
        room.logs.shift();
    }

}


/* =====================================================
   CREATE ROOM
===================================================== */

function createRoom(socket, data) {

    const name =
        cleanName(data?.name);

    const maxPlayers =
        Number(data?.maxPlayers);


    if (!name) {

        socket.emit(
            "errorMessage",
            "Hãy nhập tên của bạn."
        );

        return;

    }


    if (name.length > 20) {

        socket.emit(
            "errorMessage",
            "Tên tối đa 20 ký tự."
        );

        return;

    }


    if (
        !Number.isInteger(maxPlayers) ||
        maxPlayers < 6 ||
        maxPlayers > 30
    ) {

        socket.emit(
            "errorMessage",
            "Số người chơi phải từ 6 đến 30."
        );

        return;

    }


    /*
       Nếu người này đang ở phòng khác
       thì rời phòng cũ trước.
    */

    leaveCurrentRoom(socket);


    const code =
        getUniqueRoomCode();


    const room = {

        code,

        name: randomRoomName(),

        maxPlayers,

        hostId: socket.id,

        phase: "waiting",

        step: "lobby",

        day: 0,

        players: new Map(),

        logs: [],

        deaths: [],

        gameStarted: false

    };


    /*
       Nếu muốn tên phòng là tên người tạo
       thì đổi dòng room.name ở trên thành:
       
       name
       
       Hiện tại giữ kiểu "Làng Trăng Máu".
    */


    room.players.set(
        socket.id,
        {
            id: socket.id,
            name,
            role: null,
            alive: true
        }
    );


    rooms.set(
        code,
        room
    );


    socket.join(code);


    addLog(
        room,
        `🏠 Phòng ${room.name} đã được tạo.`
    );


    socket.emit(
        "roomCreated",
        {
            room: code,
            code: code,
            host: true
        }
    );


    emitRoomState(room);


    console.log(
        `🏠 Tạo phòng ${code} - ${room.name} - ${name}`
    );

}


/* =====================================================
   JOIN ROOM
===================================================== */

function joinRoom(socket, data) {

    const name =
        cleanName(data?.name);

    const code =
        cleanCode(data?.code);


    if (!name) {

        socket.emit(
            "errorMessage",
            "Hãy nhập tên của bạn."
        );

        return;

    }


    if (name.length > 20) {

        socket.emit(
            "errorMessage",
            "Tên tối đa 20 ký tự."
        );

        return;

    }


    if (code.length !== 6) {

        socket.emit(
            "errorMessage",
            "Mã phòng phải có 6 ký tự."
        );

        return;

    }


    const room =
        rooms.get(code);


    if (!room) {

        socket.emit(
            "errorMessage",
            "Không tìm thấy phòng."
        );

        return;

    }


    /*
       Không cho tham gia khi game đã bắt đầu.
    */

    if (
        room.phase !== "waiting" &&
        room.phase !== "lobby"
    ) {

        socket.emit(
            "errorMessage",
            "Ván chơi đã bắt đầu, không thể tham gia."
        );

        return;

    }


    /*
       Kiểm tra đầy phòng
    */

    if (
        room.players.size >=
        room.maxPlayers
    ) {

        socket.emit(
            "errorMessage",
            "Phòng đã đầy."
        );

        return;

    }


    /*
       Không cho trùng tên
    */

    const duplicate =
        Array.from(
            room.players.values()
        ).some(
            p =>
                p.name.toLowerCase() ===
                name.toLowerCase()
        );


    if (duplicate) {

        socket.emit(
            "errorMessage",
            "Tên này đã có trong phòng."
        );

        return;

    }


    /*
       Nếu đang ở phòng khác
    */

    leaveCurrentRoom(socket);


    room.players.set(
        socket.id,
        {
            id: socket.id,
            name,
            role: null,
            alive: true
        }
    );


    socket.join(code);


    addLog(
        room,
        `👤 ${name} đã tham gia phòng.`
    );


    socket.emit(
        "roomJoined",
        {
            room: code,
            code: code,
            host: false
        }
    );


    emitRoomState(room);


    console.log(
        `🚪 ${name} tham gia ${code}`
    );

}


/* =====================================================
   LEAVE CURRENT ROOM
===================================================== */

function leaveCurrentRoom(socket) {

    const room =
        getRoom(socket);


    if (!room) {
        return;
    }


    const player =
        room.players.get(socket.id);


    if (player) {

        room.players.delete(
            socket.id
        );

        addLog(
            room,
            `🚪 ${player.name} đã rời phòng.`
        );

    }


    socket.leave(
        room.code
    );


    /*
       Nếu phòng không còn ai
       thì xóa phòng.
    */

    if (room.players.size === 0) {

        rooms.delete(
            room.code
        );

        console.log(
            `🗑️ Xóa phòng ${room.code}`
        );

        return;

    }


    /*
       Nếu host rời
       chuyển host cho người còn lại.
    */

    if (
        room.hostId === socket.id
    ) {

        const nextHost =
            room.players.values().next().value;


        if (nextHost) {

            room.hostId =
                nextHost.id;


            io.to(room.code).emit(
                "newHost",
                room.hostId
            );


            addLog(
                room,
                `👑 ${nextHost.name} trở thành quản trò mới.`
            );

        }

    }


    emitRoomState(room);

}


/* =====================================================
   SOCKET CONNECTION
===================================================== */

io.on("connection", socket => {

    console.log(
        "🟢 Người chơi kết nối:",
        socket.id
    );


    /* =================================================
       CREATE
    ================================================= */

    socket.on(
        "createRoom",
        data => {

            createRoom(
                socket,
                data
            );

        }
    );


    /* =================================================
       JOIN
    ================================================= */

    socket.on(
        "joinRoom",
        data => {

            joinRoom(
                socket,
                data
            );

        }
    );


    /* =================================================
       CHAT
    ================================================= */

    socket.on(
        "chat",
        data => {

            const room =
                getRoom(socket);

            if (!room) return;


            const player =
                getPlayer(
                    room,
                    socket.id
                );


            if (!player) return;


            let message =
                typeof data === "string"
                ? data
                : data?.message;


            if (
                typeof message !== "string"
            ) {
                return;
            }


            message =
                message
                    .trim()
                    .slice(0, 300);


            if (!message) {
                return;
            }


            io.to(room.code).emit(
                "chat",
                {
                    id: socket.id,
                    name: player.name,
                    message
                }
            );

        }
    );


    /* =================================================
       REFRESH / REQUEST ROOM STATE
    ================================================= */

    socket.on(
        "requestRoomState",
        () => {

            const room =
                getRoom(socket);

            if (!room) return;

            socket.emit(
                "roomState",
                getRoomState(room)
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
                "🔴 Người chơi thoát:",
                socket.id
            );


            leaveCurrentRoom(
                socket
            );

        }
    );

});


/* =====================================================
   TEST ROUTE
===================================================== */

app.get(
    "/",
    (req, res) => {

        res.send(
            "🐺 Ma Sói Server đang chạy!"
        );

    }
);


/* =====================================================
   START SERVER
===================================================== */

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🐺 Ma Sói Server đang chạy tại port ${PORT}`
        );

    }
);
