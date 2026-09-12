// Ma Sói server bootstrap.
// server-core.js là snapshot server trước khi cập nhật luật ngày 12/09/2026.
// File này áp dụng các rule patch rồi chạy server-core.js, để giữ nguyên toàn bộ
// audio/reconnect/chat/Hunter logic đang chạy trên production.

const fs = require("fs");
const path = require("path");
const Module = require("module");

const coreFile = path.join(__dirname, "server-core.js");
let source = fs.readFileSync(coreFile, "utf8");

function replaceOnce(oldText, newText, label) {
    if (!source.includes(oldText)) {
        throw new Error(`Không tìm thấy đoạn cần patch: ${label}`);
    }
    source = source.replace(oldText, newText);
}

// =========================================================
// 1) PHÙ THỦY: 50 GIÂY ĐỘC + 10 GIÂY CỨU
// =========================================================
replaceOnce(
`const TIME = {
    night: 45,
    cupidPair: 15,
    witchPoison: 45,
    witchSave: 15,
    hunterShoot: 15,
    daySpeech: 180,
    dayVote: 30
};`,
`const TIME = {
    night: 50,
    cupidPair: 15,
    witchPoison: 50,
    witchSave: 10,
    hunterShoot: 15,
    daySpeech: 180,
    dayVote: 30
};`,
"TIME 50/10"
);

source = source
    .replaceAll("FIRST 45s OF NIGHT", "FIRST 50s OF NIGHT")
    .replaceAll("cửa sổ 45s", "cửa sổ 50s")
    .replaceAll("Trong 45 giây đầu của đêm, chọn người để đầu độc. Bạn có thể đổi mục tiêu cho tới khi hết 45 giây.", "Trong 50 giây đầu của đêm, chọn người để đầu độc. Bạn có thể đổi mục tiêu cho tới khi hết 50 giây.")
    .replaceAll("Hết 45 giây. Mục tiêu độc cuối cùng:", "Hết 50 giây. Mục tiêu độc cuối cùng:")
    .replaceAll("Hết 45 giây. Bạn không chọn ai nên bình độc vẫn còn.", "Hết 50 giây. Bạn không chọn ai nên bình độc vẫn còn.")
    .replaceAll("SAVE 15s AFTER WOLF LOCKS AT 45s", "SAVE 10s AFTER WOLF LOCKS AT 50s")
    .replaceAll("Bạn có 15 giây để quyết định cứu.", "Bạn có 10 giây để quyết định cứu.")
    .replaceAll("0-45s: khôi phục mục tiêu độc đang tạm chọn.", "0-50s: khôi phục mục tiêu độc đang tạm chọn.");

// =========================================================
// 2) KHÔNG AUTO-RESET CHỈ VÌ NGƯỜI CHƠI ĐÃ CHẾT
//    Chỉ mất kết nối / rời game mới tính inactive.
// =========================================================
replaceOnce(
`            p.connected === false ||
            p.alive === false ||
            p.leftGame === true`,
`            p.connected === false ||
            p.leftGame === true`,
"auto reset không tính người chết"
);
source = source
    .replaceAll("AUTO RESET - OFFLINE + DEAD >= 50%", "AUTO RESET - OFFLINE / LEFT >= 50%")
    .replaceAll("người đã chết, mất kết nối hoặc rời phòng", "người mất kết nối hoặc rời phòng");

// =========================================================
// 3) COUPLE WIN LOGIC
//    - Couple còn nguyên 2 người => khóa parity Sói/Dân.
//    - Chỉ còn đúng Couple => Couple thắng.
//    - Couple chết/bị phá => quay về luật thắng bình thường.
//    - 0 người sống => Hòa.
// =========================================================
const winnerStart = source.indexOf("function checkWinner() {");
const winnerEndMarker = "/* =========================================================\n   START GAME";
const winnerEnd = source.indexOf(winnerEndMarker, winnerStart);
if (winnerStart < 0 || winnerEnd < 0) {
    throw new Error("Không tìm thấy checkWinner để patch");
}

