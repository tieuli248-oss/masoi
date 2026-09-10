const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Cho phép Client kết nối từ bất kỳ đâu (Localhost hoặc IP)
});

/* =========================
   TRẠNG THÁI PHÒNG (STATE)
========================= */
let room = {
    started: false,
    hostId: null,
    players: [], // Danh sách người chơi
    pendingHunter: null, // Xử lý nếu Thợ săn bị giết
    logs: [] // Ghi log hệ thống
};

/* =========================
   HÀM HỖ TRỢ & LOGIC GAME
========================= */
function findPlayer(id) {
    return room.players.find(p => p.id === id);
}

function emitRoom() {
    io.emit("updateRoom", room);
}

function addLog(msg) {
    console.log(`[LOG]: ${msg}`);
    room.logs.push(msg);
    if (room.logs.length > 50) room.logs.shift(); // Giữ tối đa 50 dòng log
    io.emit("adminLog", room.logs); // Gửi log về cho Host/Admin nếu cần
}

function chooseHost() {
    const connectedPlayers = room.players.filter(p => p.connected);
    if (connectedPlayers.length > 0) {
        room.hostId = connectedPlayers[0].id; // Chọn người đầu tiên còn kết nối làm Host
        addLog(`👑 ${connectedPlayers[0].name} đã trở thành HOST mới.`);
    } else {
        room.hostId = null;
    }
}

// Hàm cấu hình vai trò tự động theo số lượng người (6 -> 15)
function getRolesConfig(count) {
    // S: Sói, B: Bảo vệ, T: Tiên tri, P: Phù thủy, TS: Thợ săn, D: Dân làng
    const rolesMap = {
        6:  ["Sói", "Sói", "Tiên tri", "Bảo vệ", "Dân làng", "Dân làng"],
        7:  ["Sói", "Sói", "Tiên tri", "Bảo vệ", "Dân làng", "Dân làng", "Dân làng"],
        8:  ["Sói", "Sói", "Tiên tri", "Bảo vệ", "Thợ săn", "Dân làng", "Dân làng", "Dân làng"],
        9:  ["Sói", "Sói", "Tiên tri", "Bảo vệ", "Thợ săn", "Phù thủy", "Dân làng", "Dân làng", "Dân làng"],
        10: ["Sói", "Sói", "Sói", "Tiên tri", "Bảo vệ", "Thợ săn", "Phù thủy", "Dân làng", "Dân làng", "Dân làng"],
        11: ["Sói", "Sói", "Sói", "Tiên tri", "Bảo vệ", "Thợ săn", "Phù thủy", "Dân làng", "Dân làng", "Dân làng", "Dân làng"],
        12: ["Sói", "Sói", "Sói", "Tiên tri", "Bảo vệ", "Thợ săn", "Phù thủy", "Bán sói", "Dân làng", "Dân làng", "Dân làng", "Dân làng"],
        13: ["Sói", "Sói", "Sói", "Tiên tri", "Bảo vệ", "Thợ săn", "Phù thủy", "Bán sói", "Dân làng", "Dân làng", "Dân làng", "Dân làng", "Dân làng"],
        14: ["Sói", "Sói", "Sói", "Sói", "Tiên tri", "Bảo vệ", "Thợ săn", "Phù thủy", "Bán sói", "Dân làng", "Dân làng", "Dân làng", "Dân làng", "Dân làng"],
        15: ["Sói", "Sói", "Sói", "Sói", "Tiên tri", "Bảo vệ", "Thợ săn", "Phù thủy", "Bán sói", "Già làng", "Dân làng", "Dân làng", "Dân làng", "Dân làng", "Dân làng"]
    };
    return rolesMap[count] || Array(count).fill("Dân làng");
}

function assignRoles() {
    const playerCount = room.players.length;
    let roles = getRolesConfig(playerCount);
    
    // Trộn ngẫu nhiên vai trò
    roles = roles.sort(() => Math.random() - 0.5);
    
    room.players.forEach((player, index) => {
        player.role = roles[index];
        player.alive = true;
    });
    
    addLog(`Đã chia bài cho ${playerCount} người chơi.`);
}

