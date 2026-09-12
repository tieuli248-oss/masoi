const fs = require('fs');
const path = require('path');

// Test-backend-only preload. Activated with NODE_OPTIONS on masoi-bot-test.
// It patches the in-memory server-core source before server-test.js applies its
// existing test-mode patches. Production server files remain unchanged.
const originalReadFileSync = fs.readFileSync;

function patchTestCore(source) {
  let src = String(source);
  if (src.includes('TEST_AI_CHAT_HELPERS_V2')) return src;

  const helpers = String.raw`
/* TEST_AI_CHAT_HELPERS_V2 =================================== */
const TEST_AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const TEST_AI_CHAT_ENABLED = process.env.TEST_AI_CHAT_ENABLED !== "0";
const TEST_AI_MAX_CONTEXT = Math.max(18, Math.min(50, Number(process.env.TEST_AI_MAX_CONTEXT || 34)));

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

function testAiBrain(bot) {
    if (!room.testAiBrains || typeof room.testAiBrains !== "object") room.testAiBrains = {};
    if (!room.testAiBrains[bot.id]) {
        room.testAiBrains[bot.id] = {
            suspicion: {},
            statements: [],
            observations: [],
            repliedTo: [],
            lastReplyAt: 0,
            mood: (testAiBotNumber(bot) || 1) % 6,
            confidence: 35 + ((testAiBotNumber(bot) || 1) * 11) % 45
        };
    }
    return room.testAiBrains[bot.id];
}

function testAiPersonality(bot) {
    const styles = [
        "lầy nhẹ, nói tự nhiên, thỉnh thoảng :)) nhưng không spam emoji",
        "ít nói, tỉnh, câu ngắn, chỉ nói khi có ý",
        "hay bắt lỗi logic và nhớ ai nói trước sau không khớp",
        "thân thiện nhưng không dễ tin người",
        "hơi cà khịa, phản biện nhanh nhưng không toxic",
        "điềm tĩnh, phân tích vote và hành vi rồi mới kết luận"
    ];
    return styles[(testAiBotNumber(bot) || 1) % styles.length];
}

function testAiPublicChatEntries() {
    return (room.chatHistory || []).filter(x => x && (x.chatType === "public" || x.chatType === "lobby"));
}

function testAiVisibleContext(chatType) {
    const list = (room.chatHistory || []).filter(x => {
        if (!x) return false;
        if (chatType === "wolf") return x.chatType === "wolf";
        return x.chatType === "public";
    });
    return list.slice(-TEST_AI_MAX_CONTEXT)
        .map(x => String(x.playerName || "?") + ": " + String(x.text || ""))
        .join("\n");
}

function testAiVoteSnapshot() {
    try {
        if (!(room.dayVotes instanceof Map) || !room.dayVotes.size) return "Chưa có vote hiện tại.";
        const rows = [];
        for (const [voterId, targetId] of room.dayVotes.entries()) {
            const voter = findPlayer(voterId);
            const target = findPlayer(targetId);
            if (voter && target) rows.push(voter.name + " → " + target.name);
        }
        return rows.length ? rows.join(", ") : "Chưa có vote hiện tại.";
    } catch (_) {
        return "Chưa có vote hiện tại.";
    }
}

function testAiAliveDeadSnapshot() {
    const alive = room.players.filter(p => p.alive).map(p => p.name);
    const dead = room.players.filter(p => !p.alive).map(p => p.name);
    return "Còn sống: " + alive.join(", ") + "." + (dead.length ? " Đã chết: " + dead.join(", ") + "." : "");
}

function testAiLegalPrivateKnowledge(bot, chatType) {
    const lines = [];
    if (bot.role === "Sói") {
        const mates = room.players.filter(p => p.alive && p.role === "Sói" && p.id !== bot.id).map(p => p.name);
        lines.push("Bạn là Sói. Đồng đội Sói còn sống mà BẠN được phép biết: " + (mates.join(", ") || "không còn ai") + ".");
        lines.push("Khi chat công khai phải bluff như người thường, tuyệt đối không lộ danh sách này. Có thể bênh đồng đội kín đáo hoặc đẩy nghi ngờ sang mục tiêu hợp lý, nhưng tránh bênh quá lộ.");
    } else {
        lines.push("Vai bí mật của bạn là " + bot.role + ". Không được tự khai role chỉ vì hệ thống cho bạn biết, trừ khi chiến thuật thật sự cần và lời nói phù hợp diễn biến.");
    }
    if (chatType === "wolf") lines.push("Đây là chat Sói ban đêm, có thể nói thẳng chiến thuật với đồng đội Sói.");
    return lines.join("\n");
}

function testAiUpdateSuspicionFromMessage(human, text) {
    if (!human || human.isBot) return;
    const norm = testAiNormalize(text);
    for (const bot of room.players.filter(p => p.isBot && p.alive)) {
        const brain = testAiBrain(bot);
        if (bot.id === human.id) continue;
        let delta = 0;
        if (/\b(toi la|tui la|tao la|minh la)\b/.test(norm) && /\b(tien tri|bao ve|phu thuy|tho san|cupid)\b/.test(norm)) delta += 4;
        if (/\b(khong biet|chua biet|chua nghi ai)\b/.test(norm)) delta -= 1;
        if (/\b(vote|treo|nghi|soi)\b/.test(norm)) delta += 1;
        if (/\b(chac chan|100|mot tram|khẳng dinh|khang dinh)\b/.test(norm)) delta += 2;
        if (bot.role === "Sói" && human.role !== "Sói") delta += 1;
        const old = Number(brain.suspicion[human.id] || 0);
        brain.suspicion[human.id] = Math.max(-20, Math.min(100, old + delta));
        brain.observations.push({t: Date.now(), who: human.id, text: String(text).slice(0,180)});
        if (brain.observations.length > 60) brain.observations.splice(0, brain.observations.length - 60);
    }
}

function testAiSuspicionSummary(bot) {
    const brain = testAiBrain(bot);
    const rows = room.players
        .filter(p => p.alive && p.id !== bot.id)
        .map(p => ({ p, score: Number(brain.suspicion[p.id] || 0) }))
        .sort((a,b) => b.score - a.score)
        .slice(0, 6);
    return rows.map(x => x.p.name + "=" + x.score).join(", ") || "chưa có dữ liệu";
}

function testAiOwnMemory(bot) {
    const brain = testAiBrain(bot);
    const ownChats = testAiPublicChatEntries()
        .filter(x => x.playerId === bot.id)
        .slice(-8)
        .map(x => x.text);
    const notes = brain.statements.slice(-8).map(x => x.text);
    const merged = [...ownChats, ...notes].slice(-10);
    return merged.length ? merged.map((x,i) => (i+1) + ". " + x).join("\n") : "Chưa nói gì đáng nhớ.";
}

function testAiFallback(bot, humanText) {
    const t = testAiNormalize(humanText);
    const brain = testAiBrain(bot);
    if (/\b(alo|hello|hi|hey|ai do|co ai|aloo+)\b/.test(t)) {
        return ["Có đây :))", "Alo tui đây", "Có mặt, nói đi 👀", "Gọi gì đó :))"][Math.floor(Math.random()*4)];
    }
    if (/\b(nghi ai|ai la soi|vote ai|chon ai)\b/.test(t)) {
        const ranked = room.players.filter(p => p.alive && p.id !== bot.id)
            .map(p => ({p, s:Number(brain.suspicion[p.id]||0)})).sort((a,b)=>b.s-a.s);
        const pick = ranked[0]?.p;
        return pick ? "T đang để ý " + pick.name + " nhất, nhưng chưa chốt." : "Chưa đủ dữ kiện để chốt ai.";
    }
    return ["Ừ, khúc này t cũng đang để ý.", "Khoan, để coi vote với lời nói có khớp không đã.", "Cái này chưa đủ để chốt đâu.", "Nghe được, nhưng t chưa tin hẳn."][Math.floor(Math.random()*4)];
}

async function testAiCall(prompt, maxTokens = 180) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return "";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 14000);
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
                max_output_tokens: maxTokens
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
        }
        return String(out || "").trim();
    } catch (err) {
        console.error("[TEST AI CHAT]", err?.message || err);
        return "";
    } finally {
        clearTimeout(timer);
    }
}

function testAiCleanReply(out) {
    return String(out || "")
        .replace(/^([🤖 ]*Bot\s*\d+\s*[:\-–—]\s*)/i, "")
        .replace(/^['\"]|['\"]$/g, "")
        .trim()
        .slice(0, 320);
}

async function testAiGenerate(bot, human, humanText, chatType) {
    const brain = testAiBrain(bot);
    const recent = testAiVisibleContext(chatType);
    const prompt = [
        "Bạn đang nhập vai một NGƯỜI CHƠI THẬT trong game Ma Sói online. Tên bạn: " + bot.name + ".",
        "MỤC TIÊU: trả lời tự nhiên như người Việt đang chơi Ma Sói, có trí nhớ, có lập trường và biết đổi ý khi có bằng chứng. Không được có văn phong trợ lý/AI.",
        "Tính cách cố định: " + testAiPersonality(bot) + ".",
        "Độ tự tin hiện tại: " + brain.confidence + "/100.",
        testAiLegalPrivateKnowledge(bot, chatType),
        "QUY TẮC KIẾN THỨC: Chỉ dùng chat công khai, vote công khai, trạng thái sống/chết và thông tin riêng hợp lệ của vai bạn. Không được dùng role bí mật của người khác chỉ vì server biết. Không bịa sự kiện chưa xảy ra.",
        "QUY TẮC NHẤT QUÁN: Phải nhớ những gì chính bạn đã nói trước đây. Nếu đổi nghi ngờ, nói được lý do đổi. Không tự mâu thuẫn vô cớ.",
        "QUY TẮC NÓI: 1-3 câu ngắn. Có thể dùng t/tui/m/ừ/k/ko/:)) vừa phải. Không mở đầu bằng tên Bot. Không viết phân tích dài. Không nói 'dựa trên dữ liệu', 'theo ngữ cảnh', 'là AI'.",
        "Khi bị hỏi 'nghi ai' hoặc 'vote ai', ưu tiên nêu một người cụ thể và 1 lý do có thật từ chat/vote nếu đủ dữ kiện. Nếu chưa đủ thì nói chưa đủ, đừng random vô nghĩa.",
        "Nếu bị chất vấn câu trước, trả lời đúng theo trí nhớ. Nếu người khác công kích bạn, có thể tự vệ hoặc phản biện như người chơi thật.",
        "Giai đoạn hiện tại: " + room.phase + ", đêm/ngày số gần nhất: " + (room.nightNumber || 0) + ".",
        testAiAliveDeadSnapshot(),
        "Vote hiện tại: " + testAiVoteSnapshot(),
        "Điểm nghi ngờ nội bộ của bạn (chỉ là gợi ý, không phải sự thật): " + testAiSuspicionSummary(bot) + ".",
        "Những câu bạn từng nói / cần giữ nhất quán:\n" + testAiOwnMemory(bot),
        recent ? "Chat gần đây:\n" + recent : "Chat gần đây: chưa có.",
        human.name + " vừa nói với phòng: " + humanText,
        "Hãy trả lời đúng một tin nhắn chat như người chơi thật."
    ].join("\n\n");

    const out = testAiCleanReply(await testAiCall(prompt, 180));
    const reply = out || testAiFallback(bot, humanText);
    brain.statements.push({t:Date.now(), text:reply, phase:room.phase, night:room.nightNumber||0});
    if (brain.statements.length > 30) brain.statements.splice(0, brain.statements.length - 30);
    return reply;
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

function testAiShouldSecondBotReply(humanText, firstReply) {
    const n = testAiNormalize(humanText + " " + firstReply);
    if (/\b(nghi ai|ai la soi|vote ai|tai sao|sao lai|khong dong y|xao|noi doi|sus)\b/.test(n)) return Math.random() < 0.42;
    return Math.random() < 0.14;
}

async function testMaybeAiBotReply(human, humanText, data) {
    if (!TEST_AI_CHAT_ENABLED || !room.testMode || !room.started || !human || human.isBot) return;

    let chatType = null;
    if (room.phase === "daySpeech" && human.alive) chatType = "public";
    else if (room.phase === "night" && human.alive && human.role === "Sói" && !room.night?.witchActionOpen) chatType = "wolf";
    else return;

    testAiUpdateSuspicionFromMessage(human, humanText);

    let bots = room.players.filter(p => p.isBot && p.alive);
    if (chatType === "wolf") bots = bots.filter(p => p.role === "Sói");
    if (!bots.length) return;

    const mentioned = testAiMentionedBot(humanText, bots);
    const norm = testAiNormalize(humanText);
    const strongTrigger = !!mentioned || /\b(alo|hello|hi|hey|ai do|co ai|nghi ai|ai la soi|vote ai|bot|tai sao|sao|nghi gi|y kien)\b/.test(norm) || /[?？]$/.test(String(humanText).trim());
    if (!strongTrigger && Math.random() > 0.30) return;

    const now = Date.now();
    if (room.testAiLastReplyAt && now - room.testAiLastReplyAt < (mentioned ? 650 : 1600)) return;
    room.testAiLastReplyAt = now;

    let bot = mentioned;
    if (!bot) {
        const ranked = bots.map(b => ({b, s:Number(testAiBrain(b).suspicion[human.id]||0), jitter:Math.random()*8})).sort((a,b)=>(b.s+b.jitter)-(a.s+a.jitter));
        bot = ranked[0]?.b || bots[Math.floor(Math.random()*bots.length)];
    }

    const reply = await testAiGenerate(bot, human, humanText, chatType);
    if (!reply || !room.started || !bot.alive) return;

    const delay = 700 + Math.floor(Math.random() * 2200);
    setTimeout(() => {
        try {
            if (!room.testMode || !room.started || !bot.alive) return;
            testAiEmitBotChat(bot, reply, chatType);
        } catch (err) {
            console.error("[TEST AI CHAT EMIT]", err);
        }
    }, delay);

    if (chatType === "public" && bots.length > 1 && testAiShouldSecondBotReply(humanText, reply)) {
        const others = bots.filter(b => b.id !== bot.id);
        const second = others[Math.floor(Math.random()*others.length)];
        const syntheticHuman = { id: bot.id, name: bot.name, isBot:false };
        const secondPrompt = humanText + "\n" + bot.name + " vừa trả lời: " + reply + "\nBạn có thể đồng ý, phản bác hoặc thêm ý nếu thật sự có gì để nói.";
        const secondReply = await testAiGenerate(second, syntheticHuman, secondPrompt, chatType);
        if (secondReply && room.started && second.alive) {
            setTimeout(() => {
                try {
                    if (!room.testMode || !room.started || !second.alive) return;
                    testAiEmitBotChat(second, secondReply, chatType);
                } catch (_) {}
            }, delay + 1500 + Math.floor(Math.random()*2600));
        }
    }
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
