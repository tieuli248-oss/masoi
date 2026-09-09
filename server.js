/* =========================================================
   ACCOUNTS
========================================================= */

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

let moderatorSocketId = null;


/* =========================================================
   AUTHENTICATE
   Thay toàn bộ socket.on("authenticate", ...) cũ bằng đoạn này
========================================================= */

socket.on(
    "authenticate",
    ({ id, password } = {}) => {

        /*
            Chuẩn hóa ID:
            Quantro / QUANTRO / quantro
            đều được hiểu là quantro
        */
        const loginId =
            String(id || "")
                .trim()
                .toLowerCase();

        const loginPassword =
            String(password || "").trim();

        if (!loginId || !loginPassword) {

            socket.emit(
                "errorMessage",
                {
                    message:
                        "Vui lòng nhập ID và mật khẩu."
                }
            );

            return;
        }

        const user =
            USERS[loginId];

        if (!user) {

            socket.emit(
                "errorMessage",
                {
                    message:
                        "ID không tồn tại."
                }
            );

            return;
        }

        if (
            user.password !==
            loginPassword
        ) {

            socket.emit(
                "errorMessage",
                {
                    message:
                        "Mật khẩu không đúng."
                }
            );

            return;
        }


        /* =====================================================
           QUẢN TRÒ
           Chỉ được có 1 phiên Quantro
        ===================================================== */

        if (
            user.accountType ===
            "Quantro"
        ) {

            /*
                Nếu chính socket hiện tại đã đăng nhập
                thì cho phép tiếp tục.
            */
            if (
                moderatorSocketId &&
                moderatorSocketId !==
                    socket.id
            ) {

                const oldSocket =
                    io.sockets.sockets.get(
                        moderatorSocketId
                    );

                /*
                    Nếu socket cũ vẫn còn online
                    thì từ chối đăng nhập mới.
                */
                if (oldSocket) {

                    socket.emit(
                        "errorMessage",
                        {
                            message:
                                "Quản trò đang đăng nhập ở thiết bị khác."
                        }
                    );

                    return;
                }

                /*
                    Socket cũ thực tế đã mất
                    nhưng ID chưa được dọn.
                */
                moderatorSocketId =
                    null;
            }

            moderatorSocketId =
                socket.id;

            socket.data.isModerator =
                true;

        } else {

            socket.data.isModerator =
                false;
        }


        /* =====================================================
           LƯU SESSION
        ===================================================== */

        socket.data.authenticated =
            true;

        socket.data.userId =
            loginId;

        socket.data.accountType =
            user.accountType;


        /* =====================================================
           TRẢ KẾT QUẢ CHO HTML
        ===================================================== */

        socket.emit(
            "authenticateSuccess",
            {
                id:
                    loginId,

                accountType:
                    user.accountType,

                isModerator:
                    socket.data.isModerator
            }
        );

        console.log(
            `LOGIN SUCCESS: ${loginId} | ${socket.id}`
        );
    }
);


/* =========================================================
   JOIN LOBBY
   Thay phần joinLobby của server bằng đoạn này
========================================================= */

