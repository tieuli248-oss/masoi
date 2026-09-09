const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🐺 Ma Sói Online Server đang hoạt động.");
});

const rooms = new Map();
let roomCounter = 1;

/* =====================================================
   TIỆN ÍCH
===================================================== */

function randomRoomCode() {
  let code;

  do {
    code = String(
      Math.floor(100000 + Math.random() * 900000)
    );
  } while (
    [...rooms.values()].some(room => room.code === code)
  );

  return code;
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function getRoomByCode(code) {
  if (!code) return null;

  return [...rooms.values()].find(
    room => String(room.code) === String(code)
  ) || null;
}

function getRoom(socket) {
  if (!socket.data.roomId) {
    return null;
  }

  return rooms.get(socket.data.roomId) || null;
}

function getPlayerBySocket(room, socketId) {
  return [...room.players.values()].find(
    player => player.socketId === socketId
  ) || null;
}

function getPlayer(room, playerId) {
  return room.players.get(playerId) || null;
}

function alivePlayers(room) {
  return [...room.players.values()].filter(
    player => player.alive
  );
}

function aliveByRole(room, role) {
  return alivePlayers(room).filter(
    player => player.role === role
  );
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    alive: player.alive,
    isHost: player.isHost
  };
}

function publicPlayers(room) {
  return [...room.players.values()]
    .map(publicPlayer);
}

function publicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    started: room.started,
    gameOver: room.gameOver,
    phase: room.phase,
    nightNumber: room.nightNumber,
    players: publicPlayers(room),
    logs: room.logs.slice(-60)
  };
}

function addLog(room, text) {
  room.logs.push({
    text,
    time: Date.now()
  });

  if (room.logs.length > 100) {
    room.logs.shift();
  }
}

function broadcastRoom(room) {
  io.to(room.id).emit("roomUpdate", {
    room: publicRoom(room),
    players: publicPlayers(room)
  });
}

function broadcastPlayers(room) {
  io.to(room.id).emit("playersUpdate", {
    players: publicPlayers(room)
  });
}

/* =====================================================
   TẠO PHÒNG
===================================================== */

function createRoom(hostSocket, hostName) {
  const room = {
    id: `room_${roomCounter++}`,

    code: randomRoomCode(),

    hostSocketId: hostSocket.id,

    players: new Map(),

    started: false,
    gameOver: false,
    phase: "lobby",

    nightNumber: 0,

    timer: null,
    phaseEndsAt: null,

    speakingQueue: [],
    speakingIndex: 0,

    wolfVotes: new Map(),
    dayVotes: new Map(),

    nightActions: {
      wolfTargetId: null,
      seerTargetId: null,
      seerUsed: false,
      guardTargetId: null,
      witchSave: false,
      witchPoisonTargetId: null
    },

    witch: {
      saveUsed: false,
      poisonUsed: false
    },

    logs: []
  };

  const host = {
    id: `p_${hostSocket.id}`,
    socketId: hostSocket.id,
    name: hostName,
    alive: true,
    role: null,
    isHost: true
  };

  room.players.set(host.id, host);

  rooms.set(room.id, room);

  return room;
}

/* =====================================================
   TIMER
===================================================== */

function stopTimer(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }

  room.phaseEndsAt = null;
}

function remainingTime(room) {
  if (!room.phaseEndsAt) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil(
      (room.phaseEndsAt - Date.now()) / 1000
    )
  );
}

function startTimer(room, seconds, callback) {
  stopTimer(room);

  room.phaseEndsAt =
    Date.now() + seconds * 1000;

  io.to(room.id).emit("phaseTimer", {
    seconds,
    remaining: seconds
  });

  room.timer = setInterval(() => {
    const remaining =
      remainingTime(room);

    io.to(room.id).emit("phaseTimer", {
      seconds,
      remaining
    });

    if (remaining <= 0) {
      stopTimer(room);
      callback();
    }
  }, 250);
}

/* =====================================================
   CƠ CẤU VAI
===================================================== */

