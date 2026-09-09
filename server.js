const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 10000;

// =====================================================
// EXPRESS
// =====================================================

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "masoi-online.html"));
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    message: "Ma Sói Online server đang chạy",
    rooms: rooms.size
  });
});

// =====================================================
// DATABASE TẠM THỜI
// =====================================================

const users = {
  admin: {
    password: "admin123",
    accountType: "admin"
  },

  player: {
    password: "123456",
    accountType: "player"
  }
};

const rooms = new Map();

// =====================================================
// UTILITY
// =====================================================

function createRoomCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
  } while (rooms.has(code));

  return code;
}

function getRoom(socket) {
  const roomCode = socket.data.roomCode;

  if (!roomCode) return null;

  return rooms.get(roomCode) || null;
}

function getPlayer(room, socketId) {
  if (!room) return null;

  return room.players.find(
    player => player.id === socketId
  );
}

function alivePlayers(room) {
  return room.players.filter(
    player => player.alive
  );
}

function aliveWolves(room) {
  return room.players.filter(
    player =>
      player.alive &&
      player.role === "Sói"
  );
}

function getPublicPlayers(room) {
  return room.players.map(player => ({
    id: player.id,
    name: player.name,
    alive: player.alive,
    ready: player.ready
  }));
}

function getPublicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    day: room.day,
    hostId: room.hostId,
    players: getPublicPlayers(room)
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit("roomUpdate", {
    room: getPublicRoom(room),
    players: getPublicPlayers(room)
  });

  io.to(room.code).emit("playersUpdate", {
    players: getPublicPlayers(room)
  });
}

function sendError(socket, message) {
  socket.emit("errorMessage", {
    message
  });
}

// =====================================================
// CHIA ROLE
// =====================================================

function assignRoles(room, wolfCount) {
  const players = [...room.players];

  let roles = [];

  wolfCount = Math.max(
    1,
    Math.min(
      Number(wolfCount) || 1,
      Math.floor(players.length / 2)
    )
  );

  for (let i = 0; i < wolfCount; i++) {
    roles.push("Sói");
  }

  if (players.length >= 5) {
    roles.push("Tiên tri");
  }

  if (players.length >= 6) {
    roles.push("Bảo vệ");
  }

  if (players.length >= 7) {
    roles.push("Phù thủy");
  }

  if (players.length >= 8) {
    roles.push("Thợ săn");
  }

  while (roles.length < players.length) {
    roles.push("Dân");
  }

  // shuffle role
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [roles[i], roles[j]] =
      [roles[j], roles[i]];
  }

  players.forEach((player, index) => {
    player.role = roles[index];
    player.alive = true;
  });
}

// =====================================================
// KIỂM TRA WIN
// =====================================================

function checkWinner(room) {
  const wolves = aliveWolves(room).length;

  const others = alivePlayers(room).filter(
    player => player.role !== "Sói"
  ).length;

  if (wolves === 0) {
    return "Dân làng thắng!";
  }

  if (wolves >= others) {
    return "Sói thắng!";
  }

  return null;
}

// =====================================================
// VOTE
// =====================================================

function getVoteList(room) {
  const list = [];

  for (const [voterId, targetId] of room.votes.entries()) {
    const voter = room.players.find(
      p => p.id === voterId
    );

    const target = room.players.find(
      p => p.id === targetId
    );

    if (!voter || !target) continue;

    list.push({
      voterId,
      voterName: voter.name,
      targetId,
      targetName: target.name
    });
  }

  return list;
}

// =====================================================
// SOCKET.IO
// =====================================================

