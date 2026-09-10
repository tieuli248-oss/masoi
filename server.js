// ============================================================
// ADMIN KICK ALL
// Mã đặc biệt: Quyên Kick
// ============================================================

const ADMIN_KICK_CODE = "Quyên Kick";


function kickAllPlayers(code) {

    if (code !== ADMIN_KICK_CODE) {
        return {
            success: false,
            message: "❌ Mã kick không đúng."
        };
    }

    // Hủy timer hiện tại
    clearPhaseTimer();

    // Tăng epoch để vô hiệu hóa các callback cũ
    room.epoch += 1;

    // Thông báo cho tất cả client
    io.emit("adminKickAll", {
        message: "🚨 Phòng đã được Admin reset. Tất cả người chơi đã bị kick."
    });

    // Reset toàn bộ game
    room.started = false;
    room.phase = "lobby";
    room.nightNumber = 0;

    room.logs = [];
    room.roleComposition = [];

    room.dayVotes.clear();

    room.night = null;

    room.hunterQueue = [];
    room.resolvingHunters = false;
    room.hunterResolver = null;

    // Xóa toàn bộ người chơi
    room.players = [];

    // Không còn host
    room.hostId = null;

    // Broadcast phòng mới
    broadcastRoom();

    return {
        success: true,
        message: "✅ Đã kick toàn bộ người chơi và reset phòng."
    };
}
