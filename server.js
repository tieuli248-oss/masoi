// server.js

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/*
=========================================================
TÀI KHOẢN
=========================================================
*/

const ACCOUNTS = {
    Quantro: {
        password: "19001080",
        type: "host"
    },

    nguoichoi: {
        password: "123456",
        type: "player"
    }
};


/*
=========================================================
 PHÒNG GAME
=========================================================
*/

const ROOM_CODE = "MASOI";

const rooms = new Map();

rooms.set(ROOM_CODE, {
    code: ROOM_CODE,

    hostId: null,

    players: new Map(),

    phase: "lobby",

    started: false,

    wolfCount: 1,

    votes: [],

    nightActions: [],

    wolfTargets: new Map(),

    guardTarget: null,

    roles: new Map(),

    /*
    Voice
    */

    voiceRound: 1,

    voiceIndex: 0,

    voiceOrder: [],

    voiceActive: false,

    voiceTimer: null,

    voiceSeconds: 30,

    voiceSpeakerId: null,

    /*
    Game
    */

    dayNumber: 0
});


/*
=========================================================
 EXPRESS
=========================================================
*/

app.use(express.json());

app.use(express.static(path.join(__dirname)));


/*
=========================================================
 ROUTE
=========================================================
*/

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "index.html")
    );

});


/*
=========================================================
 SOCKET.IO
=========================================================
*/

