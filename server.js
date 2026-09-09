const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_, res) => {
  res.send("Ma Sói Server đang chạy.");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

const PORT = process.env.PORT || 3000;

const ACCOUNTS = {
  quantro: {
    password: "321",
    accountType: "moderator"
  },
  nguoichoi: {
    password: "nguoichoi",
    accountType: "player"
  }
};

const rooms = new Map();

let roomCounter = 1;

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function makeRoomCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while ([...rooms.values()].some(r => r.code === code));
  return code;
}

function createRoom(moderatorSocketId) {
  const room = {
    id: `room_${roomCounter++}`,
    code: makeRoomCode(),

    moderatorSocketId,

    started: false,
    phase: "lobby",

    nightNumber: 0,

    players: new Map(),

    wolfVotes: new Map(),
    dayVotes: new Map(),

    nightActions: {
      wolfTargetId: null,
      seerTargetId: null,
      guardTargetId: null,
      witchSave: false,
      witchPoisonTargetId: null
    },

    witch: {
      saveUsed: false,
      poisonUsed: false
    },

    speakingQueue: [],
    speakerIndex: 0,

    phaseTimer: null,
    phaseEndsAt: null,

    gameOver: false,

    voice: {
      day: new Set(),
      wolf: new Set()
    },

    logs: []
  };

  rooms.set(room.id, room);

  return room;
}