const newWinner = `function checkWinner() {

    if (autoResetForInactivePlayers()) {
        return true;
    }

    const alive = alivePlayers();

    // Không còn ai sống => Hòa.
    if (alive.length === 0) {
        endGame("Hòa", "⚖️ Tất cả người chơi đã chết.");
        return true;
    }

    // Tìm Couple còn nguyên cả hai người sống.
    let livingCouple = null;
    for (const first of alive) {
        if (!first.loverId) continue;
        const second = alive.find(p => p.id === first.loverId);
        if (!second || second.loverId !== first.id) continue;
        livingCouple = [first, second];
        break;
    }

    // Chỉ còn đúng hai người và chính là Couple => Couple thắng.
    if (
        livingCouple &&
        alive.length === 2 &&
        livingCouple.every(p => alive.some(a => a.id === p.id))
    ) {
        const cupid = room.players.find(p => p.role === "Cupid");
        endGame(
            "Couple",
            cupid
                ? `💘 ${livingCouple[0].name} và ${livingCouple[1].name} chiến thắng cùng nhau - Cupid (${cupid.name}) đã se duyên.`
                : `💘 ${livingCouple[0].name} và ${livingCouple[1].name} chiến thắng cùng nhau.`
        );
        return true;
    }

    // Couple còn nguyên và vẫn còn người thứ ba trở lên:
    // KHÔNG xét Sói >= phe còn lại, KHÔNG xét Sói = 0.
    // Game phải tiếp tục cho tới khi Couple thắng hoặc Couple bị phá.
    if (livingCouple) {
        return false;
    }

    // Couple đã chết/bị phá => trở lại luật bình thường.
    const wolves = alive.filter(p => p.role === "Sói").length;
    const nonWolves = alive.length - wolves;

    if (wolves === 0) {
        endGame("Dân", "👨‍🌾 Phe Dân thắng!");
        return true;
    }

    if (wolves >= nonWolves) {
        endGame("Sói", "🐺 Phe Sói thắng!");
        return true;
    }

    return false;
}


`;
source = source.slice(0, winnerStart) + newWinner + source.slice(winnerEnd);

// =========================================================
// 4) VOTE BAN NGÀY
//    Mẫu số của mục tiêu A = tổng người còn sống - chính A.
//    Phải > 50%. Đúng 50% thì sống.
//    Vẫn giữ luật: nếu đồng hạng cao nhất thì không xử tử.
// =========================================================
replaceOnce(
`    const aliveCount =
        alivePlayers().length;

    /*
     * Chỉ xử tử nếu có đa số tuyệt đối.
     */

    if (
        leaders.length !== 1 ||
        highest <= aliveCount / 2
    ) {`,
`    const aliveCount =
        alivePlayers().length;

    // Mỗi mục tiêu không được tự vote cho chính mình, vì vậy mẫu số
    // khi xét xử tử = tổng người còn sống - chính mục tiêu đó.
    // Phải QUÁ 50%; đúng 50% thì mục tiêu sống.
    const eligibleVotersForTarget = Math.max(0, aliveCount - 1);

    if (
        leaders.length !== 1 ||
        highest <= eligibleVotersForTarget / 2
    ) {`,
"day vote mẫu số alive - target"
);

source = source.replaceAll(
    "⚖️ Không có người nào nhận đủ đa số phiếu.",
    "⚖️ Không có người nào nhận quá 50% phiếu của số người sống còn lại (không tính chính mục tiêu)."
);

// =========================================================
// 5) COUPLE: KHI RECONNECT PHẢI GỬI LẠI TÊN + VAI TRÒ NGƯỜI YÊU
//    Giúp frontend luôn hiện đúng "Người yêu là: ❤️ <vai trò>".
//    Không thay đổi logic ghép Couple hay chat Couple.
// =========================================================
replaceOnce(
`                        reconnectState(
                            socket,
                            reconnectPlayer
                        );

                        addLog(`,
`                        reconnectState(
                            socket,
                            reconnectPlayer
                        );

                        if (reconnectPlayer.loverId) {
                            const reconnectLover = findPlayer(reconnectPlayer.loverId);
                            if (reconnectLover) {
                                socket.emit("loverLinked", {
                                    loverId: reconnectLover.id,
                                    loverName: reconnectLover.name,
                                    loverRole: reconnectLover.role
                                });
                            }
                        }

                        addLog(`,
"reconnect gửi lại loverRole"
);

// Chạy source đã patch như module Node.js bình thường.
const patched = new Module(coreFile, module);
patched.filename = coreFile;
patched.paths = Module._nodeModulePaths(__dirname);
patched._compile(source, coreFile);