io.on("connection", (socket) => {

    console.log(
        "Kết nối:",
        socket.id
    );


    /*
    =====================================================
    LOGIN
    =====================================================
    */

    socket.on("login", (data) => {

        const id =
            String(data?.accountType === "host"
                ? "Quantro"
                : "nguoichoi");

        const name =
            String(data?.name || "")
                .trim()
                .substring(0, 20);

        if (!name) {

            return sendError(
                socket,
                "Tên người chơi không hợp lệ."
            );

        }


        const account =
            ACCOUNTS[id];

        if (!account) {

            return sendError(
                socket,
                "Tài khoản không tồn tại."
            );

        }


        /*
        -------------------------------------------------
        Vì index.html đã kiểm tra tài khoản,
        server vẫn phải kiểm tra lại.
        -------------------------------------------------
        */

        socket.accountId = id;

        socket.accountType =
            account.type;

        socket.playerName = name;


        /*
        -------------------------------------------------
        QUẢN TRÒ
        -------------------------------------------------
        */

        if (account.type === "host") {

            /*
            Chỉ một socket làm quản trò.
            */

            const room =
                rooms.get(ROOM_CODE);

            if (room.hostId &&
                room.hostId !== socket.id) {

                return sendError(
                    socket,
                    "Quản trò đã đăng nhập ở thiết bị khác."
                );

            }

            room.hostId =
                socket.id;

            socket.join(ROOM_CODE);

            /*
            Không thêm quản trò vào danh sách
            người chơi.
            */

            socket.roomCode =
                ROOM_CODE;


            socket.emit(
                "loginSuccess",
                {
                    room: getPublicRoom(room),
                    players: getPublicPlayers(room),
                    isHost: true
                }
            );


            broadcastRoom(room);

            console.log(
                "Quản trò đã vào phòng."
            );

            return;
        }


        /*
        -------------------------------------------------
        NGƯỜI CHƠI
        -------------------------------------------------
        */

        const room =
            rooms.get(ROOM_CODE);

        if (!room) {

            return sendError(
                socket,
                "Phòng chưa tồn tại."
            );

        }


        /*
        Không cho người mới vào giữa game
        nếu game đã bắt đầu.
        */

        if (room.started) {

            return sendError(
                socket,
                "Game đã bắt đầu. Không thể vào giữa game."
            );

        }


        const player = {

            id: socket.id,

            name,

            alive: true,

            role: null,

            connected: true,

            hasVoted: false

        };


        room.players.set(
            socket.id,
            player
        );

        socket.join(ROOM_CODE);

        socket.roomCode =
            ROOM_CODE;


        socket.emit(
            "loginSuccess",
            {
                room: getPublicRoom(room),
                players: getPublicPlayers(room),
                isHost: false
            }
        );


        broadcastRoom(room);

        console.log(
            `${name} đã vào phòng.`
        );

    });


    /*
    =====================================================
    BẮT ĐẦU GAME
    =====================================================
    */

    socket.on("startGame", (data) => {

        const room =
            getRoomFromSocket(socket);

        if (!room)
            return;

        if (socket.id !== room.hostId) {

            return sendError(
                socket,
                "Chỉ quản trò mới được bắt đầu game."
            );

        }


        if (room.started) {

            return sendError(
                socket,
                "Game đã bắt đầu."
            );

        }


        const playerList =
            Array.from(room.players.values())
                .filter(p => p.connected);


        if (playerList.length < 3) {

            return sendError(
                socket,
                "Cần ít nhất 3 người chơi."
            );

        }


        let wolfCount =
            Number(data?.wolfCount || 1);


        /*
        Không cho số Sói vượt quá số người.
        */

        wolfCount =
            Math.max(
                1,
                Math.min(
                    wolfCount,
                    Math.floor(
                        playerList.length / 3
                    )
                )
            );


        room.wolfCount =
            wolfCount;

        room.started = true;

        room.phase = "night";

        room.dayNumber = 0;


        assignRoles(
            room,
            playerList,
            wolfCount
        );


        /*
        Gửi role riêng cho từng người.
        */

        for (const player of playerList) {

            io.to(player.id).emit(
                "roleAssigned",
                {
                    role: player.role
                }
            );

        }


        io.to(ROOM_CODE).emit(
            "gameStarted",
            {
                room: getPublicRoom(room),
                players: getPublicPlayers(room)
            }
        );


        /*
        Role riêng
        */

        for (const player of playerList) {

            io.to(player.id).emit(
                "gameStarted",
                {
                    room: getPublicRoom(room),
                    players: getPublicPlayers(room),
                    role: player.role
                }
            );

        }


        addLog(
            room,
            "🌙 Game bắt đầu. Trời tối..."
        );


        broadcastRoom(room);

    });


    /*
    =====================================================
    SÓI CẮN
    =====================================================
    */

    socket.on("wolfKill", (data) => {

        const room =
            getRoomFromSocket(socket);

        if (!room)
            return;

        if (room.phase !== "night") {

            return sendError(
                socket,
                "Chỉ được cắn vào ban đêm."
            );

        }


        const wolf =
            room.players.get(socket.id);

        if (!wolf)
            return;


        if (!wolf.alive) {

            return sendError(
                socket,
                "Bạn đã chết."
            );

        }


        if (wolf.role !== "Sói") {

            return sendError(
                socket,
                "Bạn không phải Sói."
            );

        }


        const target =
            room.players.get(
                data?.targetId
            );


        if (!target ||
            !target.alive ||
            target.id === socket.id) {

            return sendError(
                socket,
                "Mục tiêu không hợp lệ."
            );

        }


        room.wolfTargets.set(
            socket.id,
            target.id
        );


        socket.emit(
            "voiceStatus",
            {
                message:
                    `🐺 Bạn đã chọn cắn ${target.name}.`
            }
        );


        /*
        Thông tin cho quản trò.
        */

        if (room.hostId) {

            io.to(room.hostId).emit(
                "moderatorInfo",
                {
                    message:
                        `🐺 ${wolf.name} đã chọn cắn ${target.name}.`
                }
            );

        }


        /*
        Nếu tất cả Sói đã chọn,
        server có thể thông báo cho quản trò.
        */

        const wolves =
            Array.from(room.players.values())
                .filter(
                    p =>
                        p.alive &&
                        p.role === "Sói"
                );


        const allSelected =
            wolves.every(
                wolf =>
                    room.wolfTargets.has(
                        wolf.id
                    )
            );


        if (allSelected) {

            addLog(
                room,
                "🐺 Tất cả Sói đã chọn mục tiêu."
            );

        }

    });


    /*
    =====================================================
    CHUYỂN LƯỢT
    =====================================================
    */

    socket.on("nextPhase", (data) => {

        const room =
            getRoomFromSocket(socket);

        if (!room)
            return;

        if (socket.id !== room.hostId) {

            return sendError(
                socket,
                "Chỉ quản trò mới được chuyển lượt."
            );

        }


        if (!room.started)
            return;


        /*
        ĐÊM -> NGÀY
        */

        if (room.phase === "night") {

            resolveNight(room);

            return;

        }


        /*
        PHÁT BIỂU -> VOTE
        */

        if (room.phase === "daySpeech") {

            stopVoice(room);

            startVote(room);

            return;

        }


        /*
        VOTE -> ĐÊM
        */

        if (room.phase === "dayVote") {

            resolveVote(room);

            return;

        }

    });


    /*
    =====================================================
    VOTE
    =====================================================
    */

    socket.on("vote", (data) => {

        const room =
            getRoomFromSocket(socket);

        if (!room)
            return;

        if (room.phase !== "dayVote") {

            return sendError(
                socket,
                "Hiện chưa phải thời gian vote."
            );

        }


        const voter =
            room.players.get(socket.id);

        if (!voter)
            return;


        if (!voter.alive) {

            return sendError(
                socket,
                "Người đã chết không được vote."
            );

        }


        const target =
            room.players.get(
                data?.targetId
            );


        if (!target ||
            !target.alive ||
            target.id === voter.id) {

            return sendError(
                socket,
                "Người được vote không hợp lệ."
            );

        }


        /*
        Một người chỉ vote một lần.
        Vote lại sẽ thay đổi phiếu.
        */

        room.votes =
            room.votes.filter(
                vote =>
                    vote.voterId !== voter.id
            );


        room.votes.push({

            voterId: voter.id,

            voterName: voter.name,

            targetId: target.id,

            targetName: target.name

        });


        broadcastVotes(room);


        /*
        Nếu tất cả người sống đã vote
        -> tự động xử lý.
        */

        const alivePlayers =
            getAlivePlayers(room);


        if (
            room.votes.length >=
            alivePlayers.length
        ) {

            setTimeout(() => {

                if (
                    room.phase === "dayVote"
                ) {

                    resolveVote(room);

                }

            }, 700);

        }

    });


    /*
    =====================================================
    VOICE START
    =====================================================
    */

    socket.on("voiceStart", (data) => {

        const room =
            getRoomFromSocket(socket);

        if (!room)
            return;

        if (!room.voiceActive)
            return;


        if (
            room.voiceSpeakerId !==
            socket.id
        ) {

            return sendError(
                socket,
                "Chưa tới lượt bạn."
            );

        }


        io.to(ROOM_CODE).emit(
            "voiceStatus",
            {
                message:
                    `🎙️ ${socket.playerName} đang phát biểu.`
            }
        );

    });


    /*
    =====================================================
    VOICE STOP
    =====================================================
    */

    socket.on("voiceStop", () => {

        const room =
            getRoomFromSocket(socket);

        if (!room)
            return;

        if (
            room.voiceSpeakerId ===
            socket.id
        ) {

            endVoiceTurn(room);

        }

    });


    /*
    =====================================================
    WEBRTC SIGNAL
    =====================================================
    */

    socket.on("voiceSignal", (data) => {

        if (!data?.to)
            return;


        io.to(data.to).emit(
            "voiceSignal",
            {
                from: socket.id,
                data: data.data
            }
        );

    });


    /*
    =====================================================
    END GAME
    =====================================================
    */

    socket.on("endGame", (data) => {

        const room =
            getRoomFromSocket(socket);

        if (!room)
            return;

        if (socket.id !== room.hostId) {

            return sendError(
                socket,
                "Chỉ quản trò mới được kết thúc game."
            );

        }


        stopVoice(room);

        io.to(ROOM_CODE).emit(
            "gameEnded",
            {
                message:
                    "☠️ Quản trò đã kết thúc game."
            }
        );


        resetRoom(room);

    });


    /*
    =====================================================
    DISCONNECT
    =====================================================
    */

    socket.on("disconnect", () => {

        console.log(
            "Ngắt kết nối:",
            socket.id
        );


        /*
        Nếu quản trò thoát
        */

        for (const room of rooms.values()) {

            if (
                room.hostId ===
                socket.id
            ) {

                room.hostId = null;

                io.to(room.code).emit(
                    "gameLog",
                    {
                        message:
                            "⚠️ Quản trò đã thoát."
                    }
                );

                broadcastRoom(room);

                continue;
            }


            /*
            Người chơi thoát
            */

            const player =
                room.players.get(
                    socket.id
                );

            if (player) {

                player.connected =
                    false;

                /*
                Không xóa người chơi ngay,
                để game vẫn giữ trạng thái.
                */

                broadcastRoom(room);

            }

        }

    });

});


