from pathlib import Path

p = Path('server.js')
s = p.read_text(encoding='utf-8')

# Keep Cupid Night-1 auto pair schedule.
schedule = '''    if (room.nightNumber === 1) {\n        const nightRef = room.night;\n        setTimeout(\n            () => autoPairCupidIfNeeded(nightRef),\n            TIME.cupidPair * 1000\n        );\n    }'''
if schedule not in s:
    needle = '''    startWitchPoisonAction();\n\n}'''
    if needle not in s:
        raise SystemExit('startNight schedule marker not found')
    s = s.replace(needle, '''    startWitchPoisonAction();\n\n''' + schedule + '''\n\n}''', 1)

# Audio catalog: bow.mp3 is a one-shot SFX.
if '{ file: "bow.mp3", name: "bow" }' not in s:
    needle = '''    { file: "dayVote.mp3", name: "dayVote" }\n];'''
    if needle not in s:
        raise SystemExit('audio library marker not found')
    s = s.replace(needle, '''    { file: "dayVote.mp3", name: "dayVote" },\n    { file: "bow.mp3", name: "bow" }\n];''', 1)

# Shared Hunter helpers. Hunter MUST shoot; timeout randomly selects a living target.
if 'function startHunterRevenge(' not in s:
    marker = '''/* =========================================================\n   FINAL DEATHS\n========================================================= */'''
    if marker not in s:
        raise SystemExit('FINAL DEATHS marker not found')
    helper = r'''/* =========================================================
   HUNTER REVENGE - MANDATORY 15s
========================================================= */

function finishAfterHunter(context) {
    if (checkWinner()) return;

    if (context === "night") {
        startDaySpeech(
            room.night?.witchSave === true,
            !!room.night?.witchPoisonTargetId
        );
        return;
    }

    startNight();
}

function resolveHunterShot(target, auto = false) {
    const pending = room.pendingHunter;
    if (!pending) return false;

    const hunter = findPlayer(pending.id);
    if (!hunter || !target || !target.alive || target.id === hunter.id) {
        return false;
    }

    stopTimer();

    const deaths = killPlayer(target, "Bị Thợ săn bắn");
    const context = pending.context || (room.phase === "night" ? "night" : "day");
    room.pendingHunter = null;

    if (room.night) room.night.hunterShotTargetId = target.id;
    if (context === "night") room.pendingNightDeaths.push(...deaths);

    const message = auto
        ? `🏹 Hết 15 giây — hệ thống random: ${hunter.name} bắn ${target.name}.`
        : `🏹 ${hunter.name} đã bắn ${target.name}.`;

    addAdminLog(message);
    storeEventHistory(message, room.players);

    io.emit("hunterShotResolved", {
        hunterId: hunter.id,
        hunterName: hunter.name,
        targetId: target.id,
        targetName: target.name,
        auto,
        message,
        sfx: NETLIFY_AUDIO_BASE + "bow.mp3"
    });

    sendDeaths(deaths, "dead");
    broadcastPlayers();
    sendAdminState();

    finishAfterHunter(context);
    return true;
}

function startHunterRevenge(hunter, context) {
    if (!hunter) return false;

    const targets = alivePlayers().filter(p => p.id !== hunter.id);
    if (!targets.length) {
        finishAfterHunter(context);
        return false;
    }

    room.pendingHunter = {
        id: hunter.id,
        name: hunter.name,
        context
    };

    const publicTargets = targets.map(p => ({ id: p.id, name: p.name }));

    io.emit("hunterRevengeStarted", {
        hunterId: hunter.id,
        hunterName: hunter.name,
        seconds: TIME.hunterShoot,
        message: "🏹 THỢ SĂN ĐANG TRẢ THÙ — đang chọn một người để bắn..."
    });

    if (hunter.connected) {
        io.to(hunter.id).emit("hunterActionRequired", {
            seconds: TIME.hunterShoot,
            players: publicTargets,
            mandatory: true
        });
    }

    addAdminLog(`Thợ săn ${hunter.name} có ${TIME.hunterShoot} giây để trả thù.`);

    startTimer(TIME.hunterShoot, () => {
        if (!room.pendingHunter || room.pendingHunter.id !== hunter.id) return;
        const candidates = alivePlayers().filter(p => p.id !== hunter.id);
        if (!candidates.length) {
            room.pendingHunter = null;
            finishAfterHunter(context);
            return;
        }
        const randomTarget = candidates[Math.floor(Math.random() * candidates.length)];
        resolveHunterShot(randomTarget, true);
    });

    return true;
}

'''
    s = s.replace(marker, helper + marker, 1)

