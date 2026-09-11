from pathlib import Path

p = Path('server.js')
s = p.read_text(encoding='utf-8')

# 1) Audio library: add wedding.mp3 once.
old = '''    { file: "dayVote.mp3", name: "dayVote" },\n    { file: "bow.mp3", name: "bow" }\n];'''
new = '''    { file: "dayVote.mp3", name: "dayVote" },\n    { file: "bow.mp3", name: "bow" },\n    { file: "wedding.mp3", name: "wedding" }\n];'''
if old in s:
    s = s.replace(old, new, 1)

# 2) Hunter may never shoot lover: validate at resolution level.
old = '''    if (!hunter || !target || !target.alive || target.id === hunter.id) {\n        return false;\n    }'''
new = '''    if (\n        !hunter ||\n        !target ||\n        !target.alive ||\n        target.id === hunter.id ||\n        (hunter.loverId && target.id === hunter.loverId)\n    ) {\n        return false;\n    }'''
if old in s:
    s = s.replace(old, new, 1)

# 3) Hunter target list excludes lover.
old = '''    const targets = alivePlayers().filter(p => p.id !== hunter.id);'''
new = '''    const targets = alivePlayers().filter(\n        p => p.id !== hunter.id && p.id !== hunter.loverId\n    );'''
if old in s:
    s = s.replace(old, new, 1)

# 4) Hunter timeout random also excludes lover.
old = '''        const candidates = alivePlayers().filter(p => p.id !== hunter.id);'''
new = '''        const candidates = alivePlayers().filter(\n            p => p.id !== hunter.id && p.id !== hunter.loverId\n        );'''
if old in s:
    s = s.replace(old, new, 1)

# 5) Manual Hunter action: explicit lover error.
old = '''                if (!hunter || !target || !target.alive || target.id === hunter.id) {\n                    socket.emit("actionError", { message: "Mục tiêu không hợp lệ." });\n                    return;\n                }\n\n                resolveHunterShot(target, false);'''
new = '''                if (!hunter || !target || !target.alive || target.id === hunter.id) {\n                    socket.emit("actionError", { message: "Mục tiêu không hợp lệ." });\n                    return;\n                }\n\n                if (hunter.loverId && target.id === hunter.loverId) {\n                    socket.emit("actionError", { message: "❤️ Thợ Săn không được bắn người yêu." });\n                    return;\n                }\n\n                resolveHunterShot(target, false);'''
if old in s:
    s = s.replace(old, new, 1)

# 6) Couple wins only when the final two lovers are from opposite original factions.
old = '''    if (\n        alive.length === 2 &&\n        alive[0].loverId === alive[1].id &&\n        alive[1].loverId === alive[0].id\n    ) {\n\n        const cupid =\n            room.players.find(\n                p => p.role === "Cupid"\n            );\n\n        endGame(\n            "Couple",\n            cupid\n                ? `💘 ${alive[0].name} và ${alive[1].name} đã thành đôi - Cupid (${cupid.name}) đã se duyên.`\n                : `💘 ${alive[0].name} và ${alive[1].name} đã thành đôi.`\n        );\n\n        return true;\n\n    }'''
new = '''    if (\n        alive.length === 2 &&\n        alive[0].loverId === alive[1].id &&\n        alive[1].loverId === alive[0].id\n    ) {\n        const firstTeam = alive[0].role === "Sói" ? "wolf" : "village";\n        const secondTeam = alive[1].role === "Sói" ? "wolf" : "village";\n\n        /* Couple khác phe trở thành phe riêng. Couple cùng phe vẫn thắng theo phe gốc. */\n        if (firstTeam !== secondTeam) {\n            const cupid = room.players.find(p => p.role === "Cupid");\n\n            endGame(\n                "Couple",\n                cupid\n                    ? `💘 ${alive[0].name} và ${alive[1].name} chiến thắng cùng nhau - Cupid (${cupid.name}) đã se duyên.`\n                    : `💘 ${alive[0].name} và ${alive[1].name} chiến thắng cùng nhau.`\n            );\n\n            return true;\n        }\n    }'''
if old in s:
    s = s.replace(old, new, 1)

# 7) gameEnded carries Couple celebration data for every client.
old = '''            winner,\n\n            message,\n\n            players:\n                publicPlayers(true)'''
new = '''            winner,\n\n            message,\n\n            celebration:\n                winner === "Couple"\n                    ? {\n                        type: "couple",\n                        hearts: true,\n                        sfx: NETLIFY_AUDIO_BASE + "wedding.mp3",\n                        loop: false\n                    }\n                    : null,\n\n            players:\n                publicPlayers(true)'''
if old in s:
    s = s.replace(old, new, 1)

# 8) Hunter disconnect: do NOT cancel mandatory revenge; timer will random a valid target.
old = '''    if (\n        room.pendingHunter?.id ===\n        player.id\n    ) {\n\n        room.pendingHunter =\n            null;\n\n        addAdminLog(\n            `Thợ săn ${player.name} mất kết nối, bỏ qua lượt bắn.`\n        );\n\n        broadcastPlayers();\n\n        if (\n            checkWinner()\n        ) {\n\n            return;\n\n        }\n\n        startDaySpeech(\n            room.night?.witchSave === true,\n            !!room.night?.witchPoisonTargetId\n        );\n\n        return;\n\n    }'''
new = '''    if (\n        room.pendingHunter?.id ===\n        player.id\n    ) {\n        addAdminLog(\n            `Thợ săn ${player.name} mất kết nối; hết 15 giây hệ thống vẫn random mục tiêu trả thù.`\n        );\n\n        broadcastPlayers();\n        sendAdminState();\n        return;\n    }'''
if old in s:
    s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('Patched Couple victory + wedding + Hunter lover protection rules.')
