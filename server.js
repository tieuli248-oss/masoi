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
    },
    transports: ["websocket", "polling"]
});

const PORT = process.env.PORT || 10000;

// =====================================================
// EXPRESS / RENDER
// =====================================================

app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "masoi-online.html")
    );
});

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        game: "Ma Sói Online",
        rooms: rooms.size,
        moderatorOnline:
            moderatorSocketId !== null
    });
});

// =====================================================
// TÀI KHOẢN
// =====================================================

const USERS = {
    quantro: {
        password: "321",
        accountType: "Quantro"
    },

    nguoichoi: {
        password: "nguoichoi",
        accountType: "nguoichoi"
    }
};

// Chỉ 1 Quản trò được đăng nhập
let moderatorSocketId = null;

// =====================================================
// PHÒNG GAME
// =====================================================

const rooms = new Map();

// =====================================================
// THÔNG TIN ROLE
// =====================================================

const ROLE_INFO = {
    "Quản trò": {
        icon: "👑",
        description:
            "Điều khiển và quản lý trò chơi."
    },

    "Sói": {
        icon: "🐺",
        description:
            "Mỗi đêm chọn người để cắn."
    },

    "Dân": {
        icon: "👨‍🌾",
        description:
            "Không có kỹ năng đặc biệt."
    },

    "Tiên tri": {
        icon: "🔮",
        description:
            "Mỗi đêm kiểm tra một người."
    },

    "Bảo vệ": {
        icon: "🛡️",
        description:
            "Mỗi đêm bảo vệ một người."
    },

    "Phù thủy": {
        icon: "🧙",
        description:
            "Có bình cứu và bình độc."
    },

    "Thợ săn": {
        icon: "🏹",
        description:
            "Có kỹ năng đặc biệt khi chết."
    }
};

// =====================================================
// ROOM HELPERS
// =====================================================

function createRoomCode() {
    let code;

    do {
        code =
            Math.random()
                .toString(36)
                .slice(2, 8)
                .toUpperCase();
    } while (rooms.has(code));

    return code;
}

function getRoom(socket) {
    const roomCode =
        socket?.data?.roomCode;

    if (!roomCode) {
        return null;
    }

    return rooms.get(roomCode) || null;
}

function getPlayer(room, socketId) {
    if (!room) return null;

    return (
        room.players.find(
            player =>
                player.id === socketId
        ) || null
    );
}

function getModerator(room) {
    if (!room) return null;

    return (
        room.players.find(
            player =>
                player.isModerator
        ) || null
    );
}

function getGamePlayers(room) {
    return room.players.filter(
        player =>
            !player.isModerator
    );
}

function getAliveGamePlayers(room) {
    return getGamePlayers(room).filter(
        player =>
            player.alive
    );
}

function getAliveWolves(room) {
    return getAliveGamePlayers(room).filter(
        player =>
            player.role === "Sói"
    );
}

function getPublicPlayers(room) {
    return room.players.map(
        player => ({
            id:
                player.id,

            name:
                player.name,

            alive:
                player.alive,

            ready:
                player.ready,

            isHost:
                player.isModerator
        })
    );
}

function getPublicRoom(room) {
    return {
        code:
            room.code,

        phase:
            room.phase,

        day:
            room.day,

        hostId:
            room.hostId,

        players:
            getPublicPlayers(room)
    };
}

function broadcastRoom(room) {
    io.to(room.code).emit(
        "roomUpdate",
        {
            room:
                getPublicRoom(room),

            players:
                getPublicPlayers(room)
        }
    );

    io.to(room.code).emit(
        "playersUpdate",
        {
            players:
                getPublicPlayers(room)
        }
    );
}

function sendError(
    socket,
    message
) {
    socket.emit(
        "errorMessage",
        {
            message:
                String(message)
        }
    );
}

function logGame(
    room,
    message
) {
    io.to(room.code).emit(
        "gameLog",
        {
            message:
                String(message)
        }
    );
}

// =====================================================
// CHIA VAI
// =====================================================

