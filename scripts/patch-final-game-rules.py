from pathlib import Path
import re

p = Path('server.js')
s = p.read_text(encoding='utf-8')

# No intro audio: story is frontend typewriter only.
s = s.replace('    intro: 20,\n', '')
s = s.replace('    { file: "intro.mp3", name: "Dẫn truyện" },\n', '')
s = s.replace('    { file: "intro.mp3", name: "Intro" },\n', '')
s = s.replace('        intro: "file:intro.mp3",\n', '')
s = s.replace('                key === "intro" ||\n', '')

# If the previous audio-intro phase patch exists, start directly at Night 1.
s = s.replace('    room.phase = "intro";', '    room.phase = "lobby";')
s = re.sub(r'\n\s*emitMusic\("intro"\);\s*\n\s*io\.emit\(\s*"phaseChanged",\s*\{\s*phase:\s*"intro",.*?\n\s*\);\s*\n\s*startTimer\(\s*TIME\.intro,\s*\(\)\s*=>\s*\{.*?\n\s*\);', '\n\n    startNight();', s, flags=re.S)
s = re.sub(r'\n\s*socket\.on\(\s*"introFinished",\s*\(\)\s*=>\s*\{.*?\n\s*\);', '', s, flags=re.S)
s = s.replace('        } else if (\n            room.phase === "intro"\n        ) {\n            musicKey = "intro";\n', '        } else if (\n            room.phase === "night"\n        ) {\n            musicKey = "night";\n')

# Freeze actual room population at start. Host does not select a target count.
needle = '    room.targetPlayerCount =\n        count;'
if needle in s and 'room.gameInitialPlayerCount = count;' not in s[s.find(needle):s.find(needle)+250]:
    s = s.replace(needle, needle + '\n\n    room.gameInitialPlayerCount = count;', 1)

# Seer: only ordinary Villager is THIỆN; every other role is unknown.
s = re.sub(
    r'const result\s*=\s*target\.role\s*===\s*"Sói"\s*\?\s*"🐺 Sói"\s*:\s*"👨‍🌾 Phe Dân"\s*;',
    'const result = target.role === "Dân" ? "🟢 THIỆN" : "❓ KHÔNG RÕ";',
    s
)
s = re.sub(
    r'let result\s*=\s*"❓ Không rõ";\s*if\s*\(\s*target\.role\s*===\s*"Sói"\s*\)\s*\{.*?\}\s*else if\s*\(\s*target\.role\s*===\s*"Dân(?: làng)?"\s*\)\s*\{.*?\}',
    'let result = target.role === "Dân" ? "🟢 THIỆN" : "❓ KHÔNG RÕ";',
    s,
    flags=re.S
)

# ---------------------------------------------------------
# Timing rules
# Night = 45s wolf/poison + up to 15s witch save (max 60s)
# Cupid = first 15s of Night 1
# ---------------------------------------------------------
s = re.sub(
    r'const TIME = \{\s*night:\s*\d+,\s*cupidPair:\s*\d+,\s*witchPoison:\s*\d+,\s*witchSave:\s*\d+,\s*hunterShoot:\s*\d+,\s*daySpeech:\s*\d+,\s*dayVote:\s*\d+\s*\};',
    '''const TIME = {\n    night: 45,\n    cupidPair: 15,\n    witchPoison: 45,\n    witchSave: 15,\n    hunterShoot: 15,\n    daySpeech: 180,\n    dayVote: 30\n};''',
    s,
    count=1,
    flags=re.S
)

# Dynamic daytime discussion duration by number of living players.
if 'function daySpeechSecondsForAlive(' not in s:
    marker = '''function connectedPlayers() {\n\n    return room.players.filter(\n        p => p.connected\n    );\n\n}\n'''
    helper = marker + '''\nfunction daySpeechSecondsForAlive(count = alivePlayers().length) {\n    if (count <= 6) return 90;\n    if (count <= 8) return 120;\n    if (count <= 10) return 150;\n    return 180;\n}\n'''
    if marker not in s:
        raise SystemExit('connectedPlayers marker not found')
    s = s.replace(marker, helper, 1)

s = s.replace(
    '''    startTimer(\n        TIME.daySpeech,\n        startDayVote\n    );''',
    '''    startTimer(\n        daySpeechSecondsForAlive(),\n        startDayVote\n    );''',
    1
)

# Wolf bite requires >50% of all living wolves to vote for the same target.
majority_marker = '''    if (\n        leaders.length !== 1\n    ) {\n\n        return null;\n\n    }\n\n    const target ='''
if 'highest <= aliveWolves().length / 2' not in s:
    majority_replacement = '''    if (\n        leaders.length !== 1\n    ) {\n\n        return null;\n\n    }\n\n    /*\n     * Cắn chỉ thành công khi một mục tiêu nhận QUÁ 50% phiếu\n     * của số Sói còn sống. 2 Sói cần 2 phiếu, 3 cần 2, 4 cần 3.\n     */\n    if (\n        highest <= aliveWolves().length / 2\n    ) {\n        return null;\n    }\n\n    const target ='''
    if majority_marker not in s:
        raise SystemExit('wolf majority marker not found')
    s = s.replace(majority_marker, majority_replacement, 1)

