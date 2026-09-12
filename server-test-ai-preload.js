const fs = require('fs');
const path = require('path');

// Test-backend-only preload. Activated with NODE_OPTIONS on masoi-bot-test.
// It patches the in-memory server-core source before server-test.js applies its
// existing test-mode patches. Production server files remain unchanged.
const originalReadFileSync = fs.readFileSync;

function patchTestCore(source) {
  let src = String(source);
  if (src.includes('TEST_AI_CHAT_HELPERS_V1')) return src;

  const helpers = String.raw`
/* TEST_AI_CHAT_HELPERS_V1 =================================== */
const TEST_AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const TEST_AI_CHAT_ENABLED = process.env.TEST_AI_CHAT_ENABLED !== "0";

function testAiNormalize(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function testAiBotNumber(bot) {
    const m = String(bot?.name || "").match(/Bot\s*0*(\d+)/i);
    return m ? Number(m[1]) : 0;
}

function testAiMentionedBot(text, bots) {
    const norm = testAiNormalize(text);
    for (const bot of bots) {
        const n = testAiBotNumber(bot);
        if (!n) continue;
        if (new RegExp("(?:^|\\s)bot\\s*0*" + n + "(?:\\s|$)").test(norm)) return bot;
    }
    return null;
}

function testAiFallback(bot, humanText) {
    const t = testAiNormalize(humanText);
    const n = testAiBotNumber(bot) || "";
    if (/\b(alo|hello|hi|hey|ai do|co ai|aloo+)\b/.test(t)) {
        return ["Có đây nè :))", "Alo, tui đây 👀", "Có mặt nha, đang đọc chat nè", "Ủa gọi tui hả :))"][Math.floor(Math.random()*4)];
    }
    if (/\b(nghi ai|ai la soi|soi la ai|vote ai|chon ai)\b/.test(t)) {
        const others = alivePlayers().filter(p => p.id !== bot.id);
        const pick = others[Math.floor(Math.random()*Math.max(1, others.length))];
        return pick ? "Tạm thời tui đang để ý " + pick.name + " á, chưa chốt đâu." : "Chưa biết nữa, coi thêm tí đã.";
    }
    return ["Ừa tui đang nghe nè.", "Khoan, để tui coi tình hình đã 😅", "Tui cũng đang suy nghĩ vụ này.", "Nghe cũng có lý á."][Math.floor(Math.random()*4)];
}

function testAiPersonality(bot) {
    const styles = [
        "nói chuyện vui vẻ, hơi cà khịa nhẹ",
        "ít nói, trả lời ngắn và tỉnh",
        "hay nghi ngờ nhưng không khẳng định bừa",
        "thân thiện, nói tự nhiên như bạn bè",
        "hơi lầy, dùng :)) hoặc emoji vừa phải"
    ];
    return styles[(testAiBotNumber(bot) || 1) % styles.length];
}

function testAiVisibleContext(chatType) {
    return (room.chatHistory || [])
        .filter(x => x && (x.chatType === chatType || (chatType === "public" && x.chatType === "public")))
        .slice(-12)
        .map(x => String(x.playerName || "?") + ": " + String(x.text || ""))
        .join("\n");
}

async function testAiGenerate(bot, human, humanText, chatType) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return testAiFallback(bot, humanText);

    const aliveNames = alivePlayers().map(p => p.name).join(", ");
    const recent = testAiVisibleContext(chatType);
    const roleNotes = bot.role === "Sói"
        ? "Bạn là Sói. Hãy giả vờ như người chơi bình thường, có thể đánh lạc hướng nhưng TUYỆT ĐỐI không tự thú mình là Sói."
        : "Vai bí mật của bạn là " + bot.role + ". Không được tự ý nói thẳng vai của mình chỉ vì AI biết vai; hãy cư xử như người chơi thật.";

    const prompt = [
        "Bạn đang nhập vai " + bot.name + " trong game Ma Sói online bằng tiếng Việt.",
        "Phong cách: " + testAiPersonality(bot) + ".",
        roleNotes,
        "Chỉ trả lời như một người chơi trong chat, 1-2 câu ngắn, tự nhiên. Không nói mình là AI, không giải thích luật trừ khi được hỏi, không viết tên Bot ở đầu câu.",
        "Không được tiết lộ thông tin bí mật mà nhân vật không thể biết. Có thể nghi ngờ, đùa, né câu hỏi hoặc bluff hợp lý.",
        "Giai đoạn: " + room.phase + ", đêm số: " + (room.nightNumber || 0) + ". Người còn sống: " + aliveNames + ".",
        recent ? "Chat gần đây:\n" + recent : "Chưa có nhiều chat trước đó.",
        human.name + " vừa nói: " + humanText,
        "Hãy trả lời trực tiếp tin nhắn đó."
    ].join("\n");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
        const r = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: TEST_AI_MODEL,
                input: prompt,
                max_output_tokens: 90
            }),
            signal: ctrl.signal
        });
        if (!r.ok) throw new Error("OpenAI HTTP " + r.status);
        const data = await r.json();
        let out = String(data?.output_text || "").trim();
        if (!out && Array.isArray(data?.output)) {
            for (const item of data.output) {
                for (const c of (item?.content || [])) {
                    if (c?.type === "output_text" && c?.text) out += c.text;
                }
            }
            out = out.trim();
        }
        out = out.replace(/^([🤖 ]*Bot\s*\d+\s*[:\-–—]\s*)/i, "").trim();
        if (!out) return testAiFallback(bot, humanText);
        return out.slice(0, 260);
    } catch (err) {
        console.error("[TEST AI CHAT]", err?.message || err);
        return testAiFallback(bot, humanText);
    } finally {
        clearTimeout(timer);
    }
}

function testAiEmitBotChat(bot, text, chatType) {
    if (!bot || !text || !room.testMode || !room.started) return;
    let recipients = [];
    let payload = {
        playerId: bot.id,
        playerName: bot.name,
        text,
        dead: false,
        wolfChat: false,
        coupleChat: false,
        chatType
    };

    if (chatType === "wolf") {
        recipients = room.players.filter(p => p.connected && (!p.alive || p.role === "Sói"));
        payload.wolfChat = true;
    } else {
        recipients = room.players.filter(p => p.connected);
        payload.chatType = "public";
    }

    try { storeChatHistory(payload, recipients); } catch (_) {}
    for (const recipient of recipients) {
        try { io.to(recipient.id).emit("chatMessage", payload); } catch (_) {}
    }
}

async function testMaybeAiBotReply(human, humanText, data) {
    if (!TEST_AI_CHAT_ENABLED || !room.testMode || !room.started || !human || human.isBot) return;

    let chatType = null;
    if (room.phase === "daySpeech" && human.alive) chatType = "public";
    else if (room.phase === "night" && human.alive && human.role === "Sói" && !room.night?.witchActionOpen) chatType = "wolf";
    else return;

    let bots = room.players.filter(p => p.isBot && p.alive);
    if (chatType === "wolf") bots = bots.filter(p => p.role === "Sói");
    if (!bots.length) return;

    const mentioned = testAiMentionedBot(humanText, bots);
    const norm = testAiNormalize(humanText);
    const strongTrigger = !!mentioned || /\b(alo|hello|hi|hey|ai do|co ai|nghi ai|ai la soi|vote ai|bot)\b/.test(norm) || /[?？]$/.test(String(humanText).trim());
    if (!strongTrigger && Math.random() > 0.42) return;

    const now = Date.now();
    if (room.testAiLastReplyAt && now - room.testAiLastReplyAt < (mentioned ? 900 : 2200)) return;
    room.testAiLastReplyAt = now;

    const bot = mentioned || bots[Math.floor(Math.random() * bots.length)];
    const reply = await testAiGenerate(bot, human, humanText, chatType);
    if (!reply || !room.started || !bot.alive) return;

    const delay = 900 + Math.floor(Math.random() * 2600);
    setTimeout(() => {
        try {
            if (!room.testMode || !room.started || !bot.alive) return;
            testAiEmitBotChat(bot, reply, chatType);
        } catch (err) {
            console.error("[TEST AI CHAT EMIT]", err);
        }
    }, delay);
}
/* ========================================================== */
`;

  const ioAnchor = 'io.on(\n    "connection",';
  if (!src.includes(ioAnchor)) throw new Error('[TEST AI] Missing io connection anchor');
  src = src.replace(ioAnchor, helpers + '\n' + ioAnchor);

  const chatAnchor = `                if (\n                    !text ||\n                    text.length > 300\n                ) {\n\n                    return;\n\n                }\n`;
  if (!src.includes(chatAnchor)) throw new Error('[TEST AI] Missing chat validation anchor');
  src = src.replace(chatAnchor, chatAnchor + `\n                if (room.testMode && !player.isBot) {\n                    testMaybeAiBotReply(player, text, data).catch(err => console.error("[TEST AI CHAT]", err));\n                }\n`);

  return src;
}

fs.readFileSync = function(file, ...args) {
  const result = originalReadFileSync.call(fs, file, ...args);
  try {
    if (path.basename(String(file)) !== 'server-core.js') return result;
    const isBuffer = Buffer.isBuffer(result);
    const source = isBuffer ? result.toString('utf8') : String(result);
    const patched = patchTestCore(source);
    return isBuffer ? Buffer.from(patched, 'utf8') : patched;
  } catch (err) {
    console.error('[TEST AI PRELOAD]', err);
    throw err;
  }
};