io.on("connection", socket => {

  console.log("Connected:", socket.id);

  // ---------------------------------------------------
  // AUTHENTICATE
  // ---------------------------------------------------

  socket.on("authenticate", data => {

    const id =
      String(data?.id || "").trim();

    const password =
      String(data?.password || "");

    const user = users[id];

    if (!user || user.password !== password) {

      sendError(
        socket,
        "Sai ID hoặc mật khẩu."
      );

      return;
    }

    socket.data.authenticated = true;
    socket.data.userId = id;
    socket.data.accountType =
      user.accountType;

    socket.emit(
      "authenticateSuccess",
      {
        accountType:
          user.accountType
      }
    );

  });

  // ---------------------------------------------------
  // JOIN LOBBY
  // ---------------------------------------------------

  socket.on("joinLobby", data => {

    if (!socket.data.authenticated) {

      return sendError(
        socket,
        "Bạn chưa đăng nhập."
      );

    }

    const name =
      String(data?.name || "").trim();

    if (!name) {

      return sendError(
        socket,
        "Vui lòng nhập tên."
      );

    }

    // Tìm lobby chưa bắt đầu
    let room =
      [...rooms.values()]
        .find(r => r.phase === "lobby");

    // Nếu không có thì tạo
    if (!room) {

      room = {
        code: createRoomCode(),
        hostId: socket.id,
        phase: "lobby",
        day: 0,
        players: [],
        votes: new Map(),
        wolfTarget: null,

        voice: {
          currentPlayerIndex: 0,
          round: 1,
          timer: null
        },

        wolfVoice: new Set()
      };

      rooms.set(
        room.code,
        room
      );
    }

    if (
      room.players.length >= 20
    ) {

      return sendError(
        socket,
        "Phòng đã đủ 20 người."
      );

    }

    const player = {
      id: socket.id,
      name,
      alive: true,
      ready: false,
      role: null
    };

    room.players.push(player);

    socket.join(room.code);

    socket.data.roomCode =
      room.code;

    socket.emit(
      "loginSuccess",
      {
        room:
          getPublicRoom(room),

        players:
          getPublicPlayers(room),

        isHost:
          room.hostId === socket.id
      }
    );

    broadcastRoom(room);

    console.log(
      `${name} vào phòng ${room.code}`
    );

  });

  // ---------------------------------------------------
  // START GAME
  // ---------------------------------------------------

  socket.on("startGame", data => {

    const roomCode =
      String(data?.roomCode || "")
        .toUpperCase();

    const room =
      rooms.get(roomCode);

    if (!room) {

      return sendError(
        socket,
        "Không tìm thấy phòng."
      );

    }

    if (
      room.hostId !== socket.id
    ) {

      return sendError(
        socket,
        "Chỉ Host mới có thể bắt đầu."
      );

    }

    if (
      room.players.length < 4
    ) {

      return sendError(
        socket,
        "Cần ít nhất 4 người."
      );

    }

    const wolfCount =
      Number(data?.wolfCount) || 1;

    assignRoles(
      room,
      wolfCount
    );

    room.phase = "night";
    room.day = 1;
    room.votes.clear();
    room.wolfTarget = null;

    // gửi gameStarted RIÊNG từng người
    room.players.forEach(player => {

      const targetSocket =
        io.sockets.sockets.get(
          player.id
        );

      if (!targetSocket) return;

      targetSocket.emit(
        "gameStarted",
        {
          room:
            getPublicRoom(room),

          players:
            getPublicPlayers(room),

          role:
            player.role
        }
      );

      targetSocket.emit(
        "roleAssigned",
        {
          role:
            player.role
        }
      );

    });

    broadcastRoom(room);

    io.to(room.code).emit(
      "phaseChanged",
      {
        phase: "night",
        players:
          getPublicPlayers(room),

        message:
          "🌙 Đêm bắt đầu."
      }
    );

    console.log(
      `Game ${room.code} bắt đầu`
    );

  });

  // ---------------------------------------------------
  // WOLF KILL
  // ---------------------------------------------------

  socket.on("wolfKill", data => {

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
      player.role !== "Sói"
    ) {

      return sendError(
        socket,
        "Bạn không phải Sói."
      );

    }

    if (!player.alive) {

      return sendError(
        socket,
        "Bạn đã chết."
      );

    }

    const targetId =
      String(data?.targetId || "");

    const target =
      room.players.find(
        p =>
          p.id === targetId
      );

    if (!target) return;

    if (!target.alive) {

      return sendError(
        socket,
        "Người chơi đã chết."
      );

    }

    if (
      target.role === "Sói"
    ) {

      return sendError(
        socket,
        "Sói không thể giết Sói."
      );

    }

    room.wolfTarget =
      targetId;

    io.to(room.code).emit(
      "wolfVoteUpdate",
      {
        targetId
      }
    );

  });

  // ---------------------------------------------------
  // VOTE
  // ---------------------------------------------------

  socket.on("vote", data => {

    const room =
      getRoom(socket);

    if (!room) return;

    if (
      room.phase !== "dayVote"
    ) {

      return sendError(
        socket,
        "Chưa đến thời gian bỏ phiếu."
      );

    }

    const player =
      getPlayer(
        room,
        socket.id
      );

    if (!player) return;

    if (!player.alive) {

      return sendError(
        socket,
        "Bạn đã chết."
      );

    }

    const targetId =
      String(data?.targetId || "");

    const target =
      room.players.find(
        p => p.id === targetId
      );

    if (!target || !target.alive) {

      return sendError(
        socket,
        "Mục tiêu không hợp lệ."
      );

    }

    room.votes.set(
      socket.id,
      targetId
    );

    io.to(room.code).emit(
      "voteUpdate",
      {
        votes:
          getVoteList(room)
      }
    );

  });

  // ---------------------------------------------------
  // NEXT PHASE
  // ---------------------------------------------------

  socket.on("nextPhase", data => {

    const roomCode =
      String(data?.roomCode || "")
        .toUpperCase();

    const room =
      rooms.get(roomCode);

    if (!room) return;

    if (
      room.hostId !== socket.id
    ) {

      return sendError(
        socket,
        "Chỉ Host mới được chuyển phase."
      );

    }

    // -----------------------------------------------
    // NIGHT → DAY
    // -----------------------------------------------

    if (room.phase === "night") {

      if (room.wolfTarget) {

        const target =
          room.players.find(
            p =>
              p.id ===
              room.wolfTarget
          );

        if (
          target &&
          target.alive
        ) {

          target.alive = false;

          io.to(room.code).emit(
            "nightResult",
            {
              players:
                getPublicPlayers(room),

              message:
                `🌙 Đêm qua ${target.name} đã bị Sói tấn công.`
            }
          );

          const deadSocket =
            io.sockets.sockets.get(
              target.id
            );

          if (deadSocket) {

            deadSocket.emit(
              "dead",
              {
                nightActions: [
                  {
                    text:
                      "Bạn đã chết trong đêm."
                  }
                ]
              }
            );

          }

        }

      } else {

        io.to(room.code).emit(
          "nightResult",
          {
            players:
              getPublicPlayers(room),

            message:
              "🌙 Đêm qua không có ai chết."
          }
        );

      }

      room.wolfTarget = null;

      const winner =
        checkWinner(room);

      if (winner) {

        room.phase = "gameover";

        io.to(room.code).emit(
          "gameEnded",
          {
            message: winner
          }
        );

        return;
      }

      room.phase = "day";

      io.to(room.code).emit(
        "phaseChanged",
        {
          phase: "day",
          players:
            getPublicPlayers(room),

          message:
            "☀️ Trời sáng."
        }
      );

      broadcastRoom(room);

      return;
    }

    // -----------------------------------------------
    // DAY → DAY VOTE
    // -----------------------------------------------

    if (room.phase === "day") {

      room.phase = "dayVote";
      room.votes.clear();

      io.to(room.code).emit(
        "phaseChanged",
        {
          phase: "dayVote",
          players:
            getPublicPlayers(room),

          message:
            "🗳️ Bắt đầu bỏ phiếu."
        }
      );

      io.to(room.code).emit(
        "voteUpdate",
        {
          votes: []
        }
      );

      return;
    }

    // -----------------------------------------------
    // DAY VOTE → NIGHT
    // -----------------------------------------------

    if (
      room.phase === "dayVote"
    ) {

      const counts = {};

      for (
        const targetId of
        room.votes.values()
      ) {

        counts[targetId] =
          (counts[targetId] || 0) + 1;

      }

      let eliminatedId = null;
      let maxVotes = 0;

      Object.entries(counts)
        .forEach(
          ([targetId, count]) => {

            if (
              count > maxVotes
            ) {

              maxVotes =
                count;

              eliminatedId =
                targetId;
            }

          }
        );

      let message =
        "🗳️ Không có ai bị loại.";

      if (eliminatedId) {

        const target =
          room.players.find(
            p =>
              p.id ===
              eliminatedId
          );

        if (target) {

          target.alive = false;

          message =
            `🗳️ ${target.name} đã bị dân làng treo cổ.`;

          const deadSocket =
            io.sockets.sockets.get(
              target.id
            );

          if (deadSocket) {

            deadSocket.emit(
              "dead",
              {
                nightActions: [
                  {
                    text:
                      "Bạn đã bị loại bởi phiếu vote."
                  }
                ]
              }
            );

          }

        }

      }

      io.to(room.code).emit(
        "voteResult",
        {
          players:
            getPublicPlayers(room),

          votes:
            getVoteList(room),

          message
        }
      );

      room.votes.clear();

      const winner =
        checkWinner(room);

      if (winner) {

        room.phase = "gameover";

        io.to(room.code).emit(
          "gameEnded",
          {
            message: winner
          }
        );

        return;
      }

      room.day++;

      room.phase = "night";

      room.wolfTarget = null;

      io.to(room.code).emit(
        "phaseChanged",
        {
          phase: "night",
          players:
            getPublicPlayers(room),

          message:
            `🌙 Đêm ${room.day} bắt đầu.`
        }
      );

      broadcastRoom(room);

      return;
    }

  });

  // ---------------------------------------------------
  // END GAME
  // ---------------------------------------------------

  socket.on("endGame", data => {

    const roomCode =
      String(data?.roomCode || "")
        .toUpperCase();

    const room =
      rooms.get(roomCode);

    if (!room) return;

    if (
      room.hostId !== socket.id
    ) {

      return sendError(
        socket,
        "Chỉ Host mới có thể kết thúc game."
      );

    }

    room.phase =
      "gameover";

    io.to(room.code).emit(
      "gameEnded",
      {
        message:
          "🛑 Host đã kết thúc game."
      }
    );

  });

  // ===================================================
  // DAY VOICE
  // ===================================================

  socket.on("voiceStart", () => {

    const room =
      getRoom(socket);

    if (!room) return;

    const player =
      getPlayer(
        room,
        socket.id
      );

    if (!player || !player.alive)
      return;

    io.to(room.code).emit(
      "voiceStatus",
      {
        message:
          `🎙️ ${player.name} đang phát biểu.`
      }
    );

  });

  socket.on("voiceStop", () => {

    const room =
      getRoom(socket);

    if (!room) return;

    io.to(room.code).emit(
      "voiceStatus",
      {
        message:
          "⏹️ Đã dừng microphone."
      }
    );

  });

  // ===================================================
  // WOLF VOICE
  // ===================================================

  socket.on("wolfVoiceJoin", data => {

    const room =
      getRoom(socket);

    if (!room) return;

    const player =
      getPlayer(
        room,
        socket.id
      );

    if (
      !player ||
      player.role !== "Sói" ||
      !player.alive
    ) {

      return sendError(
        socket,
        "Bạn không phải Sói còn sống."
      );

    }

    room.wolfVoice.add(
      socket.id
    );

    const wolves =
      [...room.wolfVoice]
        .map(id => {

          const p =
            room.players.find(
              player =>
                player.id === id
            );

          if (!p) return null;

          return {
            id: p.id,
            name: p.name,
            alive: p.alive
          };

        })
        .filter(Boolean);

    io.to(room.code).emit(
      "wolfVoiceMembers",
      {
        players: wolves
      }
    );

  });

  socket.on("wolfVoiceLeave", () => {

    const room =
      getRoom(socket);

    if (!room) return;

    room.wolfVoice.delete(
      socket.id
    );

    io.to(room.code).emit(
      "wolfVoiceLeft",
      {
        playerId:
          socket.id
      }
    );

    const wolves =
      [...room.wolfVoice]
        .map(id => {

          const p =
            room.players.find(
              player =>
                player.id === id
            );

          if (!p) return null;

          return {
            id: p.id,
            name: p.name,
            alive: p.alive
          };

        })
        .filter(Boolean);

    io.to(room.code).emit(
      "wolfVoiceMembers",
      {
        players: wolves
      }
    );

  });

  socket.on("wolfVoiceStatus", data => {

    const room =
      getRoom(socket);

    if (!room) return;

    const player =
      getPlayer(
        room,
        socket.id
      );

    if (!player) return;

    io.to(room.code).emit(
      "wolfVoiceStatus",
      {
        playerId:
          socket.id,

        name:
          player.name,

        enabled:
          Boolean(data?.enabled)
      }
    );

  });

  // ---------------------------------------------------
  // WEBRTC SIGNAL
  // ---------------------------------------------------

  socket.on(
    "wolfVoiceSignal",
    data => {

      const targetId =
        data?.targetId;

      if (!targetId) return;

      io.to(String(targetId)).emit(
        "wolfVoiceSignal",
        {
          fromId:
            socket.id,

          senderId:
            socket.id,

          signal:
            data.signal
        }
      );

    }
  );

  // ---------------------------------------------------
  // DISCONNECT
  // ---------------------------------------------------

  socket.on("disconnect", () => {

    console.log(
      "Disconnected:",
      socket.id
    );

    const room =
      getRoom(socket);

    if (!room) return;

    room.wolfVoice.delete(
      socket.id
    );

    const index =
      room.players.findIndex(
        p =>
          p.id === socket.id
      );

    if (index !== -1) {

      const player =
        room.players[index];

      room.players.splice(
        index,
        1
      );

      // Chuyển host
      if (
        room.hostId === socket.id &&
        room.players.length
      ) {

        room.hostId =
          room.players[0].id;

      }

    }

    if (
      room.players.length === 0
    ) {

      rooms.delete(
        room.code
      );

      return;

    }

    io.to(room.code).emit(
      "wolfVoiceLeft",
      {
        playerId:
          socket.id
      }
    );

    broadcastRoom(room);

  });

});

// =====================================================
// START
// =====================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================="
    );

    console.log(
      "     MA SOI ONLINE SERVER"
    );

    console.log(
      "================================="
    );

    console.log(
      `PORT: ${PORT}`
    );

    console.log(
      `Health: /health`
    );

    console.log(
      "Socket.IO: ON"
    );

    console.log(
      "WebRTC signaling: ON"
    );

    console.log(
      "================================="
    );

  }
);