/*
=========================================================
 CHIA VAI
=========================================================
*/

function assignRoles(
    room,
    players,
    wolfCount
) {

    room.roles.clear();


    /*
    Trộn người chơi
    */

    const shuffled =
        [...players]
            .sort(
                () => Math.random() - 0.5
            );


    /*
    SÓI
    */

    for (
        let i = 0;
        i < wolfCount;
        i++
    ) {

        shuffled[i].role =
            "Sói";

        room.roles.set(
            shuffled[i].id,
            "Sói"
        );

    }


    /*
    Các role đặc biệt
    */

    let index =
        wolfCount;


    if (shuffled[index]) {

        shuffled[index].role =
            "Tiên tri";

        room.roles.set(
            shuffled[index].id,
            "Tiên tri"
        );

        index++;

    }


    if (shuffled[index]) {

        shuffled[index].role =
            "Bảo vệ";

        room.roles.set(
            shuffled[index].id,
            "Bảo vệ"
        );

        index++;

    }


    if (shuffled[index]) {

        shuffled[index].role =
            "Thợ săn";

        room.roles.set(
            shuffled[index].id,
            "Thợ săn"
        );

        index++;

    }


    /*
    Còn lại = Dân làng
    */

    for (; index < shuffled.length; index++) {

        shuffled[index].role =
            "Dân làng";

        room.roles.set(
            shuffled[index].id,
            "Dân làng"
        );

    }

}