/* =========================
   XỬ LÝ SOCKET.IO
========================= */
io.on("connection", (socket) => {
    
    // 1. NGƯỜI CHƠI THAM GIA
    socket.on("joinGame", (playerName) => {
        if (room.started) {
            socket.emit("errorMessage", "Game đã bắt đầu, không thể tham gia!");
            return;
        }

        // Chặn người thứ 16 trở lên
        if (room.players.length >= 15) {
            socket.emit("errorMessage", "Phòng đã đầy (Tối đa 15 người).");
            return;
        }

        // Kiểm tra tên trùng
        let existingPlayer = room.players.find(p => p.name === playerName);
        if (existingPlayer) {
            // Cho phép reconnect nếu mất kết nối trước đó (cùng tên)
            existingPlayer.id = socket.id;
            existingPlayer.connected = true;
            addLog(`${playerName} đã kết nối lại.`);
        } else {
            // Tạo người chơi mới
            const newPlayer = {
                id: socket.id,
                name: playerName,
                connected: true,
                isReady: false, // Trạng thái sẵn sàng
                role: null,
                alive: true
            };
            room.players.push(newPlayer);
            addLog(`${playerName} đã vào phòng.`);
        }

        // Gán Host cho người đầu tiên vào phòng
        if (!room.hostId) {
            room.hostId = socket.id;
        }

        emitRoom();
    });

    // 2. NGƯỜI CHƠI CHUYỂN TRẠNG THÁI SẴN SÀNG
    socket.on("toggleReady", () => {
        const player = findPlayer(socket.id);
        if (!player) return;

        // Host không cần bấm sẵn sàng
        if (socket.id === room.hostId) return;

        player.isReady = !player.isReady;
        emitRoom();
    });

    // 3. HOST BẮT ĐẦU GAME
    socket.on("startGame", () => {
        // Kiểm tra quyền Host
        if (socket.id !== room.hostId) {
            socket.emit("errorMessage", "Chỉ Host mới có quyền bắt đầu game!");
            return;
        }

        // Điều kiện 1: Tối thiểu 6 người
        if (room.players.length < 6) {
            socket.emit("errorMessage", `Chưa đủ người chơi! (Cần 6, hiện có ${room.players.length})`);
            return;
        }

        // Điều kiện 2: Kiểm tra tất cả đã sẵn sàng chưa (trừ Host)
        const allReady = room.players.every(p => 
            p.id === room.hostId || (p.isReady && p.connected)
        );

        if (!allReady) {
            socket.emit("errorMessage", "Không thể bắt đầu: Có người chưa sẵn sàng hoặc bị mất kết nối!");
            return;
        }

        // Thoả mãn điều kiện -> Bắt đầu
        room.started = true;
        assignRoles();
        addLog("Trò chơi chính thức bắt đầu!");
        emitRoom();
    });

    // 4. XỬ LÝ KHI NGẮT KẾT NỐI (DISCONNECT)
    socket.on("disconnect", () => {
        const player = findPlayer(socket.id);
        if (!player) return;

        player.connected = false;

        // Nếu game chưa bắt đầu, xoá hẳn người đó khỏi phòng
        if (!room.started) {
            room.players = room.players.filter(p => p.id !== socket.id);
            addLog(`${player.name} đã rời phòng chờ.`);
        } else {
            // Nếu game đang diễn ra, giữ lại data nhưng đánh dấu là 🔴 mất kết nối
            addLog(`${player.name} (Vai: ${player.role}) đã mất kết nối trong khi chơi.`);
            
            // Nếu muốn xử lý người chơi chết luôn khi disconnect, bạn có thể thêm logic ở đây
            // player.alive = false; 
        }

        // Nếu người thoát là Host, chuyển quyền Host
        if (room.hostId === socket.id) {
            chooseHost();
        }

        emitRoom();
    });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🐺 Server Ma Sói đang chạy tại http://localhost:${PORT}`);
});
