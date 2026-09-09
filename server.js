/* =====================================================
   DAY VOTE BOX
===================================================== */

function renderDayVoteBox() {

    const box =
        $("actions");

    if (!box) {
        return;
    }


    const targetId =
        gameRoom?.dayVoteTargetId;


    const target =
        (gameRoom?.players || [])
            .find(
                player =>
                    player.id === targetId
            );


    /*
     * Chưa có người bị biểu quyết
     */

    if (!target) {

        box.innerHTML = `

            <div class="action">

                ⏳ Chờ Host chọn người
                đưa ra biểu quyết.

            </div>

        `;

        return;
    }


    /*
     * Kiểm tra mình đã vote chưa.
     *
     * Server không gửi lựa chọn riêng
     * về state nên frontend dùng biến local.
     */

    const alreadyVoted =
        window.dayVoteSubmitted === true;


    box.innerHTML = `

        <div class="action">

            <div
                style="
                    font-size:13px;
                    color:#aaa;
                    margin-bottom:6px;
                "
            >
                🗳️ NGƯỜI ĐƯỢC ĐƯA RA BIỂU QUYẾT
            </div>


            <div
                style="
                    font-size:28px;
                    font-weight:900;
                "
            >
                👤 ${esc(target.name)}
            </div>

        </div>


        <button
            id="killVoteButton"
            class="danger"
            style="width:100%"
            ${alreadyVoted ? "disabled" : ""}
            onclick="submitDayVote('kill')"
        >
            👎 GIẾT / TREO CỔ
        </button>


        <button
            id="blankVoteButton"
            class="vote"
            style="width:100%"
            ${alreadyVoted ? "disabled" : ""}
            onclick="submitDayVote('blank')"
        >
            ✊ PHIẾU TRẮNG
        </button>


        <div
            id="voteProgress"
            class="muted"
            style="
                text-align:center;
                margin-top:8px;
            "
        >
            ${
                alreadyVoted
                    ? "✅ Bạn đã biểu quyết."
                    : "⚠️ Bắt buộc chọn 1 phương án."
            }
        </div>

    `;
}


/* =====================================================
   SUBMIT DAY VOTE
===================================================== */

window.submitDayVote =
    function(choice) {

        if (
            !me?.alive
        ) {

            return;
        }


        if (
            currentPhase !==
            "dayVote"
        ) {

            return;
        }


        /*
         * Không cho vote lần 2.
         */

        if (
            window.dayVoteSubmitted === true
        ) {

            return;
        }


        /*
         * Chỉ chấp nhận:
         *
         * kill
         * blank
         */

        if (
            choice !== "kill" &&
            choice !== "blank"
        ) {

            return;
        }


        /*
         * Kiểm tra có target không.
         */

        if (
            !gameRoom?.dayVoteTargetId
        ) {

            msg(
                "actionMessage",
                "Chưa có người được đưa ra biểu quyết.",
                "warn"
            );

            return;
        }


        /*
         * Đánh dấu local ngay lập tức
         * để không thể bấm lần 2.
         */

        window.dayVoteSubmitted =
            true;


        /*
         * Gửi server.
         */

        socket.emit(
            "dayVote",
            {
                choice
            }
        );


        /*
         * Hiện trạng thái ngay.
         */

        renderDayVoteBox();


        msg(

            "actionMessage",

            choice === "kill"

                ? "👎 Bạn đã chọn GIẾT / TREO CỔ."

                : "✊ Bạn đã chọn PHIẾU TRẮNG.",

            "ok"
        );
    };


/* =====================================================
   RESET DAY VOTE
===================================================== */

function resetDayVote() {

    window.dayVoteSubmitted =
        false;
}