# Cupid auto-pair helper. It is private: lovers get each other's roles; Cupid gets names only.
if 'function autoPairCupidIfNeeded(' not in s:
    marker = '''/* =========================================================\n   START NIGHT\n========================================================= */\n\nfunction startNight() {'''
    helper = '''/* =========================================================\n   CUPID AUTO PAIR - NIGHT 1, AFTER FIRST 15s\n========================================================= */\n\nfunction autoPairCupidIfNeeded(nightRef) {\n    if (\n        !room.started ||\n        room.phase !== "night" ||\n        room.nightNumber !== 1 ||\n        !room.night ||\n        room.night !== nightRef ||\n        room.night.cupidPairs.length\n    ) {\n        return;\n    }\n\n    const cupid = room.players.find(\n        p => p.alive && p.role === "Cupid"\n    );\n\n    if (!cupid) return;\n\n    const candidates = alivePlayers();\n    if (candidates.length < 2) return;\n\n    const shuffled = [...candidates].sort(() => Math.random() - 0.5);\n    const first = shuffled[0];\n    const second = shuffled[1];\n\n    first.loverId = second.id;\n    second.loverId = first.id;\n\n    room.night.cupidPairs.push({\n        firstId: first.id,\n        firstName: first.name,\n        secondId: second.id,\n        secondName: second.name,\n        auto: true\n    });\n\n    io.to(first.id).emit("loverLinked", {\n        loverId: second.id,\n        loverName: second.name,\n        loverRole: second.role\n    });\n\n    io.to(second.id).emit("loverLinked", {\n        loverId: first.id,\n        loverName: first.name,\n        loverRole: first.role\n    });\n\n    storeEventHistory(\n        `💘 Couple của bạn: ${second.name} (${second.role})`,\n        [first]\n    );\n    storeEventHistory(\n        `💘 Couple của bạn: ${first.name} (${first.role})`,\n        [second]\n    );\n\n    const cupidMessage =\n        `💘 Hết 15 giây — hệ thống tự ghép ${first.name} ❤️ ${second.name}.`;\n\n    if (cupid.connected) {\n        io.to(cupid.id).emit("cupidAutoPaired", {\n            firstId: first.id,\n            firstName: first.name,\n            secondId: second.id,\n            secondName: second.name,\n            message: cupidMessage\n        });\n    }\n\n    storeEventHistory(cupidMessage, [cupid]);\n    addAdminLog(`Cupid hết giờ: hệ thống tự ghép ${first.name} ❤️ ${second.name}.`);\n    sendAdminState();\n}\n\n\n/* =========================================================\n   START NIGHT\n========================================================= */\n\nfunction startNight() {'''
    if marker not in s:
        raise SystemExit('startNight marker not found')
    s = s.replace(marker, helper, 1)

# Schedule Cupid auto-pair after the first 15 seconds of Night 1.
needle = '''    startWitchPoisonAction();\n\n}'''
if 'autoPairCupidIfNeeded(nightRef)' not in s:
    replacement = '''    startWitchPoisonAction();\n\n    if (room.nightNumber === 1) {\n        const nightRef = room.night;\n        setTimeout(\n            () => autoPairCupidIfNeeded(nightRef),\n            TIME.cupidPair * 1000\n        );\n    }\n\n}'''
    if needle not in s:
        raise SystemExit('startNight end marker not found')
    s = s.replace(needle, replacement, 1)

# User-facing save duration text.
s = s.replace('Bạn có 10 giây để quyết định cứu.', 'Bạn có 15 giây để quyết định cứu.')
s = s.replace('Bạn có 10 giây để quyết định cứu.`', 'Bạn có 15 giây để quyết định cứu.`')
s = s.replace('WITCH - SAVE 10s AFTER WOLF LOCKS AT 50s', 'WITCH - SAVE 15s AFTER WOLF LOCKS AT 45s')

# Witch poison can be explicitly cleared during the 45s draft window.
clear_marker = '''                if (\n                    witch.used.witchPoison\n                ) {\n                    socket.emit(\n                        "actionError",\n                        {\n                            message:\n                                "Đã dùng bình độc."\n                        }\n                    );\n                    return;\n                }\n\n                if (\n                    !target ||'''
if 'type:\n                            "witchPoisonCleared"' not in s:
    clear_replacement = '''                if (\n                    witch.used.witchPoison\n                ) {\n                    socket.emit(\n                        "actionError",\n                        {\n                            message:\n                                "Đã dùng bình độc."\n                        }\n                    );\n                    return;\n                }\n\n                if (\n                    data?.clear === true ||\n                    data?.targetId == null\n                ) {\n                    room.night.witchPoisonDraftTargetId = null;\n\n                    socket.emit(\n                        "actionAccepted",\n                        {\n                            type:\n                                "witchPoisonCleared",\n                            targetId:\n                                null\n                        }\n                    );\n\n                    addAdminLog(\n                        `Phù thủy ${witch.name} bỏ chọn mục tiêu độc.`\n                    );\n\n                    sendAdminState();\n                    return;\n                }\n\n                if (\n                    !target ||'''
    if clear_marker not in s:
        raise SystemExit('witch poison clear marker not found')
    s = s.replace(clear_marker, clear_replacement, 1)

# Cupid manual window is 15s, and acknowledge successful manual pair.
s = s.replace(
    'Cupid chỉ được ghép đôi trong 20 giây đầu của đêm 1.',
    'Cupid chỉ được ghép đôi trong 15 giây đầu của đêm 1.'
)

ack_marker = '''                addAdminLog(\n                    `Cupid ghép ${first.name} ❤️ ${second.name}.`\n                );\n\n                sendAdminState();'''
if 'type:\n                            "cupidPair"' not in s:
    ack_replacement = '''                socket.emit(\n                    "actionAccepted",\n                    {\n                        type:\n                            "cupidPair",\n                        firstId:\n                            first.id,\n                        secondId:\n                            second.id\n                    }\n                );\n\n                addAdminLog(\n                    `Cupid ghép ${first.name} ❤️ ${second.name}.`\n                );\n\n                sendAdminState();'''
    if ack_marker not in s:
        raise SystemExit('Cupid ack marker not found')
    s = s.replace(ack_marker, ack_replacement, 1)

p.write_text(s, encoding='utf-8')
print('All final rules patched')
