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

// Lưu các phòng đang chơi
const rooms = new Map();

// Trang kiểm tra server
app.get("/", (req, res) => {
    res.send("🐺 MA SÓI SERVER ONLINE!");
});

// Tạo mã phòng 4 ký tự
function createRoomCode() {
    let code;

    do {
        code = Math.random()
            .toString(36)
            .substring(2, 6)
            .toUpperCase();
    } while (rooms.has(code));

    return code;
}

// Lấy danh sách người chơi
function getPlayers(room) {
    return Array.from(room.players.values()).map(player => ({
        id: player.id,
        name: player.name,
        alive: player.alive,
        role: player.role
    }));
}


// ===============================
// KẾT NỐI NGƯỜI CHƠI
// ===============================

io.on("connection", socket => {

    console.log("🟢 Người chơi kết nối:", socket.id);


    // ===============================
    // TẠO PHÒNG
    // ===============================

    socket.on("createRoom", ({ name }) => {

        if (!name || !name.trim()) {
            socket.emit("errorMessage", "Vui lòng nhập tên!");
            return;
        }

        const roomCode = createRoomCode();

        const room = {
            host: socket.id,
            phase: "waiting",
            players: new Map()
        };

        room.players.set(socket.id, {
            id: socket.id,
            name: name.trim(),
            alive: true,
            role: null
        });

        rooms.set(roomCode, room);

        socket.join(roomCode);

        socket.data.room = roomCode;

        console.log(`🏠 Tạo phòng ${roomCode}`);

        socket.emit("roomCreated", {
            room: roomCode,
            host: true
        });

        io.to(roomCode).emit(
            "players",
            getPlayers(room)
        );
    });


    // ===============================
    // VÀO PHÒNG
    // ===============================

    socket.on("joinRoom", ({ name, room }) => {

        if (!name || !room) {
            socket.emit(
                "errorMessage",
                "Vui lòng nhập tên và mã phòng!"
            );
            return;
        }

        const roomCode = room.trim().toUpperCase();

        const gameRoom = rooms.get(roomCode);

        if (!gameRoom) {
            socket.emit(
                "errorMessage",
                "Không tìm thấy phòng!"
            );
            return;
        }

        if (gameRoom.phase !== "waiting") {
            socket.emit(
                "errorMessage",
                "Trò chơi đã bắt đầu!"
            );
            return;
        }

        if (gameRoom.players.size >= 20) {
            socket.emit(
                "errorMessage",
                "Phòng đã đủ 20 người!"
            );
            return;
        }

        gameRoom.players.set(socket.id, {
            id: socket.id,
            name: name.trim(),
            alive: true,
            role: null
        });

        socket.join(roomCode);

        socket.data.room = roomCode;

        console.log(
            `👤 ${name} vào phòng ${roomCode}`
        );

        socket.emit("roomJoined", {
            room: roomCode,
            host: false
        });

        io.to(roomCode).emit(
            "players",
            getPlayers(gameRoom)
        );
    });


    // ===============================
    // CHAT
    // ===============================

    socket.on("chat", message => {

        const roomCode = socket.data.room;

        if (!roomCode) return;

        const room = rooms.get(roomCode);

        if (!room) return;

        const player = room.players.get(socket.id);

        if (!player) return;

        io.to(roomCode).emit("chat", {
            name: player.name,
            message: message
        });
    });


    // ===============================
    // HOST BẮT ĐẦU GAME
    // ===============================

    socket.on("startGame", () => {

        const roomCode = socket.data.room;

        if (!roomCode) return;

        const room = rooms.get(roomCode);

        if (!room) return;

        if (room.host !== socket.id) {
            socket.emit(
                "errorMessage",
                "Chỉ chủ phòng mới có thể bắt đầu!"
            );
            return;
        }

        if (room.players.size < 3) {
            socket.emit(
                "errorMessage",
                "Cần ít nhất 3 người chơi!"
            );
            return;
        }

        room.phase = "night";

        console.log(
            `🌙 Phòng ${roomCode} bắt đầu game`
        );

        io.to(roomCode).emit("gameStarted", {
            phase: "night"
        });
    });


    // ===============================
    // ĐỔI GIAI ĐOẠN
    // ===============================

    socket.on("changePhase", phase => {

        const roomCode = socket.data.room;

        if (!roomCode) return;

        const room = rooms.get(roomCode);

        if (!room) return;

        if (room.host !== socket.id) {
            return;
        }

        room.phase = phase;

        io.to(roomCode).emit(
            "phaseChanged",
            phase
        );
    });


    // ===============================
    // VOTE
    // ===============================

    socket.on("vote", targetId => {

        const roomCode = socket.data.room;

        if (!roomCode) return;

        const room = rooms.get(roomCode);

        if (!room) return;

        const voter = room.players.get(socket.id);

        const target = room.players.get(targetId);

        if (!voter || !target) return;

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

        io.to(roomCode).emit("vote", {
            voter: voter.name,
            target: target.name
        });
    });


    // ===============================
    // GIẾT NGƯỜI CHƠI
    // ===============================

    socket.on("killPlayer", targetId => {

        const roomCode = socket.data.room;

        if (!roomCode) return;

        const room = rooms.get(roomCode);

        if (!room) return;

        // Chỉ host xử lý
        if (room.host !== socket.id) {
            return;
        }

        const target = room.players.get(targetId);

        if (!target) return;

        target.alive = false;

        io.to(roomCode).emit(
            "playerKilled",
            target.id
        );

        io.to(roomCode).emit(
            "players",
            getPlayers(room)
        );
    });


    // ===============================
    // NGƯỜI CHƠI THOÁT
    // ===============================

    socket.on("disconnect", () => {

        console.log(
            "🔴 Người chơi thoát:",
            socket.id
        );

        const roomCode = socket.data.room;

        if (!roomCode) return;

        const room = rooms.get(roomCode);

        if (!room) return;

        room.players.delete(socket.id);

        // Nếu phòng không còn ai
        if (room.players.size === 0) {

            rooms.delete(roomCode);

            console.log(
                `🗑️ Xóa phòng ${roomCode}`
            );

            return;
        }

        // Nếu host thoát → chuyển host
        if (room.host === socket.id) {

            const newHost =
                room.players.keys().next().value;

            room.host = newHost;

            io.to(roomCode).emit(
                "newHost",
                newHost
            );
        }

        // Cập nhật danh sách
        io.to(roomCode).emit(
            "players",
            getPlayers(room)
        );
    });

});


// ===============================
// CHẠY SERVER
// ===============================

server.listen(PORT, () => {

    console.log(
        `🐺 Ma Sói Server đang chạy tại port ${PORT}`
    );

});