function getRoomByCode(code) {
  return [...rooms.values()].find(
    room => String(room.code) === String(code)
  );
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

function playerPublic(player) {
  return {
    id: player.id,
    socketId: player.socketId,
    name: player.name,
    alive: player.alive,
    role: player.role || null,
    isModerator: player.isModerator
  };
}

function playerClient(player) {
  return {
    id: player.id,
    name: player.name,
    alive: player.alive,
    isModerator: player.isModerator
  };
}

function roomPublic(room) {
  return {
    id: room.id,
    code: room.code,
    started: room.started,
    phase: room.phase,
    nightNumber: room.nightNumber,
    players: [...room.players.values()].map(playerClient),
    logs: room.logs.slice(-30)
  };
}

function sendRoom(room) {
  io.to(room.id).emit("roomUpdate", {
    room: roomPublic(room),
    players: roomPublic(room).players
  });
}

function alivePlayers(room) {
  return [...room.players.values()].filter(p => p.alive);
}

function aliveByRole(room, role) {
  return alivePlayers(room).filter(p => p.role === role);
}

function getPlayerBySocket(room, socketId) {
  return [...room.players.values()].find(
    p => p.socketId === socketId
  );
}

function getPlayerById(room, id) {
  return room.players.get(id);
}

function broadcastPlayers(room) {
  io.to(room.id).emit("playersUpdate", {
    players: [...room.players.values()].map(playerClient)
  });
}

function sendPrivateRole(room, player) {
  const socket = io.sockets.sockets.get(player.socketId);

  if (!socket) return;

  socket.emit("roleAssigned", {
    role: player.role
  });
}

function assignRoles(room) {
  const players = shuffle([...room.players.values()]);
  const count = players.length;

  let wolfCount = 1;

  if (count >= 8) wolfCount = 2;
  if (count >= 12) wolfCount = 3;
  if (count >= 16) wolfCount = 4;

  const roles = [];

  for (let i = 0; i < wolfCount; i++) {
    roles.push("Sói");
  }

  roles.push("Tiên tri");
  roles.push("Bảo vệ");

  if (count >= 6) {
    roles.push("Phù thủy");
  }

  while (roles.length < count) {
    roles.push("Dân làng");
  }

  const shuffledRoles = shuffle(roles);

  players.forEach((player, index) => {
    player.role = shuffledRoles[index];
  });
}

function clearTimer(room) {
  if (room.phaseTimer) {
    clearInterval(room.phaseTimer);
    room.phaseTimer = null;
  }

  room.phaseEndsAt = null;
}

function timerRemaining(room) {
  if (!room.phaseEndsAt) return 0;

  return Math.max(
    0,
    Math.ceil((room.phaseEndsAt - Date.now()) / 1000)
  );
}

function startCountdown(room, seconds, onEnd) {
  clearTimer(room);

  room.phaseEndsAt = Date.now() + seconds * 1000;

  io.to(room.id).emit("phaseTimer", {
    seconds: seconds,
    remaining: seconds
  });

  room.phaseTimer = setInterval(() => {
    const remaining = timerRemaining(room);

    io.to(room.id).emit("phaseTimer", {
      seconds,
      remaining
    });

    if (remaining <= 0) {
      clearTimer(room);
      onEnd();
    }
  }, 250);
}

function resetNightActions(room) {
  room.wolfVotes.clear();

  room.nightActions = {
    wolfTargetId: null,
    seerTargetId: null,
    guardTargetId: null,
    witchSave: false,
    witchPoisonTargetId: null
  };
}

function resetDayVotes(room) {
  room.dayVotes.clear();
}

function checkWinner(room) {
  const alive = alivePlayers(room);

  const wolves = alive.filter(p => p.role === "Sói");
  const villagers = alive.filter(p => p.role !== "Sói");

  if (wolves.length === 0) {
    finishGame(room, "Dân làng thắng!");
    return true;
  }

  if (wolves.length >= villagers.length) {
    finishGame(room, "Sói thắng!");
    return true;
  }

  return false;
}

function finishGame(room, message) {
  if (room.gameOver) return;

  clearTimer(room);

  room.gameOver = true;
  room.started = false;
  room.phase = "gameOver";

  io.to(room.id).emit("gameEnded", {
    message,
    players: [...room.players.values()].map(player => ({
      ...playerClient(player),
      role: player.role
    }))
  });

  sendRoom(room);
}

function eliminatePlayer(room, player, reason) {
  if (!player || !player.alive) return;

  player.alive = false;

  addLog(
    room,
    `${player.name} đã chết${reason ? ` (${reason})` : ""}.`
  );

  for (const set of [room.voice.day, room.voice.wolf]) {
    set.delete(player.socketId);
  }

  io.to(player.socketId).emit("dead", {
    playerId: player.id,
    message: "Bạn đã chết."
  });

  broadcastPlayers(room);
}

function resolveNight(room) {
  if (room.gameOver) return;

  const target = getPlayerById(
    room,
    room.nightActions.wolfTargetId
  );

  const guard = getPlayerById(
    room,
    room.nightActions.guardTargetId
  );

  const poisonTarget = getPlayerById(
    room,
    room.nightActions.witchPoisonTargetId
  );

  let deaths = [];

  if (
    target &&
    target.alive &&
    (!guard || guard.id !== target.id) &&
    !room.nightActions.witchSave
  ) {
    eliminatePlayer(room, target, "bị Sói cắn");
    deaths.push(target);
  }

  if (
    poisonTarget &&
    poisonTarget.alive
  ) {
    if (!deaths.some(p => p.id === poisonTarget.id)) {
      eliminatePlayer(
        room,
        poisonTarget,
        "bị Phù thủy hạ độc"
      );

      deaths.push(poisonTarget);
    }
  }

  io.to(room.id).emit("nightResult", {
    players: [...room.players.values()].map(playerClient),
    deaths: deaths.map(player => ({
      id: player.id,
      name: player.name
    })),
    message:
      deaths.length > 0
        ? `Đêm qua có ${deaths.length} người chết.`
        : "Đêm qua không có ai chết."
  });

  if (!checkWinner(room)) {
    setTimeout(() => beginDaySpeech(room), 2500);
  }
}

function beginNight(room) {
  if (!room.started || room.gameOver) return;

  if (checkWinner(room)) return;

  room.phase = "night";
  room.nightNumber++;

  resetNightActions(room);

  addLog(room, `Bắt đầu đêm ${room.nightNumber}.`);

  io.to(room.id).emit("phaseChanged", {
    phase: "night",
    nightNumber: room.nightNumber,
    players: [...room.players.values()].map(playerClient)
  });

  sendNightInfo(room);

  startCountdown(room, 60, () => {
    resolveNight(room);
  });
}

function sendNightInfo(room) {
  const wolves = aliveByRole(room, "Sói");

  const wolfTargets = wolves
    .map(w => w.socketId)
    .filter(Boolean);

  io.to(room.id).emit("nightInfo", {
    wolfTargetId: room.nightActions.wolfTargetId
  });

  const witch = aliveByRole(room, "Phù thủy")[0];

  if (witch) {
    io.to(witch.socketId).emit("nightInfo", {
      wolfTargetId: room.nightActions.wolfTargetId,
      wolfTargetName: getPlayerById(
        room,
        room.nightActions.wolfTargetId
      )?.name || null,
      saveAvailable: !room.witch.saveUsed,
      poisonAvailable: !room.witch.poisonUsed
    });
  }

  if (wolfTargets.length > 0) {
    io.to(room.id).emit("wolfMembers", {
      players: wolves.map(player => ({
        id: player.id,
        name: player.name,
        alive: player.alive
      }))
    });
  }
}

function beginDaySpeech(room) {
  if (!room.started || room.gameOver) return;

  if (checkWinner(room)) return;

  clearTimer(room);

  room.phase = "daySpeech";

  room.speakingQueue = alivePlayers(room)
    .sort(() => Math.random() - 0.5)
    .map(player => player.id);

  room.speakerIndex = 0;

  addLog(room, "Bắt đầu phần phát biểu ban ngày.");

  io.to(room.id).emit("phaseChanged", {
    phase: "daySpeech",
    players: [...room.players.values()].map(playerClient)
  });

  startNextSpeaker(room);
}

function startNextSpeaker(room) {
  if (room.gameOver || !room.started) return;

  while (
    room.speakerIndex < room.speakingQueue.length
  ) {
    const playerId =
      room.speakingQueue[room.speakerIndex];

    const player = getPlayerById(room, playerId);

    if (player && player.alive) {
      io.to(room.id).emit("voiceTurn", {
        playerId: player.id,
        playerName: player.name,
        round: room.speakerIndex + 1,
        seconds: 30,
        duration: 30
      });

      startCountdown(room, 30, () => {
        room.speakerIndex++;

        io.to(room.id).emit("voiceEnded", {
          playerId: player.id
        });

        startNextSpeaker(room);
      });

      return;
    }

    room.speakerIndex++;
  }

  beginDayVote(room);
}

function beginDayVote(room) {
  if (!room.started || room.gameOver) return;

  resetDayVotes(room);

  room.phase = "dayVote";

  addLog(room, "Bắt đầu bỏ phiếu.");

  io.to(room.id).emit("phaseChanged", {
    phase: "dayVote",
    players: [...room.players.values()].map(playerClient)
  });

  io.to(room.id).emit("voteUpdate", {
    votes: []
  });

  startCountdown(room, 30, () => {
    resolveDayVote(room);
  });
}

function resolveDayVote(room) {
  const counts = new Map();

  for (const targetId of room.dayVotes.values()) {
    counts.set(
      targetId,
      (counts.get(targetId) || 0) + 1
    );
  }

  let topTargetId = null;
  let topCount = 0;
  let tie = false;

  for (const [targetId, count] of counts.entries()) {
    if (count > topCount) {
      topTargetId = targetId;
      topCount = count;
      tie = false;
    } else if (count === topCount && count > 0) {
      tie = true;
    }
  }

  let executed = null;

  if (topTargetId && !tie) {
    const target = getPlayerById(room, topTargetId);

    if (target && target.alive) {
      eliminatePlayer(room, target, "bị dân làng treo cổ");
      executed = {
        id: target.id,
        name: target.name
      };
    }
  }

  io.to(room.id).emit("voteResult", {
    executed,
    players: [...room.players.values()].map(playerClient)
  });

  if (!checkWinner(room)) {
    setTimeout(() => beginNight(room), 2500);
  }
}

function validNightPlayer(room, socket, role) {
  const player = getPlayerBySocket(room, socket.id);

  return (
    player &&
    player.alive &&
    room.started &&
    room.phase === "night" &&
    player.role === role
  )
    ? player
    : null;
}

function sameVoiceChannel(room, socketId, channel) {
  return room.voice[channel]?.has(socketId);
}

function allowedVoiceChannel(room, player, channel) {
  if (!player || !player.alive) return false;

  if (
    channel === "wolf"
  ) {
    return (
      room.phase === "night" &&
      player.role === "Sói"
    );
  }

  if (
    channel === "day"
  ) {
    return (
      room.phase === "daySpeech" ||
      room.phase === "dayVote"
    );
  }

  return false;
}

function sendVoiceMembers(room, channel) {
  const ids = [...room.voice[channel]];

  const players = ids
    .map(socketId => getPlayerBySocket(room, socketId))
    .filter(Boolean)
    .map(player => ({
      id: player.id,
      name: player.name,
      socketId: player.socketId
    }));

  for (const socketId of ids) {
    io.to(socketId).emit("voiceMembers", {
      channel,
      players
    });
  }
}

function leaveAllVoice(socketId) {
  for (const room of rooms.values()) {
    for (const channel of ["day", "wolf"]) {
      if (room.voice[channel].delete(socketId)) {
        sendVoiceMembers(room, channel);
        io.to(room.id).emit("voiceLeft", {
          channel,
          playerId: socketId
        });
      }
    }
  }
}

io.on("connection", socket => {
  socket.data.authenticated = false;
  socket.data.accountType = null;
  socket.data.roomId = null;

  socket.emit("connected", {
    socketId: socket.id
  });

  socket.on("authenticate", ({ id, password }) => {
    const account = ACCOUNTS[id];

    if (!account || account.password !== password) {
      socket.emit("authenticateFailed", {
        message: "Sai tài khoản hoặc mật khẩu."
      });
      return;
    }

    if (
      id === "quantro" &&
      [...io.sockets.sockets.values()].some(
        s =>
          s.id !== socket.id &&
          s.data.authenticated &&
          s.data.accountType === "moderator"
      )
    ) {
      socket.emit("authenticateFailed", {
        message: "Quản trò đang đăng nhập ở nơi khác."
      });
      return;
    }

    socket.data.authenticated = true;
    socket.data.accountType = account.accountType;
    socket.data.accountId = id;

    socket.emit("authenticateSuccess", {
      accountType: account.accountType
    });
  });

  socket.on("createRoom", ({ name }) => {
    if (
      !socket.data.authenticated ||
      socket.data.accountType !== "moderator"
    ) {
      return;
    }

    if (socket.data.roomId) {
      socket.emit("errorMessage", {
        message: "Bạn đã ở trong một phòng."
      });
      return;
    }

    const room = createRoom(socket.id);

    const player = {
      id: `p_${socket.id}`,
      socketId: socket.id,
      name: String(name || "Quản trò").trim() || "Quản trò",
      alive: true,
      role: null,
      isModerator: true
    };

    room.players.set(player.id, player);

    socket.join(room.id);
    socket.data.roomId = room.id;

    socket.emit("roomCreated", {
      room: roomPublic(room)
    });

    sendRoom(room);
  });

  socket.on("joinRoom", ({ roomCode, name }) => {
    if (!socket.data.authenticated) {
      socket.emit("errorMessage", {
        message: "Bạn chưa đăng nhập."
      });
      return;
    }

    if (socket.data.roomId) {
      socket.emit("errorMessage", {
        message: "Bạn đã ở trong một phòng."
      });
      return;
    }

    const room = getRoomByCode(roomCode);

    if (!room) {
      socket.emit("errorMessage", {
        message: "Không tìm thấy phòng."
      });
      return;
    }

    if (room.started) {
      socket.emit("errorMessage", {
        message: "Ván chơi đã bắt đầu."
      });
      return;
    }

    if (room.players.size >= 20) {
      socket.emit("errorMessage", {
        message: "Phòng đã đủ 20 người."
      });
      return;
    }

    const cleanName =
      String(name || "").trim() || "Người chơi";

    const player = {
      id: `p_${socket.id}`,
      socketId: socket.id,
      name: cleanName,
      alive: true,
      role: null,
      isModerator: false
    };

    room.players.set(player.id, player);

    socket.join(room.id);
    socket.data.roomId = room.id;

    socket.emit("joinedRoom", {
      room: roomPublic(room)
    });

    sendRoom(room);
  });

  socket.on("startGame", ({ roomCode }) => {
    const room = socket.data.roomId
      ? rooms.get(socket.data.roomId)
      : getRoomByCode(roomCode);

    if (!room) return;

    if (room.moderatorSocketId !== socket.id) {
      socket.emit("errorMessage", {
        message: "Chỉ Quản trò được bắt đầu game."
      });
      return;
    }

    if (room.players.size < 4) {
      socket.emit("errorMessage", {
        message: "Cần ít nhất 4 người chơi."
      });
      return;
    }

    if (room.started) return;

    room.started = true;
    room.gameOver = false;
    room.phase = "night";
    room.nightNumber = 0;

    [...room.players.values()].forEach(player => {
      player.alive = true;
      player.role = null;
    });

    assignRoles(room);

    [...room.players.values()].forEach(player => {
      sendPrivateRole(room, player);
    });

    io.to(room.id).emit("gameStarted", {
      room: roomPublic(room),
      players: [...room.players.values()].map(playerClient)
    });

    sendRoom(room);

    setTimeout(() => {
      beginNight(room);
    }, 1000);
  });

  socket.on("wolfKill", ({ targetId }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;

    const player = validNightPlayer(
      room,
      socket,
      "Sói"
    );

    const target = getPlayerById(room, targetId);

    if (!player || !target || !target.alive) return;
    if (target.role === "Sói") return;

    room.wolfVotes.set(player.id, target.id);

    const counts = {};

    for (const targetId of room.wolfVotes.values()) {
      counts[targetId] = (counts[targetId] || 0) + 1;
    }

    let bestId = null;
    let bestCount = 0;

    for (const [id, count] of Object.entries(counts)) {
      if (count > bestCount) {
        bestId = id;
        bestCount = count;
      }
    }

    room.nightActions.wolfTargetId = bestId;

    io.to(socket.id).emit("actionAccepted", {
      action: "wolfKill",
      targetId
    });

    io.to(room.id).emit("wolfVoteUpdate", {
      votes: Object.entries(counts).map(
        ([id, count]) => ({
          targetId: id,
          targetName:
            getPlayerById(room, id)?.name || "",
          count
        })
      )
    });

    sendNightInfo(room);
  });

  socket.on("seerInspect", ({ targetId }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;

    const player = validNightPlayer(
      room,
      socket,
      "Tiên tri"
    );

    const target = getPlayerById(room, targetId);

    if (!player || !target || !target.alive) return;

    room.nightActions.seerTargetId = target.id;

    io.to(socket.id).emit("seerResult", {
      targetId: target.id,
      targetName: target.name,
      role: target.role
    });
  });

  socket.on("guardProtect", ({ targetId }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;

    const player = validNightPlayer(
      room,
      socket,
      "Bảo vệ"
    );

    const target = getPlayerById(room, targetId);

    if (!player || !target || !target.alive) return;

    room.nightActions.guardTargetId = target.id;

    socket.emit("actionAccepted", {
      action: "guardProtect",
      targetId
    });
  });

  socket.on("witchSave", () => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;

    const player = validNightPlayer(
      room,
      socket,
      "Phù thủy"
    );

    if (!player || room.witch.saveUsed) return;

    room.witch.saveUsed = true;
    room.nightActions.witchSave = true;

    socket.emit("actionAccepted", {
      action: "witchSave"
    });
  });

  socket.on("witchPoison", ({ targetId }) => {
    const room = rooms.get(socket.data.roomId);
    if (!room) return;

    const player = validNightPlayer(
      room,
      socket,
      "Phù thủy"
    );

    const target = getPlayerById(room, targetId);

    if (
      !player ||
      !target ||
      !target.alive ||
      room.witch.poisonUsed
    ) {
      return;
    }

    room.witch.poisonUsed = true;
    room.nightActions.witchPoisonTargetId =
      target.id;

    socket.emit("actionAccepted", {
      action: "witchPoison",
      targetId
    });
  });

  socket.on("vote", ({ targetId }) => {
    const room = rooms.get(socket.data.roomId);

    if (!room || room.phase !== "dayVote") {
      return;
    }

    const voter = getPlayerBySocket(room, socket.id);
    const target = getPlayerById(room, targetId);

    if (
      !voter ||
      !voter.alive ||
      !target ||
      !target.alive
    ) {
      return;
    }

    room.dayVotes.set(voter.id, target.id);

    const votes = {};

    for (const [voterId, targetId] of room.dayVotes.entries()) {
      votes[voterId] = targetId;
    }

    io.to(room.id).emit("voteUpdate", {
      votes: Object.entries(votes).map(
        ([voterId, targetId]) => ({
          voterId,
          voterName:
            getPlayerById(room, voterId)?.name || "",
          targetId,
          targetName:
            getPlayerById(room, targetId)?.name || ""
        })
      )
    });
  });

  socket.on("forceNextPhase", () => {
    const room = rooms.get(socket.data.roomId);

    if (!room || room.moderatorSocketId !== socket.id) {
      return;
    }

    if (room.phase === "night") {
      clearTimer(room);
      resolveNight(room);
      return;
    }

    if (room.phase === "daySpeech") {
      clearTimer(room);

      room.speakerIndex =
        room.speakingQueue.length;

      startNextSpeaker(room);
      return;
    }

    if (room.phase === "dayVote") {
      clearTimer(room);
      resolveDayVote(room);
    }
  });

  socket.on("endGame", () => {
    const room = rooms.get(socket.data.roomId);

    if (!room || room.moderatorSocketId !== socket.id) {
      return;
    }

    finishGame(room, "Quản trò đã kết thúc ván.");
  });

  socket.on("voiceJoin", ({ channel }) => {
    const room = rooms.get(socket.data.roomId);

    if (
      !room ||
      !["day", "wolf"].includes(channel)
    ) {
      return;
    }

    const player = getPlayerBySocket(room, socket.id);

    if (
      !allowedVoiceChannel(
        room,
        player,
        channel
      )
    ) {
      return;
    }

    room.voice[channel].add(socket.id);

    sendVoiceMembers(room, channel);

    io.to(room.id).emit("voiceStatus", {
      channel,
      playerId: player.id,
      enabled: true
    });
  });

  socket.on("voiceLeave", ({ channel }) => {
    const room = rooms.get(socket.data.roomId);

    if (
      !room ||
      !["day", "wolf"].includes(channel)
    ) {
      return;
    }

    const player = getPlayerBySocket(room, socket.id);

    room.voice[channel].delete(socket.id);

    sendVoiceMembers(room, channel);

    if (player) {
      io.to(room.id).emit("voiceStatus", {
        channel,
        playerId: player.id,
        enabled: false
      });
    }
  });

  socket.on(
    "voiceSignal",
    ({ channel, targetSocketId, signal }) => {
      const room = rooms.get(socket.data.roomId);

      if (
        !room ||
        !["day", "wolf"].includes(channel)
      ) {
        return;
      }

      if (
        !sameVoiceChannel(
          room,
          socket.id,
          channel
        ) ||
        !sameVoiceChannel(
          room,
          targetSocketId,
          channel
        )
      ) {
        return;
      }

      io.to(targetSocketId).emit(
        "voiceSignal",
        {
          channel,
          fromSocketId: socket.id,
          signal
        }
      );
    }
  );

  socket.on("voiceMute", ({ channel, muted }) => {
    const room = rooms.get(socket.data.roomId);

    if (!room) return;

    const player = getPlayerBySocket(room, socket.id);

    if (!player) return;

    io.to(room.id).emit("voiceMute", {
      channel,
      playerId: player.id,
      muted: !!muted
    });
  });

  socket.on("disconnect", () => {
    leaveAllVoice(socket.id);

    const room = socket.data.roomId
      ? rooms.get(socket.data.roomId)
      : null;

    if (!room) return;

    const player = getPlayerBySocket(
      room,
      socket.id
    );

    if (!player) return;

    if (
      room.moderatorSocketId === socket.id
    ) {
      clearTimer(room);

      room.started = false;
      room.phase = "waiting_moderator";

      io.to(room.id).emit("moderatorDisconnected", {
        message:
          "Quản trò đã thoát. Ván chơi đã dừng và không chuyển Quản trò."
      });

      return;
    }

    room.players.delete(player.id);

    room.dayVotes.delete(player.id);
    room.wolfVotes.delete(player.id);

    broadcastPlayers(room);
    sendRoom(room);
  });
});

server.listen(PORT, () => {
  console.log(`Ma Sói server chạy tại port ${PORT}`);
});