/*
=========================================================
 XỬ LÝ BAN ĐÊM
=========================================================
*/

function resolveNight(room) {

    if (room.phase !== "night")
        return;


    const alive =
        getAlivePlayers(room);


    /*
    -----------------------------------------------------
    Tìm mục tiêu Sói
    -----------------------------------------------------
    */

    const targets =
        Array.from(
            room.wolfTargets.values()
        );


    let victimId = null;


    if (targets.length) {

        /*
        Nếu nhiều Sói chọn khác nhau,
        lấy mục tiêu được chọn nhiều nhất.
        */

        const counts =
            new Map();

        for (const id of targets) {

            counts.set(
                id,
                (counts.get(id) || 0) + 1
            );

        }


        let highest = 0;

        for (const [id, count] of counts) {

            if (count > highest) {

                highest = count;

                victimId = id;

            }

        }

    }


    /*
    -----------------------------------------------------
    Bảo vệ
    -----------------------------------------------------
    */

    if (
        victimId &&
        room.guardTarget === victimId
    ) {

        const protectedPlayer =
            room.players.get(
                victimId
            );

        if (protectedPlayer) {

            room.nightActions.push({

                type: "attack",

                targetId: victimId,

                text:
                    `🛡️ ${protectedPlayer.name} đã được bảo vệ và sống sót.`

            });

        }

    }

    else if (victimId) {

        const victim =
            room.players.get(
                victimId
            );

        if (victim) {

            victim.alive = false;

            room.nightActions.push({

                type: "attack",

                targetId: victim.id,

                text:
                    `🐺 Sói đã cắn ${victim.name}.`

            });

        }

    }

    else {

        room.nightActions.push({

            type: "none",

            text:
                "🌙 Đêm nay không có ai bị cắn."

        });

    }


    /*
    -----------------------------------------------------
    Xóa action đêm
    -----------------------------------------------------
    */

    room.wolfTargets.clear();

    room.guardTarget = null;


    /*
    -----------------------------------------------------
    Gửi kết quả cho quản trò
    -----------------------------------------------------
    */

    if (room.hostId) {

        io.to(room.hostId).emit(
            "nightResult",
            {
                players:
                    getPublicPlayers(room),

                actions:
                    room.nightActions
            }
        );

    }


    /*
    -----------------------------------------------------
    Gửi thông tin cho người chết
    -----------------------------------------------------
    */

    const deadPlayers =
        Array.from(
            room.players.values()
        )
            .filter(
                p =>
                    !p.alive &&
                    p.connected
            );


    for (
        const dead of deadPlayers
    ) {

        io.to(dead.id).emit(
            "dead",
            {
                nightActions:
                    room.nightActions
            }
        );

    }


    /*
    -----------------------------------------------------
    Kiểm tra thắng
    -----------------------------------------------------
    */

    const winner =
        checkWinner(room);

    if (winner) {

        endGameWithWinner(
            room,
            winner
        );

        return;
    }


    /*
    -----------------------------------------------------
    Sang ngày
    -----------------------------------------------------
    */

    room.phase =
        "daySpeech";

    room.dayNumber++;

    room.votes = [];

    room.nightActions = [];


    io.to(ROOM_CODE).emit(
        "phaseChanged",
        {
            phase: "daySpeech",

            players:
                getPublicPlayers(room),

            message:
                `☀️ Ngày ${room.dayNumber} bắt đầu.`
        }
    );


    /*
    Bắt đầu voice
    */

    setTimeout(() => {

        if (
            room.started &&
            room.phase === "daySpeech"
        ) {

            startVoice(room);

        }

    }, 1000);


    broadcastRoom(room);

}