# Night Hunter: replace old optional timeout block with mandatory helper.
night_start = s.find('''    /*\n     * Kiểm tra Hunter.\n     */''')
night_end = s.find('''    if (\n        checkWinner()\n    ) {''', night_start)
if night_start != -1 and night_end != -1 and 'startHunterRevenge(hunter, "night")' not in s[night_start:night_end]:
    replacement = '''    /*\n     * Kiểm tra Hunter: bắt buộc trả thù trong 15 giây.\n     */\n\n    const hunter =\n        uniqueDeaths.find(\n            p => p.role === "Thợ săn"\n        );\n\n    if (hunter) {\n        startHunterRevenge(hunter, "night");\n        return;\n    }\n\n'''
    s = s[:night_start] + replacement + s[night_end:]

# Day execution: if Hunter is among deaths, show result first, then mandatory revenge.
day_needle = '''    /*\n     * Hunter is handled centrally by finalDeaths().\n     * This prevents duplicate Hunter processing after a daytime execution.\n     */\n\n    finalDeaths(\n        deaths,\n        "voteResult",'''
if day_needle in s:
    day_repl = '''    const executedHunter = deaths.find(p => p.role === "Thợ săn");\n\n    if (executedHunter) {\n        finalDeaths(\n            deaths,\n            "voteResult",'''
    s = s.replace(day_needle, day_repl, 1)
    tail = '''        () => {\n\n            if (\n                checkWinner()\n            ) {\n\n                return;\n\n            }\n\n            startNight();\n\n        }\n    );'''
    pos = s.find(day_repl)
    end = s.find(tail, pos)
    if end == -1:
        raise SystemExit('day vote finalDeaths tail not found')
    end += len(tail)
    new_tail = '''        () => {\n            startHunterRevenge(executedHunter, "day");\n        }\n        );\n        return;\n    }\n\n    finalDeaths(\n        deaths,\n        "voteResult",\n        {\n            executed: {\n                id: target.id,\n                name: target.name\n            }\n        },\n        () => {\n            if (checkWinner()) return;\n            startNight();\n        }\n    );'''
    s = s[:end-len(tail)] + new_tail + s[end:]

# Replace socket handler body so manual shots use the same mandatory resolver.
handler_start = s.find('''        /* =====================================================\n           🏹 HUNTER SHOOT\n        ===================================================== */''')
handler_end = s.find('''        /* =====================================================\n           🗳️ DAY VOTE''', handler_start)
if handler_start != -1 and handler_end != -1 and 'resolveHunterShot(target, false);' not in s[handler_start:handler_end]:
    new_handler = r'''        /* =====================================================
           🏹 HUNTER SHOOT
        ===================================================== */

        socket.on(
            "hunterShoot",
            data => {
                if (
                    !room.pendingHunter ||
                    room.pendingHunter.id !== socket.data.playerId
                ) return;

                const hunter = findPlayer(socket.data.playerId);
                const target = findPlayer(data?.targetId);

                if (!hunter || !target || !target.alive || target.id === hunter.id) {
                    socket.emit("actionError", { message: "Mục tiêu không hợp lệ." });
                    return;
                }

                resolveHunterShot(target, false);
            }
        );


'''
    s = s[:handler_start] + new_handler + s[handler_end:]

p.write_text(s, encoding='utf-8')
print('Cupid schedule + mandatory Hunter revenge + bow SFX ensured')
