const fs = require('fs');
const path = require('path');

// Test-backend-only preload for lively Groq-powered bots.
// Production server files remain untouched.
const originalReadFileSync = fs.readFileSync;

function patchTestCore(source) {
  let src = String(source);
  if (src.includes('TEST_AI_GROQ_MAX_V3')) return src;

  const helpers = String.raw`
/* TEST_AI_GROQ_MAX_V3 ======================================= */
const TEST_AI_CHAT_ENABLED = process.env.TEST_AI_CHAT_ENABLED !== "0";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const TEST_AI_MAX_CONTEXT = Math.max(24, Math.min(60, Number(process.env.TEST_AI_MAX_CONTEXT || 42)));

function testAiNormalize(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
}

function testAiBotNumber(bot) {
    const m = String(bot?.name || "").match(/Bot\\s*0*(\\d+)/i);
    return m ? Number(m[1]) : 0;
}

function testAiEnsureGameBrain() {
    const stamp = String(room.gameStartedAt || "") + ":" + String(room.testMode || false);
    if (room.testAiBrainStamp !== stamp) {
        room.testAiBrainStamp = stamp;
        room.testAiBrains = {};
        room.testAiLastReplyAt = 0;
        room.testAiLastSpontaneousAt = 0;
        room.testAiPending = 0;
    }
}

function testAiBrain(bot) {
    testAiEnsureGameBrain();
    if (!room.testAiBrains || typeof room.testAiBrains !== "object") room.testAiBrains = {};
    if (!room.testAiBrains[bot.id]) {
        const pack = room.players.filter(p => p.role === "Sói").map(p => ({ id:p.id, name:p.name }));
        room.testAiBrains[bot.id] = {
            suspicion: {},
            statements: [],
            observations: [],
            confidence: 42 + ((testAiBotNumber(bot) || 1) * 13) % 40,
            wolfPack: pack,
            seerKnowledge: [],
            roleMemories: []
        };
    }
    return room.testAiBrains[bot.id];
}

function testAiMentionedBot(text, bots) {
    const norm = testAiNormalize(text);
    for (const bot of bots) {
        const n = testAiBotNumber(bot);
        if (!n) continue;
        if (new RegExp("(?:^|\\\\s)bot\\\\s*0*" + n + "(?:\\\\s|$)").test(norm)) return bot;
    }
    return null;
}

function testAiPersonality(bot) {
    const styles = [
        "lầy, nhanh mồm, hay chọc nhẹ nhưng không toxic",
        "tỉnh, ít dài dòng, nói câu nào có ý câu đó",
        "hay bắt lỗi logic, nhớ ai nói trước sau không khớp",
        "thân thiện, hoạt bát, thích kéo người khác vào tranh luận",
        "cà khịa vui, phản biện nhanh, đôi lúc dùng :))",
        "điềm tĩnh nhưng rất để ý vote và hành vi",
        "nhiều chuyện vừa phải, thích hỏi ngược và hóng drama"
    ];
    return styles[(testAiBotNumber(bot) || 1) % styles.length];
}

function testAiVisibleContext(chatType) {
    const list = (room.chatHistory || []).filter(x => {
        if (!x) return false;
        if (chatType === "wolf") return x.chatType === "wolf";
        return x.chatType === "public";
    });
    return list.slice(-TEST_AI_MAX_CONTEXT)
        .map(x => String(x.playerName || "?") + ": " + String(x.text || ""))
        .join("\\n");
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

function testAiSyncRoleMemory(bot) {
    const brain = testAiBrain(bot);
    const add = text => {
        if (!text || brain.roleMemories.includes(text)) return;
        brain.roleMemories.push(text);
        if (brain.roleMemories.length > 30) brain.roleMemories.shift();
    };

    for (const ev of (room.eventHistory || [])) {
        const text = String(ev?.text || "");
        if (!text.includes(bot.name)) continue;
        if (bot.role === "Tiên tri" && text.includes("(Tiên tri) soi ")) add(text.replace(/^🤖\\s*/, ""));
        if (bot.role === "Bảo vệ" && text.includes("(Bảo vệ) bảo vệ ")) add(text.replace(/^🤖\\s*/, ""));
        if (bot.role === "Phù thủy" && text.includes("(Phù thủy)")) add(text.replace(/^🤖\\s*/, ""));
        if (bot.role === "Sói" && text.includes("(Sói) chọn cắn ")) add(text.replace(/^🤖\\s*/, ""));
    }

    if (bot.role === "Tiên tri") {
        for (const x of (room.night?.seerInspections || [])) {
            if (x?.seerId !== bot.id) continue;
            const line = "Đêm " + (room.nightNumber || "?") + ": đã soi " + String(x.targetName || "?") + " → " + String(x.result || "?");
            if (!brain.seerKnowledge.includes(line)) brain.seerKnowledge.push(line);
        }
        if (brain.seerKnowledge.length > 20) brain.seerKnowledge = brain.seerKnowledge.slice(-20);
    }
}

function testAiPrivateKnowledge(bot, chatType) {
    testAiSyncRoleMemory(bot);
    const brain = testAiBrain(bot);
    const lines = ["Vai của bạn: " + bot.role + "."];

    if (bot.role === "Sói") {
        if (!brain.wolfPack?.length) brain.wolfPack = room.players.filter(p => p.role === "Sói").map(p => ({id:p.id,name:p.name}));
        const pack = brain.wolfPack.map(x => {
            const p = findPlayer(x.id);
            return x.name + (p?.alive ? " (còn sống)" : " (đã chết)");
        });
        lines.push("Bầy Sói bạn biết từ đầu ván: " + (pack.join(", ") || "chỉ còn mình bạn") + ". Đây là kiến thức bí mật cố định, kể cả Sói đã chết bạn vẫn nhớ họ là đồng đội.");
        if (chatType === "public") lines.push("Ở chat công khai phải giả làm phe làng, tuyệt đối không khai đồng đội Sói. Có thể bluff, đánh lạc hướng, cãi hoặc bênh kín đáo.");
        if (chatType === "wolf") lines.push("Đây là chat Sói: được nói thẳng tên đồng đội, mục tiêu cắn và chiến thuật.");
    } else {
        lines.push("Bạn KHÔNG biết role bí mật của người khác, trừ thông tin đúng quyền của vai mình hoặc điều đã công khai.");
    }

    if (bot.role === "Tiên tri") {
        lines.push("Kết quả soi mà chính bạn đã biết: " + ((brain.seerKnowledge || []).join(" | ") || "chưa có kết quả được ghi nhớ") + ". Chỉ được dùng các kết quả này, không tự biết role thật ngoài kết quả soi.");
    }

    if (bot.loverId) {
        const lover = findPlayer(bot.loverId);
        if (lover) lines.push("Người yêu bí mật của bạn là " + lover.name + ".");
    }

    if (brain.roleMemories?.length) lines.push("Việc riêng bạn đã làm/biết: " + brain.roleMemories.slice(-8).join(" | "));
    return lines.join("\\n");
}

function testAiUpdateSuspicionFromMessage(human, text) {
    if (!human) return;
    const norm = testAiNormalize(text);
    for (const bot of room.players.filter(p => p.isBot && p.alive)) {
        if (bot.id === human.id) continue;
        const brain = testAiBrain(bot);
        let delta = 0;
        if (/\\b(vote|treo|nghi|soi|soi la|soi soi)\\b/.test(norm)) delta += 2;
        if (/\\b(chac chan|100|mot tram|khang dinh)\\b/.test(norm)) delta += 2;
        if (/\\b(toi la|tui la|tao la|minh la)\\b/.test(norm) && /\\b(tien tri|bao ve|phu thuy|tho san|cupid)\\b/.test(norm)) delta += 3;
        if (/\\b(chua biet|khong biet|chua chot)\\b/.test(norm)) delta -= 1;
        if (bot.role === "Sói" && human.role !== "Sói") delta += 1;
        const old = Number(brain.suspicion[human.id] || 0);
        brain.suspicion[human.id] = Math.max(-20, Math.min(100, old + delta));
        brain.observations.push({ t:Date.now(), who:human.id, text:String(text).slice(0,180) });
        if (brain.observations.length > 80) brain.observations.shift();
    }
}

function testAiSuspicionSummary(bot) {
    const brain = testAiBrain(bot);
    return room.players
        .filter(p => p.alive && p.id !== bot.id)
        .map(p => ({p, s:Number(brain.suspicion[p.id] || 0)}))
        .sort((a,b) => b.s - a.s)
        .slice(0, 7)
        .map(x => x.p.name + "=" + x.s)
        .join(", ") || "chưa có dữ liệu";
}

function testAiOwnMemory(bot) {
    const brain = testAiBrain(bot);
    const ownChats = (room.chatHistory || [])
        .filter(x => x?.playerId === bot.id && (x.chatType === "public" || x.chatType === "wolf"))
        .slice(-10)
        .map(x => String(x.text || ""));
    const remembered = brain.statements.slice(-10).map(x => x.text);
    const merged = [...ownChats, ...remembered].slice(-12);
    return merged.length ? merged.map((x,i) => (i+1) + ". " + x).join("\\n") : "Chưa nói gì đáng nhớ.";
}

function testAiFallback(bot, humanText) {
    const t = testAiNormalize(humanText);
    const brain = testAiBrain(bot);
    const ranked = room.players.filter(p => p.alive && p.id !== bot.id)
        .map(p => ({p, s:Number(brain.suspicion[p.id] || 0)})).sort((a,b)=>b.s-a.s);
    const pick = ranked[0]?.p;
    if (/\\b(alo|hello|hi|hey|ai do|co ai|aloo+)\\b/.test(t)) return ["Có đây :))", "Alo nói đi", "T đây, gì đó 👀", "Có mặt nha :))"][Math.floor(Math.random()*4)];
    if (/\\b(nghi ai|ai la soi|vote ai|chon ai)\\b/.test(t)) return pick ? "T đang cấn " + pick.name + " nhất, chưa chốt 100%." : "Chưa đủ dữ kiện để chốt.";
    if (/\\b(tai sao|sao vay|vi sao)\\b/.test(t)) return "T đang nối lại mấy câu nãy với vote thôi, chưa đủ chắc để kết luận.";
    return ["Ủa khúc này nghe cấn nha :))", "Khoan, nói tiếp coi.", "T chưa tin hẳn đâu nha.", "Ê cái này phải bàn tiếp nè.", "Rồi rồi, ai có ý kiến khác không?"][Math.floor(Math.random()*5)];
}

function testAiIsStrategic(text) {
    return /\\b(nghi|vote|treo|soi|soi|soi la|sói|soi|tien tri|bao ve|phu thuy|tai sao|vi sao|noi doi|xao|phe|role|vai|chet|can|cuu)\\b/i.test(testAiNormalize(text));
}

async function testAiGroqCall(prompt, strategic) {
    const key = process.env.GROQ_API_KEY;
    if (!key) return "";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{ role:"user", content:prompt }],
                temperature: strategic ? 0.62 : 0.78,
                top_p: 0.92,
                max_completion_tokens: strategic ? 190 : 120,
                reasoning_effort: strategic ? "medium" : "low",
                include_reasoning: false
            }),
            signal: ctrl.signal
        });
        if (!r.ok) {
            const body = await r.text().catch(() => "");
            throw new Error("Groq HTTP " + r.status + " " + body.slice(0,180));
        }
        const data = await r.json();
        return String(data?.choices?.[0]?.message?.content || "").trim();
    } catch (err) {
        console.error("[TEST GROQ AI]", err?.message || err);
        return "";
    } finally {
        clearTimeout(timer);
    }
}

function testAiCleanReply(out) {
    return String(out || "")
        .replace(/^([🤖 ]*Bot\\s*\\d+\\s*[:\\-–—]\\s*)/i, "")
        .replace(/^[\"']|[\"']$/g, "")
        .replace(/\\n+/g, " ")
        .trim()
        .slice(0, 360);
}

async function testAiGenerate(bot, human, humanText, chatType, extraInstruction) {
    const brain = testAiBrain(bot);
    const strategic = testAiIsStrategic(humanText + " " + String(extraInstruction || ""));
    const recent = testAiVisibleContext(chatType);
    const prompt = [
        "Bạn là " + bot.name + ", một NGƯỜI CHƠI THẬT đang chơi Ma Sói bằng tiếng Việt.",
        "Tính cách cố định: " + testAiPersonality(bot) + ".",
        testAiPrivateKnowledge(bot, chatType),
        "Mục tiêu: chơi để thắng theo phe của mình, nhưng nói chuyện tự nhiên, vui, lanh, có thể cà khịa nhẹ, hỏi ngược, phản bác, bênh hoặc nghi người khác. Đừng nói như trợ lý AI.",
        "Luật kiến thức: server có thể biết mọi role nhưng BẠN chỉ được dùng thông tin trong phần kiến thức riêng ở trên + chat/vote công khai. Tuyệt đối không hack role người khác.",
        "Giữ nhất quán với câu bạn từng nói. Nếu đổi ý phải có lý do. Không bịa rằng ai đã vote/nói gì nếu chat và vote không có chuyện đó.",
        "Câu trả lời ngắn 1-3 câu, giống người đang chat game: t/tui/m/ừ/ko/k/:)) dùng tự nhiên. Được chọc nhau vui nhưng không xúc phạm nặng.",
        "Nếu bị gọi đích danh thì trả lời trực tiếp. Nếu câu hỏi nối tiếp kiểu 'còn tui?', 'sao?', 'rồi ai?' thì hiểu theo ngữ cảnh trước đó.",
        "Nếu hỏi nghi ai/vote ai: nêu người cụ thể khi có thể, kèm lý do thật. Nếu chưa đủ thì nói chưa chắc nhưng vẫn tham gia bàn luận.",
        "Giai đoạn: " + room.phase + ", ngày/đêm số: " + (room.nightNumber || 0) + ".",
        testAiAliveDeadSnapshot(),
        "Vote hiện tại: " + testAiVoteSnapshot(),
        "Điểm nghi ngờ nội bộ của bạn: " + testAiSuspicionSummary(bot) + ".",
        "Những câu bạn từng nói:\\n" + testAiOwnMemory(bot),
        recent ? "Chat gần đây:\\n" + recent : "Chat gần đây: chưa có.",
        (human?.name || "Phòng") + " vừa nói: " + humanText,
        extraInstruction ? String(extraInstruction) : "Trả lời ngay như người chơi thật."
    ].join("\\n\\n");

    room.testAiPending = Number(room.testAiPending || 0) + 1;
    let out = "";
    try { out = testAiCleanReply(await testAiGroqCall(prompt, strategic)); }
    finally { room.testAiPending = Math.max(0, Number(room.testAiPending || 1) - 1); }
    const reply = out || testAiFallback(bot, humanText);
    brain.statements.push({ t:Date.now(), text:reply, phase:room.phase, night:room.nightNumber || 0 });
    if (brain.statements.length > 40) brain.statements.shift();
    return reply;
}

function testAiEmitBotChat(bot, text, chatType) {
    if (!bot || !text || !room.testMode || !room.started) return;
    let recipients;
    const payload = {
        playerId: bot.id,
        playerName: bot.name,
        text,
        dead: false,
        wolfChat: chatType === "wolf",
        coupleChat: false,
        chatType: chatType === "wolf" ? "wolf" : "public"
    };
    if (chatType === "wolf") recipients = room.players.filter(p => p.connected && (!p.alive || p.role === "Sói"));
    else recipients = room.players.filter(p => p.connected);
    try { storeChatHistory(payload, recipients); } catch (_) {}
    for (const recipient of recipients) {
        try { io.to(recipient.id).emit("chatMessage", payload); } catch (_) {}
    }
    room.testAiLastReplyAt = Date.now();
}

function testAiEligibleBots(chatType) {
    let bots = room.players.filter(p => p.isBot && p.alive);
    if (chatType === "wolf") bots = bots.filter(p => p.role === "Sói");
    return bots;
}

function testAiPickBot(bots, excludedIds, human) {
    const pool = bots.filter(b => !excludedIds.includes(b.id));
    if (!pool.length) return null;
    return pool.map(b => ({b, score:Number(testAiBrain(b).suspicion[human?.id] || 0) + Math.random()*12}))
        .sort((a,b)=>b.score-a.score)[0].b;
}

async function testAiRunChatter(human, humanText, chatType, mentioned) {
    const bots = testAiEligibleBots(chatType);
    if (!bots.length) return;
    const used = [];
    const strategic = testAiIsStrategic(humanText);
    const first = mentioned || testAiPickBot(bots, used, human);
    if (!first) return;
    used.push(first.id);

    const firstReply = await testAiGenerate(first, human, humanText, chatType, "Trả lời trực tiếp, đừng vòng vo.");
    if (!room.started || !first.alive) return;
    setTimeout(() => {
        try { if (room.testMode && room.started && first.alive) testAiEmitBotChat(first, firstReply, chatType); } catch (_) {}
    }, 220 + Math.floor(Math.random()*430));

    const secondChance = strategic ? 0.72 : 0.40;
    if (chatType === "public" && bots.length > 1 && Math.random() < secondChance) {
        const second = testAiPickBot(bots, used, human);
        if (second) {
            used.push(second.id);
            const secondText = humanText + " | " + first.name + " vừa nói: " + firstReply;
            const secondReply = await testAiGenerate(second, first, secondText, chatType, "Chen vào tự nhiên: đồng ý, phản bác, hỏi xoáy hoặc thêm một ý. Không cần lịch sự quá.");
            setTimeout(() => {
                try { if (room.testMode && room.started && second.alive) testAiEmitBotChat(second, secondReply, chatType); } catch (_) {}
            }, 900 + Math.floor(Math.random()*850));

            const thirdChance = strategic ? 0.34 : 0.14;
            if (bots.length > 2 && Math.random() < thirdChance) {
                const third = testAiPickBot(bots, used, human);
                if (third) {
                    used.push(third.id);
                    const thirdText = humanText + " | " + first.name + ": " + firstReply + " | " + second.name + ": " + secondReply;
                    const thirdReply = await testAiGenerate(third, second, thirdText, chatType, "Nói một câu chen ngang vui hoặc chốt quan điểm riêng; không lặp y chang hai Bot trước.");
                    setTimeout(() => {
                        try { if (room.testMode && room.started && third.alive) testAiEmitBotChat(third, thirdReply, chatType); } catch (_) {}
                    }, 1800 + Math.floor(Math.random()*900));
                }
            }
        }
    }
}

async function testMaybeAiBotReply(human, humanText, data) {
    if (!TEST_AI_CHAT_ENABLED || !room.testMode || !room.started || !human || human.isBot) return;
    let chatType = null;
    if (room.phase === "daySpeech" && human.alive) chatType = "public";
    else if (room.phase === "night" && human.alive && human.role === "Sói" && !room.night?.witchActionOpen) chatType = "wolf";
    else return;

    testAiUpdateSuspicionFromMessage(human, humanText);
    const bots = testAiEligibleBots(chatType);
    if (!bots.length) return;
    const mentioned = testAiMentionedBot(humanText, bots);
    const norm = testAiNormalize(humanText);
    const strong = !!mentioned || /\\b(alo|hello|hi|hey|bot|nghi|vote|soi|tai sao|sao|y kien|ai la|noi gi|tra loi|rep)\\b/.test(norm) || /[?？]$/.test(String(humanText).trim());
    if (!strong && Math.random() > 0.76) return;

    const now = Date.now();
    const minGap = mentioned ? 250 : 700;
    if (room.testAiLastReplyAt && now - room.testAiLastReplyAt < minGap) return;
    if (Number(room.testAiPending || 0) >= 3) return;
    testAiRunChatter(human, humanText, chatType, mentioned).catch(err => console.error("[TEST GROQ CHATTER]", err));
}

const testAiSpontaneousTicker = setInterval(() => {
    try {
        if (!TEST_AI_CHAT_ENABLED || !room.testMode || !room.started || room.phase !== "daySpeech") return;
        if (Number(room.testAiPending || 0) > 0) return;
        const now = Date.now();
        const last = Math.max(Number(room.testAiLastReplyAt || 0), Number(room.testAiLastSpontaneousAt || 0));
        if (now - last < 6500) return;
        if (Math.random() > 0.38) return;
        const bots = testAiEligibleBots("public");
        if (!bots.length) return;
        const bot = bots[Math.floor(Math.random()*bots.length)];
        room.testAiLastSpontaneousAt = now;
        const topic = [
            "Phòng hơi im. Chủ động nêu người bạn đang để ý hoặc hỏi cả phòng đang nghi ai.",
            "Chủ động bắt chuyện về vote/lời nói vừa rồi, kiểu đang chơi thật.",
            "Khơi một cuộc tranh luận vui: hỏi một người vì sao họ nghĩ vậy hoặc nói ai đang cấn.",
            "Nói một câu ngắn kéo mọi người vào bàn luận, có thể cà khịa nhẹ :))."
        ][Math.floor(Math.random()*4)];
        testAiGenerate(bot, {name:"Cả phòng", id:"room"}, "Mọi người đang bàn Ma Sói.", "public", topic).then(reply => {
            setTimeout(() => {
                try { if (room.testMode && room.started && room.phase === "daySpeech" && bot.alive) testAiEmitBotChat(bot, reply, "public"); } catch (_) {}
            }, 180 + Math.floor(Math.random()*420));
        }).catch(err => console.error("[TEST GROQ SPONTANEOUS]", err));
    } catch (err) {
        console.error("[TEST GROQ TICK]", err);
    }
}, 3200);
if (typeof testAiSpontaneousTicker.unref === "function") testAiSpontaneousTicker.unref();
/* ========================================================== */
`;

  const ioAnchor = 'io.on(\n    "connection",';
  if (!src.includes(ioAnchor)) throw new Error('[TEST GROQ AI] Missing io connection anchor');
  src = src.replace(ioAnchor, helpers + '\n' + ioAnchor);

  const chatAnchor = `                if (\n                    !text ||\n                    text.length > 300\n                ) {\n\n                    return;\n\n                }\n`;
  if (!src.includes(chatAnchor)) throw new Error('[TEST GROQ AI] Missing chat validation anchor');
  src = src.replace(chatAnchor, chatAnchor + `\n                if (room.testMode && !player.isBot) {\n                    testMaybeAiBotReply(player, text, data).catch(err => console.error("[TEST GROQ AI]", err));\n                }\n`);

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
    console.error('[TEST GROQ PRELOAD]', err);
    throw err;
  }
};