/*
=========================================================
 BẮT ĐẦU VOTE
=========================================================
*/

function startVote(room) {

    if (!room.started)
        return;


    room.phase =
        "dayVote";

    room.votes = [];


    io.to(ROOM_CODE).emit(
        "phaseChanged",
        {
            phase: "dayVote",

            players:
                getPublicPlayers(room),

            message:
                "🗳️ Bắt đầu bỏ phiếu."
        }
    );


    broadcastVotes(room);

}


/*
=========================================================
 XỬ LÝ VOTE
=========================================================
*/

function resolveVote(room) {

    if (room.phase !== "dayVote")
        return;


    /*
    Đếm phiếu
    */

    const counts =
        new Map();


    for (const vote of room.votes) {

        counts.set(
            vote.targetId,
            (counts.get(vote.targetId) || 0) + 1
        );

    }


    let maxVotes = 0;

    let eliminatedId = null;

    let tie = false;


    for (
        const [targetId, count]
        of counts
    ) {

        if (count > maxVotes) {

            maxVotes =
                count;

            eliminatedId =
                targetId;

            tie = false;

        }

        else if (
            count === maxVotes &&
            count > 0
        ) {

            tie = true;

        }

    }


    let message = "";


    if (tie) {

        eliminatedId = null;

        message =
            "⚖️ Kết quả hòa phiếu. Không ai bị loại.";

    }

    else if (eliminatedId) {

        const eliminated =
            room.players.get(
                eliminatedId
            );

        if (eliminated) {

            eliminated.alive =
                false;

            message =
                `☠️ ${eliminated.name} đã bị loại.`;

        }

    }

    else {

        message =
            "🗳️ Không có ai bị loại.";

    }


    io.to(ROOM_CODE).emit(
        "voteResult",
        {
            players:
                getPublicPlayers(room),

            votes:
                room.votes,

            message
        }
    );


    /*
    Người vừa chết
    */

    if (eliminatedId) {

        const dead =
            room.players.get(
                eliminatedId
            );

        if (dead) {

            io.to(dead.id).emit(
                "dead",
                {
                    nightActions:
                        room.nightActions
                }
            );

        }

    }


    /*
    Kiểm tra thắng
    */

    const winner =
        checkWinner(room);


    if (winner) {

        setTimeout(() => {

            endGameWithWinner(
                room,
                winner
            );

        }, 1000);

        return;
    }


    /*
    Sang đêm
    */

    setTimeout(() => {

        if (!room.started)
            return;

        room.phase =
            "night";

        room.votes = [];

        room.wolfTargets.clear();

        room.guardTarget = null;

        io.to(ROOM_CODE).emit(
            "phaseChanged",
            {
                phase: "night",

                players:
                    getPublicPlayers(room),

                message:
                    "🌙 Trời tối. Bắt đầu một đêm mới."
            }
        );


        broadcastRoom(room);

    }, 1500);

}