function getRoleConfiguration(playerCount) {
  let wolves = 0;

  const roles = [];

  if (playerCount >= 6 && playerCount <= 9) {
    wolves = 2;

    roles.push(
      "Tiên tri",
      "Bảo vệ"
    );

    /*
     * 6-7:
     * 1 vai hỗ trợ: Phù thủy
     *
     * 8-9:
     * 1 vai hỗ trợ: Phù thủy
     *
     * Người dùng cho phép Bảo vệ hoặc Phù thủy,
     * ở đây chọn Phù thủy để bộ 6-9 có thêm vai.
     */
    roles.push("Phù thủy");
  }

  if (playerCount >= 10 && playerCount <= 11) {
    wolves =
      playerCount === 10
        ? 2
        : 3;

    roles.push(
      "Tiên tri",
      "Bảo vệ",
      "Phù thủy"
    );
  }

  if (playerCount >= 12 && playerCount <= 14) {
    wolves = 3;

    roles.push(
      "Tiên tri",
      "Bảo vệ",
      "Phù thủy",
      "Thợ săn"
    );
  }

  if (playerCount >= 15 && playerCount <= 17) {
    wolves =
      playerCount === 15
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

  if (playerCount >= 18 && playerCount <= 20) {
    wolves = 4;

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
   * Nếu số người dưới 6,
   * game không cho bắt đầu.
   */

  for (let i = 0; i < wolves; i++) {
    roles.unshift("Sói");
  }

  while (roles.length < playerCount) {
    roles.push("Dân làng");
  }

  if (roles.length > playerCount) {
    return roles.slice(0, playerCount);
  }

  return roles;
}

function assignRoles(room) {
  const players =
    shuffle([...room.players.values()]);

  const roles =
    shuffle(
      getRoleConfiguration(
        players.length
      )
    );

  players.forEach((player, index) => {
    player.role = roles[index];
    player.alive = true;
  });
}

function sendPrivateRoles(room) {
  for (const player of room.players.values()) {
    const socket =
      io.sockets.sockets.get(
        player.socketId
      );

    if (!socket) continue;

    socket.emit("roleAssigned", {
      role: player.role
    });
  }
}

/* =====================================================
   THẮNG
===================================================== */

function checkWinner(room) {
  const alive =
    alivePlayers(room);

  const wolves =
    alive.filter(
      player =>
        player.role === "Sói"
    );

  const nonWolves =
    alive.filter(
      player =>
        player.role !== "Sói"
    );

  if (wolves.length === 0) {
    endGame(
      room,
      "🎉 Dân làng thắng!"
    );

    return true;
  }

  if (
    wolves.length >= nonWolves.length
  ) {
    endGame(
      room,
      "🐺 Sói thắng!"
    );

    return true;
  }

  return false;
}

function endGame(room, message) {
  if (room.gameOver) {
    return;
  }

  stopTimer(room);

  room.gameOver = true;
  room.started = false;
  room.phase = "gameOver";

  addLog(
    room,
    message
  );

  io.to(room.id).emit(
    "gameEnded",
    {
      message,

      players:
        [...room.players.values()]
          .map(player => ({
            ...publicPlayer(player),
            role: player.role
          }))
    }
  );

  broadcastRoom(room);
}

/* =====================================================
   CHẾT
===================================================== */

function killPlayer(room, player, reason) {
  if (!player || !player.alive) {
    return;
  }

  player.alive = false;

  addLog(
    room,
    `☠️ ${player.name} đã chết${reason ? ` (${reason})` : ""}.`
  );

  io.to(player.socketId).emit(
    "dead",
    {
      playerId: player.id,
      message: "Bạn đã chết."
    }
  );

  broadcastPlayers(room);
}

/* =====================================================
   ĐÊM
===================================================== */

function resetNight(room) {
  room.wolfVotes.clear();

  room.nightActions = {
    wolfTargetId: null,
    seerTargetId: null,
    seerUsed: false,
    guardTargetId: null,
    witchSave: false,
    witchPoisonTargetId: null
  };
}

function beginNight(room) {
  if (
    !room.started ||
    room.gameOver
  ) {
    return;
  }

  if (checkWinner(room)) {
    return;
  }

  resetNight(room);

  room.nightNumber += 1;
  room.phase = "night";

  addLog(
    room,
    `🌙 Đêm ${room.nightNumber} bắt đầu.`
  );

  io.to(room.id).emit(
    "phaseChanged",
    {
      phase: "night",
      nightNumber:
        room.nightNumber,
      players:
        publicPlayers(room)
    }
  );

  /*
   * Chỉ để giao diện biết Sói bắt đầu đêm.
   * Không gửi dữ liệu riêng tư của mục tiêu.
   */
  for (
    const wolf of aliveByRole(room, "Sói")
  ) {
    io.to(wolf.socketId).emit(
      "wolfNightStarted",
      {
        nightNumber:
          room.nightNumber
      }
    );
  }

  startTimer(
    room,
    60,
    () => {
      resolveNight(room);
    }
  );
}

function resolveNight(room) {
  if (
    !room.started ||
    room.gameOver
  ) {
    return;
  }

  const wolfTarget =
    getPlayer(
      room,
      room.nightActions.wolfTargetId
    );

  const guardTarget =
    getPlayer(
      room,
      room.nightActions.guardTargetId
    );

  const poisonTarget =
    getPlayer(
      room,
      room.nightActions.witchPoisonTargetId
    );

  const deaths = [];

  /*
   * Sói cắn
   */
  if (
    wolfTarget &&
    wolfTarget.alive &&
    (!guardTarget ||
      guardTarget.id !== wolfTarget.id) &&
    !room.nightActions.witchSave
  ) {
    killPlayer(
      room,
      wolfTarget,
      "bị Sói cắn"
    );

    deaths.push(
      wolfTarget
    );
  }

  /*
   * Phù thủy độc
   */
  if (
    poisonTarget &&
    poisonTarget.alive
  ) {
    if (
      !deaths.some(
        player =>
          player.id ===
          poisonTarget.id
      )
    ) {
      killPlayer(
        room,
        poisonTarget,
        "bị Phù thủy hạ độc"
      );

      deaths.push(
        poisonTarget
      );
    }
  }

  io.to(room.id).emit(
    "nightResult",
    {
      message:
        deaths.length > 0
          ? `☠️ Đêm qua có ${deaths.length} người chết.`
          : "🌙 Đêm qua không có ai chết.",

      deaths:
        deaths.map(player => ({
          id: player.id,
          name: player.name
        })),

      players:
        publicPlayers(room)
    }
  );

  if (checkWinner(room)) {
    return;
  }

  setTimeout(
    () => beginDaySpeech(room),
    2500
  );
}

/* =====================================================
   NGÀY
===================================================== */

function beginDaySpeech(room) {
  if (
    !room.started ||
    room.gameOver
  ) {
    return;
  }

  room.phase = "daySpeech";

  room.speakingQueue =
    shuffle(
      alivePlayers(room)
        .map(player => player.id)
    );

  room.speakingIndex = 0;

  addLog(
    room,
    "☀️ Bắt đầu ban ngày."
  );

  io.to(room.id).emit(
    "phaseChanged",
    {
      phase: "daySpeech",
      players:
        publicPlayers(room)
    }
  );

  startNextSpeaker(room);
}

function startNextSpeaker(room) {
  while (
    room.speakingIndex <
    room.speakingQueue.length
  ) {
    const playerId =
      room.speakingQueue[
        room.speakingIndex
      ];

    const player =
      getPlayer(
        room,
        playerId
      );

    if (
      player &&
      player.alive
    ) {
      io.to(room.id).emit(
        "voiceTurn",
        {
          playerId:
            player.id,

          playerName:
            player.name,

          round:
            room.speakingIndex + 1,

          seconds: 30
        }
      );

      startTimer(
        room,
        30,
        () => {
          io.to(room.id).emit(
            "voiceEnded",
            {
              playerId:
                player.id
            }
          );

          room.speakingIndex++;

          startNextSpeaker(room);
        }
      );

      return;
    }

    room.speakingIndex++;
  }

  beginDayVote(room);
}

/* =====================================================
   BỎ PHIẾU
===================================================== */

function beginDayVote(room) {
  if (
    !room.started ||
    room.gameOver
  ) {
    return;
  }

  room.phase = "dayVote";
  room.dayVotes.clear();

  addLog(
    room,
    "🗳️ Bắt đầu bỏ phiếu."
  );

  io.to(room.id).emit(
    "phaseChanged",
    {
      phase: "dayVote",
      players:
        publicPlayers(room)
    }
  );

  io.to(room.id).emit(
    "voteUpdate",
    {
      votes: []
    }
  );

  startTimer(
    room,
    30,
    () => {
      resolveDayVote(room);
    }
  );
}

function resolveDayVote(room) {
  const counts =
    new Map();

  for (
    const targetId
    of room.dayVotes.values()
  ) {
    counts.set(
      targetId,
      (counts.get(targetId) || 0) + 1
    );
  }

  let bestTargetId = null;
  let bestCount = 0;
  let tie = false;

  for (
    const [targetId, count]
    of counts.entries()
  ) {
    if (
      count >
      bestCount
    ) {
      bestTargetId =
        targetId;

      bestCount =
        count;

      tie = false;
    } else if (
      count === bestCount &&
      count > 0
    ) {
      tie = true;
    }
  }

  let executed = null;

  if (
    bestTargetId &&
    !tie
  ) {
    const target =
      getPlayer(
        room,
        bestTargetId
      );

    if (
      target &&
      target.alive
    ) {
      killPlayer(
        room,
        target,
        "bị dân làng bỏ phiếu"
      );

      executed = {
        id: target.id,
        name: target.name
      };
    }
  }

  io.to(room.id).emit(
    "voteResult",
    {
      executed,

      players:
        publicPlayers(room)
    }
  );

  if (checkWinner(room)) {
    return;
  }

  setTimeout(
    () => beginNight(room),
    2500
  );
}

/* =====================================================
   SOCKET
===================================================== */

io.on("connection", socket => {

  socket.data.roomId = null;
  socket.data.hasEntered = false;

  /*
   * =========================================
   * NGƯỜI ĐẦU TIÊN VÀO WEB
   * =========================================
   */

  socket.on(
    "enterGame",
    ({ name }) => {

      if (socket.data.hasEntered) {
        return;
      }

      const cleanName =
        String(
          name || ""
        )
          .trim()
          .slice(0, 30);

      if (!cleanName) {
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
       * Tìm phòng lobby hiện tại.
       *
       * Chưa có phòng:
       * người đầu tiên tạo phòng = Host.
       *
       * Đã có phòng:
       * người sau vào phòng đó = Player.
       */

      let room =
        [...rooms.values()]
          .find(
            r =>
              !r.started &&
              !r.gameOver &&
              r.phase === "lobby"
          );

      let isHost = false;

      if (!room) {
        room =
          createRoom(
            socket,
            cleanName
          );

        isHost = true;
      } else {

        if (
          room.players.size >= 20
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

        const player = {
          id:
            `p_${socket.id}`,

          socketId:
            socket.id,

          name:
            cleanName,

          alive: true,

          role: null,

          isHost: false
        };

        room.players.set(
          player.id,
          player
        );
      }

      const player =
        getPlayerBySocket(
          room,
          socket.id
        );

      socket.join(room.id);

      socket.data.roomId =
        room.id;

      socket.data.hasEntered =
        true;

      socket.emit(
        "enteredGame",
        {
          room:
            publicRoom(room),

          yourPlayerId:
            player.id,

          yourName:
            player.name,

          isHost:
            player.isHost
        }
      );

      addLog(
        room,
        `${player.name} đã vào phòng.`
      );

      broadcastRoom(room);
    }
  );

  /*
   * =========================================
   * BẮT ĐẦU GAME
   * =========================================
   */

  socket.on(
    "startGame",
    () => {

      const room =
        getRoom(socket);

      if (!room) {
        return;
      }

      const host =
        getPlayerBySocket(
          room,
          socket.id
        );

      if (
        !host ||
        !host.isHost
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
        room.started
      ) {
        return;
      }

      /*
       * Theo cơ cấu bạn đưa:
       * game bắt đầu từ 6 người.
       */
      if (
        room.players.size < 6
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
        room.players.size > 20
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

      room.started = true;
      room.gameOver = false;
      room.phase = "night";
      room.nightNumber = 0;

      for (
        const player
        of room.players.values()
      ) {
        player.alive = true;
        player.role = null;
      }

      assignRoles(room);
      sendPrivateRoles(room);

      io.to(room.id).emit(
        "gameStarted",
        {
          room:
            publicRoom(room),

          players:
            publicPlayers(room)
        }
      );

      broadcastRoom(room);

      setTimeout(
        () => beginNight(room),
        1000
      );
    }
  );

  /*
   * =========================================
   * SÓI
   * =========================================
   */

  socket.on(
    "wolfKill",
    ({ targetId }) => {

      const room =
        getRoom(socket);

      if (
        !room ||
        room.phase !== "night"
      ) {
        return;
      }

      const wolf =
        getPlayerBySocket(
          room,
          socket.id
        );

      const target =
        getPlayer(
          room,
          targetId
        );

      if (
        !wolf ||
        !wolf.alive ||
        wolf.role !== "Sói" ||
        !target ||
        !target.alive ||
        target.role === "Sói"
      ) {
        return;
      }

      room.wolfVotes.set(
        wolf.id,
        target.id
      );

      const counts =
        new Map();

      for (
        const targetId
        of room.wolfVotes.values()
      ) {
        counts.set(
          targetId,
          (counts.get(targetId) || 0) + 1
        );
      }

      let selectedId = null;
      let selectedCount = 0;

      for (
        const [id, count]
        of counts.entries()
      ) {
        if (
          count >
          selectedCount
        ) {
          selectedId = id;
          selectedCount = count;
        }
      }

      room.nightActions
        .wolfTargetId =
        selectedId;

      socket.emit(
        "actionAccepted",
        {
          action:
            "wolfKill",

          targetId
        }
      );

      /*
       * Chỉ gửi trạng thái vote cho Sói.
       */
      for (
        const otherWolf
        of aliveByRole(
          room,
          "Sói"
        )
      ) {
        io.to(
          otherWolf.socketId
        ).emit(
          "wolfVoteUpdate",
          {
            votes:
              [...counts.entries()]
                .map(
                  ([id, count]) => ({
                    targetId:
                      id,

                    targetName:
                      getPlayer(
                        room,
                        id
                      )?.name ||
                      "",

                    count
                  })
                )
          }
        );
      }
    }
  );

  /*
   * =========================================
   * TIÊN TRI
   * =========================================
   */

  socket.on(
    "seerInspect",
    ({ targetId }) => {

      const room =
        getRoom(socket);

      if (
        !room ||
        room.phase !== "night"
      ) {
        return;
      }

      const seer =
        getPlayerBySocket(
          room,
          socket.id
        );

      const target =
        getPlayer(
          room,
          targetId
        );

      if (
        !seer ||
        !seer.alive ||
        seer.role !== "Tiên tri"
      ) {
        return;
      }

      /*
       * 1 lần / đêm
       */
      if (
        room.nightActions
          .seerUsed
      ) {
        socket.emit(
          "seerError",
          {
            message:
              "🔮 Bạn đã soi người trong đêm này."
          }
        );

        return;
      }

      if (
        !target ||
        !target.alive ||
        target.id === seer.id
      ) {
        return;
      }

      room.nightActions
        .seerUsed =
        true;

      room.nightActions
        .seerTargetId =
        target.id;

      /*
       * Luật:
       *
       * Dân làng = Thiện
       * Mọi vai khác = Không rõ
       *
       * Theo yêu cầu của bạn:
       * Sói cũng = Không rõ.
       */

      let result;

      if (
        target.role ===
        "Dân làng"
      ) {
        result =
          "Thiện";
      } else {
        result =
          "Không rõ";
      }

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

  /*
   * =========================================
   * BẢO VỆ
   * =========================================
   */

  socket.on(
    "guardProtect",
    ({ targetId }) => {

      const room =
        getRoom(socket);

      if (
        !room ||
        room.phase !== "night"
      ) {
        return;
      }

      const guard =
        getPlayerBySocket(
          room,
          socket.id
        );

      const target =
        getPlayer(
          room,
          targetId
        );

      if (
        !guard ||
        !guard.alive ||
        guard.role !==
          "Bảo vệ" ||
        !target ||
        !target.alive
      ) {
        return;
      }

      room.nightActions
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

  /*
   * =========================================
   * PHÙ THỦY - CỨU
   * =========================================
   */

  socket.on(
    "witchSave",
    () => {

      const room =
        getRoom(socket);

      if (
        !room ||
        room.phase !== "night"
      ) {
        return;
      }

      const witch =
        getPlayerBySocket(
          room,
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
        room.witch.saveUsed
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

      /*
       * Chỉ cứu nếu Sói
       * đã có mục tiêu.
       */
      if (
        !room.nightActions
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

      room.witch.saveUsed =
        true;

      room.nightActions
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

  /*
   * =========================================
   * PHÙ THỦY - ĐỘC
   * =========================================
   */

  socket.on(
    "witchPoison",
    ({ targetId }) => {

      const room =
        getRoom(socket);

      if (
        !room ||
        room.phase !== "night"
      ) {
        return;
      }

      const witch =
        getPlayerBySocket(
          room,
          socket.id
        );

      const target =
        getPlayer(
          room,
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
        room.witch.poisonUsed
      ) {
        return;
      }

      if (
        !target ||
        !target.alive ||
        target.id === witch.id
      ) {
        return;
      }

      room.witch.poisonUsed =
        true;

      room.nightActions
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

  /*
   * =========================================
   * BỎ PHIẾU
   * =========================================
   */

  socket.on(
    "vote",
    ({ targetId }) => {

      const room =
        getRoom(socket);

      if (
        !room ||
        room.phase !== "dayVote"
      ) {
        return;
      }

      const voter =
        getPlayerBySocket(
          room,
          socket.id
        );

      const target =
        getPlayer(
          room,
          targetId
        );

      if (
        !voter ||
        !voter.alive ||
        !target ||
        !target.alive ||
        target.id === voter.id
      ) {
        return;
      }

      room.dayVotes.set(
        voter.id,
        target.id
      );

      const votes =
        [...room.dayVotes.entries()]
          .map(
            ([voterId, targetId]) => ({
              voterId,

              voterName:
                getPlayer(
                  room,
                  voterId
                )?.name || "",

              targetId,

              targetName:
                getPlayer(
                  room,
                  targetId
                )?.name || ""
            })
          );

      /*
       * Vote ngày được tất cả
       * người sống nhìn thấy.
       */
      io.to(room.id).emit(
        "voteUpdate",
        {
          votes
        }
      );
    }
  );

  /*
   * =========================================
   * CHAT
   * =========================================
   */

  socket.on(
    "chatMessage",
    ({ message }) => {

      const room =
        getRoom(socket);

      if (!room) {
        return;
      }

      const player =
        getPlayerBySocket(
          room,
          socket.id
        );

      /*
       * Người chết tuyệt đối không chat.
       */
      if (
        !player ||
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
          .slice(0, 300);

      if (!text) {
        return;
      }

      /*
       * BAN NGÀY
       *
       * Người sống:
       * tất cả cùng thấy.
       *
       * Tiên tri cũng là người sống.
       */
      if (
        room.phase ===
          "daySpeech" ||
        room.phase ===
          "dayVote"
      ) {

        io.to(room.id).emit(
          "chatMessage",
          {
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
          }
        );

        return;
      }

      /*
       * BAN ĐÊM
       *
       * Chỉ Sói ↔ Sói.
       */
      if (
        room.phase === "night" &&
        player.role === "Sói"
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

        for (
          const wolf
          of aliveByRole(
            room,
            "Sói"
          )
        ) {

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

  /*
   * =========================================
   * HOST KẾT THÚC GAME
   * =========================================
   */

  socket.on(
    "endGame",
    () => {

      const room =
        getRoom(socket);

      if (!room) {
        return;
      }

      const host =
        getPlayerBySocket(
          room,
          socket.id
        );

      if (
        !host ||
        !host.isHost
      ) {
        return;
      }

      endGame(
        room,
        "🛑 Host đã kết thúc game."
      );
    }
  );

  /*
   * =========================================
   * HOST CHUYỂN PHA
   * =========================================
   */

  socket.on(
    "forceNextPhase",
    () => {

      const room =
        getRoom(socket);

      if (!room) {
        return;
      }

      const host =
        getPlayerBySocket(
          room,
          socket.id
        );

      if (
        !host ||
        !host.isHost
      ) {
        return;
      }

      if (
        room.phase === "night"
      ) {

        stopTimer(room);

        resolveNight(room);

        return;
      }

      if (
        room.phase === "daySpeech"
      ) {

        stopTimer(room);

        room.speakingIndex =
          room.speakingQueue.length;

        startNextSpeaker(room);

        return;
      }

      if (
        room.phase === "dayVote"
      ) {

        stopTimer(room);

        resolveDayVote(room);
      }
    }
  );

  /*
   * =========================================
   * THOÁT PHÒNG
   * =========================================
   */

  socket.on(
    "leaveRoom",
    () => {

      const room =
        getRoom(socket);

      if (!room) {

        socket.emit(
          "leftRoom"
        );

        return;
      }

      const player =
        getPlayerBySocket(
          room,
          socket.id
        );

      if (!player) {

        socket.data.roomId =
          null;

        socket.emit(
          "leftRoom"
        );

        return;
      }

      /*
       * HOST thoát:
       *
       * - phòng đóng
       * - game kết thúc
       * - tất cả người bị đưa ra ngoài
       */
      if (
        player.isHost
      ) {

        stopTimer(room);

        io.to(room.id).emit(
          "roomClosed",
          {
            message:
              "👑 Host đã thoát. Phòng đã đóng."
          }
        );

        io.in(room.id)
          .socketsLeave(room.id);

        rooms.delete(
          room.id
        );

        for (
          const s
          of io.sockets.sockets.values()
        ) {
          if (
            s.data.roomId ===
            room.id
          ) {
            s.data.roomId =
              null;

            s.data.hasEntered =
              false;
          }
        }

        return;
      }

      /*
       * Người chơi bình thường
       */
      room.players.delete(
        player.id
      );

      room.dayVotes.delete(
        player.id
      );

      room.wolfVotes.delete(
        player.id
      );

      socket.leave(
        room.id
      );

      socket.data.roomId =
        null;

      socket.data.hasEntered =
        false;

      addLog(
        room,
        `${player.name} đã rời phòng.`
      );

      sendPlayers(room);
      broadcastRoom(room);

      socket.emit(
        "leftRoom"
      );
    }
  );

  /*
   * =========================================
   * DISCONNECT
   * =========================================
   */

  socket.on(
    "disconnect",
    () => {

      const room =
        getRoom(socket);

      if (!room) {
        return;
      }

      const player =
        getPlayerBySocket(
          room,
          socket.id
        );

      if (!player) {
        return;
      }

      /*
       * Host mất kết nối:
       * đóng game/phòng.
       */
      if (
        player.isHost
      ) {

        stopTimer(room);

        io.to(room.id).emit(
          "roomClosed",
          {
            message:
              "👑 Host đã mất kết nối. Phòng đã đóng."
          }
        );

        io.in(room.id)
          .socketsLeave(room.id);

        rooms.delete(
          room.id
        );

        return;
      }

      /*
       * Player mất kết nối
       */
      room.players.delete(
        player.id
      );

      room.dayVotes.delete(
        player.id
      );

      room.wolfVotes.delete(
        player.id
      );

      addLog(
        room,
        `${player.name} đã mất kết nối.`
      );

      broadcastPlayers(room);
      broadcastRoom(room);
    }
  );
});

/* =====================================================
   SERVER
===================================================== */

server.listen(
  PORT,
  () => {
    console.log(
      `🐺 Ma Sói Online đang chạy tại port ${PORT}`
    );
  }
);
