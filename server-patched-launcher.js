const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "server.js");
const runtimePath = path.join(__dirname, ".server.runtime.js");
let source = fs.readFileSync(sourcePath, "utf8");

function replaceRequired(searchValue, replacement, label) {
    const before = source;
    source = source.replace(searchValue, replacement);
    if (source === before) {
        throw new Error(`[PATCH FAILED] Không tìm thấy đoạn cần sửa: ${label}`);
    }
}

// ============================================================
// 1) PHÙ THỦY: 50 GIÂY ĐỘC + 10 GIÂY CỨU
// ============================================================
replaceRequired("    night: 45,", "    night: 50,", "TIME.night 45 -> 50");
replaceRequired("    witchPoison: 45,", "    witchPoison: 50,", "TIME.witchPoison 45 -> 50");
replaceRequired("    witchSave: 15,", "    witchSave: 10,", "TIME.witchSave 15 -> 10");

// Đồng bộ chữ hiển thị/log trong server.
source = source
    .replaceAll("cửa sổ 45s", "cửa sổ 50s")
    .replaceAll("FIRST 45s OF NIGHT", "FIRST 50s OF NIGHT")
    .replaceAll("Trong 45 giây đầu của đêm", "Trong 50 giây đầu của đêm")
    .replaceAll("hết 45 giây", "hết 50 giây")
    .replaceAll("Hết 45 giây", "Hết 50 giây")
    .replaceAll("POISON - DRAFT, CAN CHANGE FOR 45s", "POISON - DRAFT, CAN CHANGE FOR 50s")
    .replaceAll("SAVE 15s AFTER WOLF LOCKS AT 45s", "SAVE 10s AFTER WOLF LOCKS AT 50s")
    .replaceAll("Bạn có 15 giây để quyết định cứu", "Bạn có 10 giây để quyết định cứu")
    .replaceAll("0-45s", "0-50s")
    .replaceAll("Sau 50s nếu đang mở cứu", "Sau 50s nếu đang mở cứu");

// ============================================================
// 2) VOTE BAN NGÀY
// Mẫu số của người A = tổng người đang sống - chính A.
// Chỉ chết khi số vote > 50% mẫu số đó.
// 10 sống: 5/9 chết. 9 sống: 4/8 sống, 5/8 chết.
// ============================================================
replaceRequired(
    "        highest <= aliveCount / 2",
    "        highest <= (aliveCount - 1) / 2",
    "day vote majority denominator"
);
source = source.replace(
    "     * Chỉ xử tử nếu có đa số tuyệt đối.",
    "     * Chỉ xử tử nếu người dẫn đầu nhận QUÁ 50% phiếu của tất cả người sống TRỪ chính mục tiêu.\n     * Phiếu trắng/không vote vẫn nằm trong mẫu số. Đúng 50% thì sống."
);

// ============================================================
// 3) COUPLE / WINNER
// Couple còn nguyên 2 người sống => khóa luật Sói >= phe còn lại.
// Chỉ khi Couple bị phá/chết mới quay về luật thắng bình thường.
// Nếu chỉ còn đúng Couple => Couple thắng.
// Hunter phải resolve xong trước winner check (server hiện tại đã làm vậy).
// ============================================================
const winnerRegex = /function checkWinner\(\) \{[\s\S]*?\n\}\n\n\n\/\* =========================================================\n   START GAME/;
const winnerReplacement = `function checkWinner() {

    if (autoResetForInactivePlayers()) {
        return true;
    }

    const alive = alivePlayers();

    /* Không còn ai sống => Hòa. */
    if (alive.length === 0) {
        endGame(
            "Hòa",
            "⚖️ Tất cả người chơi đã chết."
        );
        return true;
    }

    /*
     * Tìm Couple còn NGUYÊN: cả hai đều sống và loverId trỏ qua lại.
     * Khi Couple còn nguyên, Couple trở thành điều kiện đặc biệt:
     * - Chỉ còn đúng 2 người và họ là Couple => Couple thắng.
     * - Còn từ 3 người trở lên => KHÔNG xét Sói >= phe khác và
     *   KHÔNG xét Sói = 0; game tiếp tục cho đến khi Couple thắng
     *   hoặc Couple bị phá/chết.
     */
    let livingCouple = null;

    for (const first of alive) {
        if (!first.loverId) continue;
        const second = alive.find(p => p.id === first.loverId);
        if (!second || !second.alive) continue;
        if (second.loverId !== first.id) continue;
        livingCouple = [first, second];
        break;
    }

    if (livingCouple) {
        const [first, second] = livingCouple;

        if (
            alive.length === 2 &&
            alive.includes(first) &&
            alive.includes(second)
        ) {
            const cupid = room.players.find(p => p.role === "Cupid");

            endGame(
                "Couple",
                cupid
                    ? \`💘 \${first.name} và \${second.name} chiến thắng cùng nhau - Cupid (\${cupid.name}) đã se duyên.\`
                    : \`💘 \${first.name} và \${second.name} chiến thắng cùng nhau.\`
            );
            return true;
        }

        /* Couple còn sống và vẫn còn người thứ ba trở lên: tiếp tục game. */
        return false;
    }

    /* Couple đã chết/bị phá => quay lại luật thắng bình thường. */
    const wolves = alive.filter(p => p.role === "Sói").length;
    const nonWolves = alive.length - wolves;

    if (wolves === 0) {
        endGame(
            "Dân",
            "👨‍🌾 Phe Dân thắng!"
        );
        return true;
    }

    if (wolves >= nonWolves) {
        endGame(
            "Sói",
            "🐺 Phe Sói thắng!"
        );
        return true;
    }

    return false;
}


/* =========================================================
   START GAME`;

replaceRequired(winnerRegex, winnerReplacement, "checkWinner couple logic");

// ============================================================
// 4) AUTO RESET
// Không tính người chết bình thường là "inactive", nếu không game sẽ
// reset khi chết >= 50% và không bao giờ đi tới late-game/Couple 3 người.
// Chỉ reset do người mất kết nối hoặc chủ động rời game.
// ============================================================
replaceRequired(
    `        if (
            p.connected === false ||
            p.alive === false ||
            p.leftGame === true
        ) {`,
    `        if (
            p.connected === false ||
            p.leftGame === true
        ) {`,
    "auto reset must not count normal deaths"
);
source = source
    .replaceAll("AUTO RESET - OFFLINE + DEAD >= 50%", "AUTO RESET - OFFLINE / LEFT >= 50%")
    .replaceAll("người đã chết, mất kết nối hoặc rời phòng", "người mất kết nối hoặc rời phòng");

fs.writeFileSync(runtimePath, source, "utf8");
console.log("✅ Runtime patch: vote mới + Couple mới + Phù Thủy 50s/10s đã áp dụng.");
require(runtimePath);