/*
=========================================================
 VOICE
=========================================================
*/

function startVoice(room) {

    stopVoiceTimerOnly(room);


    const alive =
        getAlivePlayers(room);


    if (!alive.length) {

        startVote(room);

        return;
    }


    room.voiceOrder =
        alive.map(
            player => player.id
        );


    room.voiceRound =
        1;

    room.voiceIndex =
        0;

    room.voiceActive =
        true;


    beginVoiceTurn(room);

}


/*
=========================================================
 BẮT ĐẦU MỘT LƯỢT NÓI
=========================================================
*/

function beginVoiceTurn(room) {

    stopVoiceTimerOnly(room);


    /*
    Tìm người sống tiếp theo.
    */

    while (
        room.voiceIndex <
        room.voiceOrder.length
    ) {

        const id =
            room.voiceOrder[
                room.voiceIndex
            ];

        const player =
            room.players.get(id);

        if (
            player &&
            player.alive &&
            player.connected
        ) {

            room.voiceSpeakerId =
                player.id;

            break;

        }

        room.voiceIndex++;

    }


    /*
    Hết người trong vòng
    */

    if (
        room.voiceIndex >=
        room.voiceOrder.length
    ) {

        if (room.voiceRound < 2) {

            room.voiceRound =
                2;

            room.voiceIndex =
                0;

            beginVoiceTurn(room);

            return;

        }


        /*
        Đủ 2 vòng
        */

        room.voiceActive =
            false;

        room.voiceSpeakerId =
            null;

        io.to(ROOM_CODE).emit(
            "voiceEnded"
        );


        /*
        Tự động sang vote
        */

        setTimeout(() => {

            if (
                room.started &&
                room.phase === "daySpeech"
            ) {

                startVote(room);

            }

        }, 700);

        return;

    }


    const speaker =
        room.players.get(
            room.voiceSpeakerId
        );


    room.voiceSeconds =
        30;


    io.to(ROOM_CODE).emit(
        "voiceTurn",
        {
            playerId:
                speaker.id,

            playerName:
                speaker.name,

            round:
                room.voiceRound,

            seconds:
                30
        }
    );


    io.to(ROOM_CODE).emit(
        "voiceStatus",
        {
            message:
                `🎙️ Đến lượt ${speaker.name} phát biểu.`
        }
    );


    /*
    -----------------------------------------------------
    Timer 30 giây
    -----------------------------------------------------
    */

    room.voiceTimer =
        setInterval(() => {

            room.voiceSeconds--;

            io.to(ROOM_CODE).emit(
                "voiceTick",
                {
                    seconds:
                        room.voiceSeconds
                }
            );


            if (
                room.voiceSeconds <= 0
            ) {

                endVoiceTurn(room);

            }

        }, 1000);

}


/*
=========================================================
 KẾT THÚC LƯỢT NÓI
=========================================================
*/

function endVoiceTurn(room) {

    if (!room.voiceActive)
        return;


    stopVoiceTimerOnly(room);


    io.to(ROOM_CODE).emit(
        "voiceEnded"
    );


    room.voiceIndex++;


    setTimeout(() => {

        if (
            room.started &&
            room.phase === "daySpeech"
        ) {

            beginVoiceTurn(room);

        }

    }, 500);

}


/*
=========================================================
 STOP VOICE
=========================================================
*/

function stopVoice(room) {

    stopVoiceTimerOnly(room);

    room.voiceActive =
        false;

    room.voiceSpeakerId =
        null;

    io.to(ROOM_CODE).emit(
        "voiceEnded"
    );

}


function stopVoiceTimerOnly(room) {

    if (room.voiceTimer) {

        clearInterval(
            room.voiceTimer
        );

        room.voiceTimer =
            null;

    }

}


/*
=========================================================
 CHECK WINNER
=========================================================
*/

function checkWinner(room) {

    const alive =
        getAlivePlayers(room);


    const wolves =
        alive.filter(
            p => p.role === "Sói"
        );


    const villagers =
        alive.filter(
            p => p.role !== "Sói"
        );


    if (wolves.length === 0) {

        return "Dân làng";

    }


    if (
        wolves.length >=
        villagers.length
    ) {

        return "Sói";

    }


    return null;

}