socket.on(
    "joinLobby",
    ({ name } = {}) => {

        if (
            !socket.data.authenticated
        ) {

            socket.emit(
                "errorMessage",
                {
                    message:
                        "Bạn chưa đăng nhập."
                }
            );

            return;
        }

        name =
            String(name || "")
                .trim()
                .slice(0, 30);

        if (!name) {

            socket.emit(
                "errorMessage",
                {
                    message:
                        "Vui lòng nhập tên."
                }
            );

            return;
        }


        /* =====================================================
           QUẢN TRÒ
        ===================================================== */

        if (
            socket.data.isModerator
        ) {

            /*
                Tìm phòng của chính Quản trò
            */
            let room =
                Array.from(
                    rooms.values()
                ).find(
                    r =>
                        r.moderatorSocketId ===
                        socket.id
                );


            /*
                Chưa có phòng
                → tự động tạo
            */
            if (!room) {

                room =
                    createRoom();

                room.moderatorSocketId =
                    socket.id;

                room.players.push({
                    id:
                        socket.id,

                    name,

                    userId:
                        socket.data.userId,

                    /*
                        QUẢN TRÒ VẪN LÀ NGƯỜI CHƠI
                        nên nhận role khi game bắt đầu
                    */
                    role: null,

                    alive: true,

                    isModerator:
                        true
                });
            }


            /*
                Cập nhật tên nếu đã tồn tại
            */
            const moderator =
                getPlayer(
                    room,
                    socket.id
                );

            if (moderator) {
                moderator.name =
                    name;
            }


            room.moderatorSocketId =
                socket.id;

            socket.join(
                room.id
            );

            socket.data.roomId =
                room.id;


            /*
                Rất quan trọng:
                HTML hiện tại cần loginSuccess
            */
            socket.emit(
                "loginSuccess",
                {
                    id:
                        socket.data.userId,

                    accountType:
                        "Quantro",

                    room:
                        room.id,

                    code:
                        room.id,

                    isHost:
                        true,

                    isModerator:
                        true,

                    name,

                    players:
                        publicPlayers(room)
                }
            );


            sendPlayers(room);

            emitPhase(room);

            addLog(
                room,
                `👑 Quản trò ${name} đã vào phòng`
            );

            return;
        }


        /* =====================================================
           NGƯỜI CHƠI
        ===================================================== */

        const room =
            findLobbyRoom();

        if (!room) {

            socket.emit(
                "errorMessage",
                {
                    message:
                        "Chưa có phòng của Quản trò."
                }
            );

            return;
        }


        if (
            room.started ||
            room.phase !== "lobby"
        ) {

            socket.emit(
                "errorMessage",
                {
                    message:
                        "Game đã bắt đầu, không thể vào phòng."
                }
            );

            return;
        }


        /*
            Tối đa 20 người tính cả Quản trò
        */
        if (
            room.players.length >= 20
        ) {

            socket.emit(
                "errorMessage",
                {
                    message:
                        "Phòng đã đủ người."
                }
            );

            return;
        }


        /*
            Không trùng tên
        */
        const duplicateName =
            room.players.some(
                player =>
                    player.name
                        .trim()
                        .toLowerCase() ===
                    name
                        .trim()
                        .toLowerCase()
            );

        if (duplicateName) {

            socket.emit(
                "errorMessage",
                {
                    message:
                        "Tên người chơi đã tồn tại."
                }
            );

            return;
        }


        const player = {
            id:
                socket.id,

            name,

            userId:
                socket.data.userId,

            role: null,

            alive: true,

            isModerator:
                false
        };


        room.players.push(
            player
        );

        socket.join(
            room.id
        );

        socket.data.roomId =
            room.id;


        socket.emit(
            "loginSuccess",
            {
                id:
                    socket.data.userId,

                accountType:
                    "nguoichoi",

                room:
                    room.id,

                code:
                    room.id,

                isHost:
                    false,

                isModerator:
                    false,

                name,

                players:
                    publicPlayers(room)
            }
        );


        addLog(
            room,
            `👤 ${name} đã vào phòng`
        );

        sendPlayers(room);

        emitPhase(room);
    }
);


/* =========================================================
   DISCONNECT
   Đảm bảo Quantro thoát thì KHÔNG chuyển quyền
========================================================= */

socket.on(
    "disconnect",
    reason => {

        console.log(
            `DISCONNECT: ${socket.id}`,
            reason
        );


        /*
            Xóa session Quản trò
        */
        if (
            socket.data.isModerator &&
            moderatorSocketId ===
                socket.id
        ) {

            moderatorSocketId =
                null;
        }


        const room =
            getRoom(socket);

        if (!room) {
            return;
        }


        const playerIndex =
            room.players.findIndex(
                player =>
                    player.id ===
                    socket.id
            );

        if (
            playerIndex === -1
        ) {
            return;
        }


        const player =
            room.players[
                playerIndex
            ];


        /*
            QUẢN TRÒ RỜI
            Không chuyển cho ai khác
        */
        if (
            player.isModerator
        ) {

            room.moderatorSocketId =
                null;

            clearTimer(room);

            if (room.started) {

                room.started =
                    false;

                room.phase =
                    "waiting_moderator";

                io.to(room.id).emit(
                    "phaseChanged",
                    {
                        phase:
                            "waiting_moderator",

                        players:
                            publicPlayers(room)
                    }
                );

                io.to(room.id).emit(
                    "errorMessage",
                    {
                        message:
                            "Quản trò đã thoát. Ván game đã dừng."
                    }
                );
            }

            sendPlayers(room);

            /*
                Xóa Quản trò khỏi phòng
            */
            room.players.splice(
                playerIndex,
                1
            );

            sendPlayers(room);

            return;
        }


        /*
            NGƯỜI CHƠI RỜI
        */

        room.players.splice(
            playerIndex,
            1
        );

        delete room.votes[
            socket.id
        ];

        room.wolfVoiceMembers.delete(
            socket.id
        );


        /*
            Nếu người đang nói rời phòng
            → chuyển ngay người tiếp theo
        */
        if (
            room.phase ===
            "daySpeech" &&
            room.timer.speakerId ===
                socket.id
        ) {

            clearTimer(room);

            io.to(room.id).emit(
                "voiceEnded",
                {
                    speakerId:
                        socket.id
                }
            );

            room.speakingPlayers =
                room.speakingPlayers.filter(
                    p =>
                        p.id !==
                        socket.id
                );

            startCurrentSpeaker(
                room
            );
        }


        addLog(
            room,
            `🚪 ${player.name} đã rời game`
        );

        sendPlayers(room);


        if (
            room.players.length ===
            0
        ) {

            clearTimer(room);

            rooms.delete(
                room.id
            );
        }
    }
);