function assignRoles(
    room,
    requestedWolfCount
) {
    const players =
        getGamePlayers(room);

    if (players.length < 4) {
        throw new Error(
            "Cần ít nhất 4 người chơi ngoài Quản trò."
        );
    }

    const wolfCount =
        Math.max(
            1,
            Math.min(
                Number(
                    requestedWolfCount
                ) || 1,

                Math.floor(
                    players.length / 2
                )
            )
        );

    const roles = [];

    for (
        let i = 0;
        i < wolfCount;
        i++
    ) {
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

    while (
        roles.length <
        players.length
    ) {
        roles.push("Dân");
    }

    // Shuffle
    for (
        let i =
            roles.length - 1;
        i > 0;
        i--
    ) {
        const j =
            Math.floor(
                Math.random() *
                (i + 1)
            );

        [
            roles[i],
            roles[j]
        ] = [
            roles[j],
            roles[i]
        ];
    }

    players.forEach(
        (
            player,
            index
        ) => {
            player.role =
                roles[index];

            player.alive =
                true;
        }
    );

    const moderator =
        getModerator(room);

    if (moderator) {
        moderator.role =
            "Quản trò";
    }
}

// =====================================================
// WIN
// =====================================================

function checkWinner(room) {
    const alive =
        getAliveGamePlayers(room);

    const wolves =
        alive.filter(
            p =>
                p.role === "Sói"
        ).length;

    const others =
        alive.filter(
            p =>
                p.role !== "Sói"
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
// WOLF VOTES
// =====================================================

function buildWolfVoteSummary(
    room
) {
    const counts =
        new Map();

    for (
        const targetId of
        room.night.wolfVotes.values()
    ) {
        counts.set(
            targetId,
            (
                counts.get(
                    targetId
                ) || 0
            ) + 1
        );
    }

    return [
        ...counts.entries()
    ].map(
        (
            [targetId, count]
        ) => {
            const target =
                room.players.find(
                    p =>
                        p.id === targetId
                );

            return {
                targetId,
                targetName:
                    target?.name ||
                    "Không rõ",
                count
            };
        }
    );
}

function broadcastWolfVotes(room) {
    io.to(room.code).emit(
        "wolfVoteUpdate",
        {
            votes:
                buildWolfVoteSummary(room)
        }
    );
}

function getWolfTarget(room) {
    const summary =
        buildWolfVoteSummary(room);

    if (!summary.length) {
        return null;
    }

    let max = 0;
    let winners = [];

    for (
        const item of summary
    ) {
        if (
            item.count > max
        ) {
            max =
                item.count;

            winners = [
                item
            ];
        } else if (
            item.count === max
        ) {
            winners.push(
                item
            );
        }
    }

    // Hòa phiếu
    if (
        winners.length !== 1
    ) {
        return null;
    }

    return winners[0].targetId;
}

// =====================================================
// NIGHT
// =====================================================

function resetNight(room) {
    room.night = {
        wolfVotes:
            new Map(),

        guardTarget:
            null,

        seerTarget:
            null,

        witchKillTarget:
            null,

        witchSaved:
            false
    };
}

function resolveNight(room) {
    const deaths = [];

    const wolfTarget =
        getWolfTarget(room);

    const guardTarget =
        room.night.guardTarget;

    const witchSaved =
        room.night.witchSaved;

    const witchKill =
        room.night.witchKillTarget;

    // Sói giết
    if (
        wolfTarget &&
        wolfTarget !==
            guardTarget &&
        !witchSaved
    ) {
        deaths.push(
            wolfTarget
        );
    }

    // Phù thủy độc
    if (
        witchKill &&
        !deaths.includes(
            witchKill
        )
    ) {
        deaths.push(
            witchKill
        );
    }

    // Cập nhật chết
    deaths.forEach(
        playerId => {
            const player =
                room.players.find(
                    p =>
                        p.id ===
                        playerId
                );

            if (player) {
                player.alive =
                    false;
            }
        }
    );

    return deaths;
}

// =====================================================
// DAY VOICE
// =====================================================

function clearVoiceTimer(room) {
    if (
        room?.voice?.timer
    ) {
        clearInterval(
            room.voice.timer
        );

        room.voice.timer =
            null;
    }
}

function startDayVoice(room) {
    clearVoiceTimer(room);

    room.voice = {
        index: 0,
        round: 1,
        seconds: 30,
        timer: null
    };

    startVoiceTurn(room);
}

function startVoiceTurn(room) {
    clearVoiceTimer(room);

    const alive =
        getAliveGamePlayers(room);

    if (!alive.length) {
        io.to(room.code).emit(
            "voiceEnded"
        );

        return;
    }

    if (
        room.voice.index >=
        alive.length
    ) {
        room.voice.round++;

        if (
            room.voice.round > 2
        ) {
            io.to(room.code).emit(
                "voiceEnded"
            );

            return;
        }

        room.voice.index = 0;
    }

    const player =
        alive[
            room.voice.index
        ];

    room.voice.seconds =
        30;

    io.to(room.code).emit(
        "voiceTurn",
        {
            playerId:
                player.id,

            playerName:
                player.name,

            round:
                room.voice.round,

            seconds:
                30
        }
    );

    room.voice.timer =
        setInterval(
            () => {
                room.voice.seconds--;

                io.to(
                    room.code
                ).emit(
                    "voiceTick",
                    {
                        seconds:
                            room.voice.seconds
                    }
                );

                if (
                    room.voice.seconds <=
                    0
                ) {
                    clearVoiceTimer(
                        room
                    );

                    io.to(
                        room.code
                    ).emit(
                        "voiceEnded"
                    );

                    room.voice.index++;

                    setTimeout(
                        () => {
                            if (
                                rooms.get(
                                    room.code
                                ) === room &&
                                room.phase ===
                                    "day"
                            ) {
                                startVoiceTurn(
                                    room
                                );
                            }
                        },
                        300
                    );
                }
            },
            1000
        );
}

// =====================================================
// ROLE GỬI RIÊNG
// =====================================================

function sendRole(
    room,
    player
) {
    const targetSocket =
        io.sockets.sockets.get(
            player.id
        );

    if (!targetSocket) {
        return;
    }

    targetSocket.emit(
        "roleAssigned",
        {
            role:
                player.role,

            icon:
                ROLE_INFO[
                    player.role
                ]?.icon,

            description:
                ROLE_INFO[
                    player.role
                ]?.description
        }
    );
}

// =====================================================
// WOLF VOICE
// =====================================================

function broadcastWolfVoiceMembers(
    room
) {
    const wolves =
        getGamePlayers(room)
            .filter(
                player =>
                    player.role ===
                        "Sói" &&
                    player.alive &&
                    player.wolfVoice
            )
            .map(
                player => ({
                    id:
                        player.id,

                    name:
                        player.name,

                    alive:
                        player.alive
                })
            );

    io.to(room.code).emit(
        "wolfVoiceMembers",
        {
            players:
                wolves
        }
    );
}

// =====================================================
// SOCKET.IO
// =====================================================

io.on(
    "connection",
    socket => {
        console.log(
            "✅ Client kết nối:",
            socket.id
        );

        // =============================================
        // LOGIN
        // =============================================

        socket.on(
            "authenticate",
            data => {
                const id =
                    String(
                        data?.id || ""
                    )
                        .trim()
                        .toLowerCase();

                const password =
                    String(
                        data?.password ||
                            ""
                    );

                const user =
                    USERS[id];

                if (
                    !user ||
                    user.password !==
                        password
                ) {
                    return sendError(
                        socket,
                        "Sai ID hoặc mật khẩu."
                    );
                }

                // -------------------------------------
                // QUANTRO CHỈ 1 PHIÊN
                // -------------------------------------

                if (
                    id ===
                    "quantro"
                ) {
                    if (
                        moderatorSocketId &&
                        moderatorSocketId !==
                            socket.id
                    ) {
                        socket.emit(
                            "errorMessage",
                            {
                                message:
                                    "Tài khoản Quản trò đang được sử dụng."
                            }
                        );

                        console.log(
                            "⛔ Từ chối Quantro:",
                            socket.id
                        );

                        setTimeout(
                            () => {
                                socket.disconnect(
                                    true
                                );
                            },
                            500
                        );

                        return;
                    }

                    moderatorSocketId =
                        socket.id;

                    socket.data.isModerator =
                        true;

                    console.log(
                        "👑 Quantro online:",
                        socket.id
                    );
                } else {
                    socket.data.isModerator =
                        false;
                }

                socket.data.authenticated =
                    true;

                socket.data.userId =
                    id;

                socket.data.accountType =
                    user.accountType;

                socket.emit(
                    "authenticateSuccess",
                    {
                        accountType:
                            user.accountType
                    }
                );

                console.log(
                    `🔐 ${id} đăng nhập thành công`
                );
            }
        );

        // =============================================
        // JOIN LOBBY
        // =============================================

        socket.on(
            "joinLobby",
            data => {
                if (
                    !socket.data.authenticated
                ) {
                    return sendError(
                        socket,
                        "Bạn chưa đăng nhập."
                    );
                }

                const name =
                    String(
                        data?.name || ""
                    ).trim();

                if (!name) {
                    return sendError(
                        socket,
                        "Vui lòng nhập tên."
                    );
                }

                if (
                    name.length < 2
                ) {
                    return sendError(
                        socket,
                        "Tên phải có ít nhất 2 ký tự."
                    );
                }

                let room =
                    null;

                // -------------------------------------
                // QUANTRO TỰ TẠO PHÒNG
                // -------------------------------------

                if (
                    socket.data.isModerator
                ) {
                    // Tìm phòng của Quantro
                    for (
                        const existingRoom of
                            rooms.values()
                    ) {
                        if (
                            existingRoom.moderatorUserId ===
                                socket.data.userId
                        ) {
                            room =
                                existingRoom;
                            break;
                        }
                    }

                    // Chưa có -> tạo
                    if (!room) {
                        room = {
                            code:
                                createRoomCode(),

                            phase:
                                "lobby",

                            day:
                                0,

                            hostId:
                                socket.id,

                            moderatorSocketId:
                                socket.id,

                            moderatorUserId:
                                "quantro",

                            players:
                                [],

                            votes:
                                new Map(),

                            night: {
                                wolfVotes:
                                    new Map(),

                                guardTarget:
                                    null,

                                seerTarget:
                                    null,

                                witchKillTarget:
                                    null,

                                witchSaved:
                                    false
                            },

                            voice: {
                                index:
                                    0,

                                round:
                                    1,

                                seconds:
                                    30,

                                timer:
                                    null
                            }
                        };

                        rooms.set(
                            room.code,
                            room
                        );

                        console.log(
                            `👑 Quantro tạo phòng: ${room.code}`
                        );
                    }

                    room.hostId =
                        socket.id;

                    room.moderatorSocketId =
                        socket.id;

                    room.moderatorUserId =
                        socket.data.userId;
                }

                // -------------------------------------
                // NGƯỜI CHƠI
                // -------------------------------------

                else {
                    room =
                        [...rooms.values()]
                            .find(
                                existingRoom =>
                                    existingRoom.phase ===
                                        "lobby" &&
                                    existingRoom.moderatorSocketId
                            );

                    if (!room) {
                        return sendError(
                            socket,
                            "Chưa có phòng. Hãy chờ Quản trò."
                        );
                    }
                }

                // -------------------------------------
                // TỐI ĐA
                // -------------------------------------

                if (
                    room.players.length >=
                    21
                ) {
                    return sendError(
                        socket,
                        "Phòng đã đủ người."
                    );
                }

                // -------------------------------------
                // PLAYER EXIST
                // -------------------------------------

                let player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (!player) {
                    player = {
                        id:
                            socket.id,

                        name:
                            name,

                        alive:
                            true,

                        ready:
                            false,

                        role:
                            socket.data.isModerator
                                ? "Quản trò"
                                : null,

                        isModerator:
                            Boolean(
                                socket.data
                                    .isModerator
                            ),

                        wolfVoice:
                            false
                    };

                    room.players.push(
                        player
                    );
                } else {
                    player.name =
                        name;
                }

                socket.join(
                    room.code
                );

                socket.data.roomCode =
                    room.code;

                const isHost =
                    Boolean(
                        socket.data
                            .isModerator &&
                        socket.id ===
                            room.moderatorSocketId
                    );

                socket.emit(
                    "loginSuccess",
                    {
                        room:
                            getPublicRoom(
                                room
                            ),

                        players:
                            getPublicPlayers(
                                room
                            ),

                        accountType:
                            socket.data
                                .accountType,

                        isHost:
                            isHost
                    }
                );

                broadcastRoom(
                    room
                );

                console.log(
                    `👤 ${name} vào phòng ${room.code} | Host=${isHost}`
                );
            }
        );

        // =============================================
        // START GAME
        // =============================================

        socket.on(
            "startGame",
            data => {
                const roomCode =
                    String(
                        data?.roomCode ||
                            ""
                    )
                        .trim()
                        .toUpperCase();

                const room =
                    rooms.get(
                        roomCode
                    );

                if (!room) {
                    return sendError(
                        socket,
                        "Không tìm thấy phòng."
                    );
                }

                if (
                    socket.id !==
                    room.moderatorSocketId
                ) {
                    return sendError(
                        socket,
                        "Chỉ Quản trò mới có thể bắt đầu game."
                    );
                }

                const gamePlayers =
                    getGamePlayers(
                        room
                    );

                if (
                    gamePlayers.length <
                    4
                ) {
                    return sendError(
                        socket,
                        "Cần ít nhất 4 người chơi ngoài Quản trò."
                    );
                }

                clearVoiceTimer(
                    room
                );

                room.phase =
                    "night";

                room.day =
                    1;

                room.votes.clear();

                resetNight(
                    room
                );

                assignRoles(
                    room,
                    Number(
                        data?.wolfCount
                    ) || 1
                );

                // Gửi role
                room.players.forEach(
                    player => {
                        sendRole(
                            room,
                            player
                        );

                        const targetSocket =
                            io.sockets.sockets.get(
                                player.id
                            );

                        if (
                            !targetSocket
                        ) {
                            return;
                        }

                        targetSocket.emit(
                            "gameStarted",
                            {
                                room:
                                    getPublicRoom(
                                        room
                                    ),

                                players:
                                    getPublicPlayers(
                                        room
                                    ),

                                role:
                                    player.role
                            }
                        );
                    }
                );

                logGame(
                    room,
                    "🎭 Quản trò đã chia vai."
                );

                logGame(
                    room,
                    "🌙 Đêm 1 bắt đầu."
                );

                io.to(
                    room.code
                ).emit(
                    "phaseChanged",
                    {
                        phase:
                            "night",

                        players:
                            getPublicPlayers(
                                room
                            ),

                        message:
                            "🌙 BAN ĐÊM"
                    }
                );

                broadcastRoom(
                    room
                );
            }
        );

        // =============================================
        // WOLF KILL
        // =============================================

        socket.on(
            "wolfKill",
            data => {
                const room =
                    getRoom(
                        socket
                    );

                if (!room) return;

                if (
                    room.phase !==
                    "night"
                ) {
                    return sendError(
                        socket,
                        "Chưa đến ban đêm."
                    );
                }

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (!player) return;

                if (
                    player.isModerator ||
                    player.role !==
                        "Sói"
                ) {
                    return sendError(
                        socket,
                        "Bạn không phải Sói."
                    );
                }

                if (
                    !player.alive
                ) {
                    return sendError(
                        socket,
                        "Bạn đã chết."
                    );
                }

                const targetId =
                    String(
                        data?.targetId ||
                            ""
                    );

                const target =
                    room.players.find(
                        p =>
                            p.id ===
                            targetId
                    );

                if (
                    !target ||
                    target.isModerator ||
                    !target.alive
                ) {
                    return sendError(
                        socket,
                        "Mục tiêu không hợp lệ."
                    );
                }

                if (
                    target.role ===
                    "Sói"
                ) {
                    return sendError(
                        socket,
                        "Không thể cắn Sói."
                    );
                }

                room.night.wolfVotes.set(
                    socket.id,
                    targetId
                );

                broadcastWolfVotes(
                    room
                );
            }
        );

        // =============================================
        // VOTE
        // =============================================

        socket.on(
            "vote",
            data => {
                const room =
                    getRoom(
                        socket
                    );

                if (!room) return;

                if (
                    room.phase !==
                    "dayVote"
                ) {
                    return sendError(
                        socket,
                        "Chưa đến lượt bỏ phiếu."
                    );
                }

                const voter =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (
                    !voter ||
                    voter.isModerator ||
                    !voter.alive
                ) {
                    return sendError(
                        socket,
                        "Bạn không thể vote."
                    );
                }

                const targetId =
                    String(
                        data?.targetId ||
                            ""
                    );

                const target =
                    room.players.find(
                        p =>
                            p.id ===
                            targetId
                    );

                if (
                    !target ||
                    target.isModerator ||
                    !target.alive
                ) {
                    return sendError(
                        socket,
                        "Mục tiêu không hợp lệ."
                    );
                }

                room.votes.set(
                    socket.id,
                    targetId
                );

                io.to(
                    room.code
                ).emit(
                    "voteUpdate",
                    {
                        votes:
                            buildDayVoteList(
                                room
                            )
                    }
                );
            }
        );

        // =============================================
        // NEXT PHASE
        // =============================================

        socket.on(
            "nextPhase",
            data => {
                const roomCode =
                    String(
                        data?.roomCode ||
                            ""
                    )
                        .trim()
                        .toUpperCase();

                const room =
                    rooms.get(
                        roomCode
                    );

                if (!room) {
                    return sendError(
                        socket,
                        "Không tìm thấy phòng."
                    );
                }

                if (
                    socket.id !==
                    room.moderatorSocketId
                ) {
                    return sendError(
                        socket,
                        "Chỉ Quản trò mới được chuyển lượt."
                    );
                }

                // -------------------------------------
                // NIGHT -> DAY
                // -------------------------------------

                if (
                    room.phase ===
                    "night"
                ) {
                    clearVoiceTimer(
                        room
                    );

                    const deaths =
                        resolveNight(
                            room
                        );

                    if (
                        deaths.length
                    ) {
                        const names =
                            [];

                        deaths.forEach(
                            playerId => {
                                const dead =
                                    room.players.find(
                                        p =>
                                            p.id ===
                                            playerId
                                    );

                                if (
                                    !dead
                                ) {
                                    return;
                                }

                                names.push(
                                    dead.name
                                );

                                const deadSocket =
                                    io.sockets.sockets.get(
                                        dead.id
                                    );

                                if (
                                    deadSocket
                                ) {
                                    deadSocket.emit(
                                        "dead",
                                        {
                                            nightActions:
                                                [
                                                    {
                                                        text:
                                                            "Bạn đã chết trong đêm."
                                                    }
                                                ]
                                        }
                                    );
                                }
                            }
                        );

                        const message =
                            `🌙 Đêm qua ${names.join(", ")} đã chết.`;

                        io.to(
                            room.code
                        ).emit(
                            "nightResult",
                            {
                                players:
                                    getPublicPlayers(
                                        room
                                    ),

                                message
                            }
                        );

                        logGame(
                            room,
                            message
                        );
                    } else {
                        io.to(
                            room.code
                        ).emit(
                            "nightResult",
                            {
                                players:
                                    getPublicPlayers(
                                        room
                                    ),

                                message:
                                    "🌙 Đêm qua không có ai chết."
                            }
                        );

                        logGame(
                            room,
                            "🌙 Đêm qua không có ai chết."
                        );
                    }

                    resetNight(
                        room
                    );

                    room.votes.clear();

                    const winner =
                        checkWinner(
                            room
                        );

                    if (winner) {
                        room.phase =
                            "gameover";

                        io.to(
                            room.code
                        ).emit(
                            "gameEnded",
                            {
                                message:
                                    winner
                            }
                        );

                        broadcastRoom(
                            room
                        );

                        return;
                    }

                    room.phase =
                        "day";

                    io.to(
                        room.code
                    ).emit(
                        "phaseChanged",
                        {
                            phase:
                                "day",

                            players:
                                getPublicPlayers(
                                    room
                                ),

                            message:
                                "☀️ TRỜI SÁNG"
                        }
                    );

                    broadcastRoom(
                        room
                    );

                    startDayVoice(
                        room
                    );

                    return;
                }

                // -------------------------------------
                // DAY -> DAY VOTE
                // -------------------------------------

                if (
                    room.phase ===
                    "day"
                ) {
                    clearVoiceTimer(
                        room
                    );

                    room.phase =
                        "dayVote";

                    room.votes.clear();

                    io.to(
                        room.code
                    ).emit(
                        "phaseChanged",
                        {
                            phase:
                                "dayVote",

                            players:
                                getPublicPlayers(
                                    room
                                ),

                            message:
                                "🗳️ BẮT ĐẦU BỎ PHIẾU"
                        }
                    );

                    io.to(
                        room.code
                    ).emit(
                        "voteUpdate",
                        {
                            votes:
                                []
                        }
                    );

                    broadcastRoom(
                        room
                    );

                    return;
                }

                // -------------------------------------
                // DAY VOTE -> NIGHT
                // -------------------------------------

                if (
                    room.phase ===
                    "dayVote"
                ) {
                    clearVoiceTimer(
                        room
                    );

                    const result =
                        resolveDayVote(
                            room
                        );

                    if (
                        result.eliminated
                    ) {
                        const deadSocket =
                            io.sockets.sockets.get(
                                result
                                    .eliminated
                                    .id
                            );

                        if (
                            deadSocket
                        ) {
                            deadSocket.emit(
                                "dead",
                                {
                                    nightActions:
                                        [
                                            {
                                                text:
                                                    "Bạn đã bị loại bởi phiếu bầu ban ngày."
                                            }
                                        ]
                                }
                            );
                        }
                    }

                    io.to(
                        room.code
                    ).emit(
                        "voteResult",
                        {
                            players:
                                getPublicPlayers(
                                    room
                                ),

                            votes:
                                result.votes,

                            message:
                                result.message
                        }
                    );

                    logGame(
                        room,
                        result.message
                    );

                    room.votes.clear();

                    const winner =
                        checkWinner(
                            room
                        );

                    if (winner) {
                        room.phase =
                            "gameover";

                        io.to(
                            room.code
                        ).emit(
                            "gameEnded",
                            {
                                message:
                                    winner
                            }
                        );

                        broadcastRoom(
                            room
                        );

                        return;
                    }

                    room.day++;

                    resetNight(
                        room
                    );

                    room.phase =
                        "night";

                    io.to(
                        room.code
                    ).emit(
                        "phaseChanged",
                        {
                            phase:
                                "night",

                            players:
                                getPublicPlayers(
                                    room
                                ),

                            message:
                                `🌙 ĐÊM ${room.day} BẮT ĐẦU`
                        }
                    );

                    broadcastRoom(
                        room
                    );

                    return;
                }
            }
        );

        // =============================================
        // END GAME
        // =============================================

        socket.on(
            "endGame",
            data => {
                const roomCode =
                    String(
                        data?.roomCode ||
                            ""
                    )
                        .trim()
                        .toUpperCase();

                const room =
                    rooms.get(
                        roomCode
                    );

                if (!room) return;

                if (
                    socket.id !==
                    room.moderatorSocketId
                ) {
                    return sendError(
                        socket,
                        "Chỉ Quản trò mới có thể kết thúc game."
                    );
                }

                clearVoiceTimer(
                    room
                );

                room.phase =
                    "gameover";

                io.to(
                    room.code
                ).emit(
                    "gameEnded",
                    {
                        message:
                            "🛑 Quản trò đã kết thúc game."
                    }
                );

                broadcastRoom(
                    room
                );
            }
        );

        // =============================================
        // VOICE NGÀY
        // =============================================

        socket.on(
            "voiceStart",
            () => {
                const room =
                    getRoom(
                        socket
                    );

                if (!room) return;

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (
                    !player ||
                    player.isModerator ||
                    !player.alive
                ) {
                    return;
                }

                io.to(
                    room.code
                ).emit(
                    "voiceStatus",
                    {
                        message:
                            `🎙️ ${player.name} đang phát biểu.`
                    }
                );
            }
        );

        socket.on(
            "voiceStop",
            () => {
                const room =
                    getRoom(
                        socket
                    );

                if (!room) return;

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (!player) return;

                io.to(
                    room.code
                ).emit(
                    "voiceStatus",
                    {
                        message:
                            `⏹️ ${player.name} đã dừng microphone.`
                    }
                );
            }
        );

        // =============================================
        // WOLF VOICE
        // =============================================

        socket.on(
            "wolfVoiceJoin",
            () => {
                const room =
                    getRoom(
                        socket
                    );

                if (!room) return;

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (
                    !player ||
                    player.role !==
                        "Sói" ||
                    !player.alive
                ) {
                    return sendError(
                        socket,
                        "Bạn không phải Sói còn sống."
                    );
                }

                player.wolfVoice =
                    true;

                broadcastWolfVoiceMembers(
                    room
                );
            }
        );

        socket.on(
            "wolfVoiceLeave",
            () => {
                const room =
                    getRoom(
                        socket
                    );

                if (!room) return;

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (player) {
                    player.wolfVoice =
                        false;
                }

                broadcastWolfVoiceMembers(
                    room
                );

                io.to(
                    room.code
                ).emit(
                    "wolfVoiceLeft",
                    {
                        playerId:
                            socket.id
                    }
                );
            }
        );

        socket.on(
            "wolfVoiceStatus",
            data => {
                const room =
                    getRoom(
                        socket
                    );

                if (!room) return;

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (!player) return;

                io.to(
                    room.code
                ).emit(
                    "wolfVoiceStatus",
                    {
                        playerId:
                            socket.id,

                        name:
                            player.name,

                        enabled:
                            Boolean(
                                data?.enabled
                            )
                    }
                );
            }
        );

        // =============================================
        // WEBRTC SIGNAL
        // =============================================

        socket.on(
            "wolfVoiceSignal",
            data => {
                const targetId =
                    String(
                        data?.targetId ||
                            ""
                    );

                if (!targetId) {
                    return;
                }

                io.to(
                    targetId
                ).emit(
                    "wolfVoiceSignal",
                    {
                        fromId:
                            socket.id,

                        senderId:
                            socket.id,

                        signal:
                            data?.signal
                    }
                );
            }
        );

        // =============================================
        // DISCONNECT
        // =============================================

        socket.on(
            "disconnect",
            reason => {
                console.log(
                    "❌ Client ngắt:",
                    socket.id,
                    reason
                );

                // -------------------------------------
                // QUANTRO OFFLINE
                // -------------------------------------

                if (
                    moderatorSocketId ===
                    socket.id
                ) {
                    moderatorSocketId =
                        null;

                    console.log(
                        "👑 Quantro offline."
                    );
                }

                const room =
                    getRoom(
                        socket
                    );

                if (!room) {
                    return;
                }

                clearVoiceTimer(
                    room
                );

                const player =
                    getPlayer(
                        room,
                        socket.id
                    );

                if (player) {
                    player.wolfVoice =
                        false;
                }

                // Xóa người khỏi phòng
                const index =
                    room.players.findIndex(
                        p =>
                            p.id ===
                            socket.id
                    );

                if (
                    index !== -1
                ) {
                    room.players.splice(
                        index,
                        1
                    );
                }

                // Không chuyển quyền
                if (
                    room.moderatorSocketId ===
                    socket.id
                ) {
                    room.moderatorSocketId =
                        null;

                    room.hostId =
                        null;
                }

                if (
                    room.players.length ===
                    0
                ) {
                    rooms.delete(
                        room.code
                    );

                    console.log(
                        `🗑️ Xóa phòng ${room.code}`
                    );

                    return;
                }

                io.to(
                    room.code
                ).emit(
                    "wolfVoiceLeft",
                    {
                        playerId:
                            socket.id
                    }
                );

                broadcastRoom(
                    room
                );
            }
        );
    }
);

// =====================================================
// DAY VOTE HELPERS
// =====================================================

function buildDayVoteList(room) {
    const list = [];

    for (
        const [
            voterId,
            targetId
        ] of room.votes.entries()
    ) {
        const voter =
            room.players.find(
                p =>
                    p.id ===
                    voterId
            );

        const target =
            room.players.find(
                p =>
                    p.id ===
                    targetId
            );

        if (
            !voter ||
            !target
        ) {
            continue;
        }

        list.push({
            voterId,

            voterName:
                voter.name,

            targetId,

            targetName:
                target.name
        });
    }

    return list;
}

// =====================================================
// DAY VOTE RESOLVE
// =====================================================

function resolveDayVote(room) {
    const counts =
        new Map();

    for (
        const targetId of
        room.votes.values()
    ) {
        counts.set(
            targetId,
            (
                counts.get(
                    targetId
                ) || 0
            ) + 1
        );
    }

    const voteList =
        buildDayVoteList(
            room
        );

    if (!counts.size) {
        return {
            eliminated:
                null,

            votes:
                voteList,

            message:
                "🗳️ Không có ai bị loại vì chưa có phiếu."
        };
    }

    let max = 0;
    let winners = [];

    for (
        const [
            targetId,
            count
        ] of counts.entries()
    ) {
        if (
            count > max
        ) {
            max =
                count;

            winners = [
                targetId
            ];
        } else if (
            count === max
        ) {
            winners.push(
                targetId
            );
        }
    }

    // Hòa
    if (
        winners.length !== 1
    ) {
        return {
            eliminated:
                null,

            votes:
                voteList,

            message:
                "🗳️ Hòa phiếu, không ai bị loại."
        };
    }

    const target =
        room.players.find(
            p =>
                p.id ===
                winners[0]
        );

    if (
        !target ||
        target.isModerator
    ) {
        return {
            eliminated:
                null,

            votes:
                voteList,

            message:
                "🗳️ Không xác định được người bị loại."
        };
    }

    target.alive =
        false;

    return {
        eliminated:
            target,

        votes:
            voteList,

        message:
            `🗳️ ${target.name} đã bị loại bởi phiếu bầu.`
    };
}

// =====================================================
// CLEAN ROOM
// =====================================================

setInterval(
    () => {
        for (
            const [
                roomCode,
                room
            ] of rooms.entries()
        ) {
            if (
                room.players.length ===
                0
            ) {
                clearVoiceTimer(
                    room
                );

                rooms.delete(
                    roomCode
                );
            }
        }
    },
    5 * 60 * 1000
);

// =====================================================
// START RENDER
// =====================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "========================================"
        );

        console.log(
            "       MA SOI ONLINE SERVER"
        );

        console.log(
            "========================================"
        );

        console.log(
            `PORT: ${PORT}`
        );

        console.log(
            "Socket.IO: ON"
        );

        console.log(
            "WebRTC signaling: ON"
        );

        console.log(
            "Quantro: Quản trò duy nhất"
        );

        console.log(
            "========================================"
        );
    }
);