/*
=========================================================
 GAME WINNER
=========================================================
*/

function endGameWithWinner(
    room,
    winner
) {

    stopVoice(room);

    room.started =
        false;


    const roleList =
        Array.from(
            room.players.values()
        )
        .map(
            p =>
                `${p.name}: ${p.role}`
        )
        .join("\n");


    let message =
        winner === "Sói"
            ? "🐺 Phe Sói thắng!"
            : "👨‍🌾 Phe Dân làng thắng!";


    io.to(ROOM_CODE).emit(
        "gameEnded",
        {
            message:
                message +
                "\n\nThân phận:\n" +
                roleList
        }
    );

}


/*
=========================================================
 RESET ROOM
=========================================================
*/

function resetRoom(room) {

    stopVoice(room);


    room.started =
        false;

    room.phase =
        "lobby";

    room.votes =
        [];

    room.nightActions =
        [];

    room.wolfTargets.clear();

    room.guardTarget =
        null;

    room.roles.clear();

    room.voiceRound =
        1;

    room.voiceIndex =
        0;

    room.voiceOrder =
        [];

    room.dayNumber =
        0;


    for (
        const player
        of room.players.values()
    ) {

        player.alive =
            true;

        player.role =
            null;

        player.hasVoted =
            false;

    }


    broadcastRoom(room);

}


/*
=========================================================
 GET ROOM
=========================================================
*/

function getRoomFromSocket(socket) {

    if (!socket.roomCode)
        return null;

    return rooms.get(
        socket.roomCode
    );

}


/*
=========================================================
 ALIVE PLAYERS
=========================================================
*/

function getAlivePlayers(room) {

    return Array.from(
        room.players.values()
    )
    .filter(
        p =>
            p.alive &&
            p.connected
    );

}


/*
=========================================================
 PUBLIC PLAYERS
=========================================================
*/

function getPublicPlayers(room) {

    return Array.from(
        room.players.values()
    )
    .map(player => ({

        id:
            player.id,

        name:
            player.name,

        alive:
            player.alive,

        connected:
            player.connected,

        isHost:
            false

    }));

}


/*
=========================================================
 PUBLIC ROOM
=========================================================
*/

function getPublicRoom(room) {

    return {

        code:
            room.code,

        phase:
            room.phase,

        started:
            room.started,

        dayNumber:
            room.dayNumber,

        wolfCount:
            room.wolfCount

    };

}


/*
=========================================================
 BROADCAST ROOM
=========================================================
*/

function broadcastRoom(room) {

    const players =
        getPublicPlayers(room);


    /*
    Quản trò
    */

    if (room.hostId) {

        io.to(room.hostId).emit(
            "roomUpdate",
            {
                room:
                    getPublicRoom(room),

                players
            }
        );

    }


    /*
    Người chơi
    */

    for (
        const player
        of room.players.values()
    ) {

        if (!player.connected)
            continue;

        io.to(player.id).emit(
            "roomUpdate",
            {
                room:
                    getPublicRoom(room),

                players
            }
        );

    }


    io.to(room.code).emit(
        "playersUpdate",
        {
            players
        }
    );

}


/*
=========================================================
 BROADCAST VOTE
=========================================================
*/

function broadcastVotes(room) {

    io.to(room.code).emit(
        "voteUpdate",
        {
            votes:
                room.votes
        }
    );

}


/*
=========================================================
 GAME LOG
=========================================================
*/

function addLog(room, message) {

    io.to(room.code).emit(
        "gameLog",
        {
            message
        }
    );

}


/*
=========================================================
 ERROR
=========================================================
*/

function sendError(
    socket,
    message
) {

    socket.emit(
        "errorMessage",
        {
            message
        }
    );

}


/*
=========================================================
 START SERVER
=========================================================
*/

server.listen(
    PORT,
    () => {

        console.log(
            "================================="
        );

        console.log(
            "🐺 MA SÓI ONLINE"
        );

        console.log(
            `Server chạy tại: http://localhost:${PORT}`
        );

        console.log(
            "================================="
        );

    }
);
