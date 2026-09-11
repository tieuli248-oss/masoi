from pathlib import Path
import re

p = Path("server.js")
s = p.read_text(encoding="utf-8")


def need(ok, label):
    if not ok:
        raise SystemExit(f"Patch target not found: {label}")


# 1) Intro audio / phase
if "intro: 20," not in s:
    s, n = re.subn(r"(const TIME = \{\n)", r"\1    intro: 20,\n", s, count=1)
    need(n == 1, "TIME intro")

if '{ file: "intro.mp3", name: "Dẫn truyện" }' not in s:
    old = '    { file: "lobby.mp3", name: "Lobby" },\n'
    need(old in s, "audio library lobby")
    s = s.replace(old, old + '    { file: "intro.mp3", name: "Dẫn truyện" },\n', 1)

if 'intro: "file:intro.mp3"' not in s:
    old = '        lobby: "file:lobby.mp3",\n'
    need(old in s, "audio phase lobby")
    s = s.replace(old, old + '        intro: "file:intro.mp3",\n', 1)

if 'key === "intro" ||' not in s:
    old = '                key === "daySpeech" ||\n'
    need(old in s, "one-shot daySpeech")
    s = s.replace(old, '                key === "intro" ||\n' + old, 1)

start_a = s.index("function startGame()")
start_b = s.index("/* =========================================================\n   START NIGHT", start_a)
sg = s[start_a:start_b]

if 'room.phase =\n        "intro";' not in sg:
    need('room.phase =\n        "lobby";' in sg, "startGame lobby phase")
    sg = sg.replace('room.phase =\n        "lobby";', 'room.phase =\n        "intro";', 1)

if 'emitMusic("intro")' not in sg:
    old = '''    emitRoom();

    sendAdminState();

    startNight();

    return {
        ok: true
    };'''
    need(old in sg, "startGame final block")
    new = '''    emitRoom();

    sendAdminState();

    emitMusic("intro");

    io.emit(
        "phaseChanged",
        {
            phase: "intro",
            nightNumber: 0,
            players: publicPlayers(false)
        }
    );

    startTimer(
        TIME.intro,
        () => {
            if (room.started && room.phase === "intro") {
                startNight();
            }
        }
    );

    return {
        ok: true
    };'''
    sg = sg.replace(old, new, 1)

s = s[:start_a] + sg + s[start_b:]


# 2) Public realtime day-vote state
if "function sendDayVoteState(" not in s:
    marker = '''/* =========================================================
   START DAY VOTE
========================================================= */'''
    need(marker in s, "day vote marker")
    helper = '''/* =========================================================
   REALTIME DAY VOTE STATE
========================================================= */

function sendDayVoteState(targetSocketId = null) {
    if (room.phase !== "dayVote") return;

    const grouped = new Map();

    for (const [voterId, targetId] of room.dayVotes) {
        const voter = findPlayer(voterId);
        const target = findPlayer(targetId);
        if (!voter?.alive || !target?.alive) continue;

        if (!grouped.has(target.id)) {
            grouped.set(target.id, {
                targetId: target.id,
                targetName: target.name,
                voters: []
            });
        }

        grouped.get(target.id).voters.push({
            id: voter.id,
            name: voter.name
        });
    }

    const groups = alivePlayers()
        .map(p => grouped.get(p.id))
        .filter(Boolean);

    const payload = { groups };

    if (targetSocketId) {
        io.to(targetSocketId).emit("dayVoteState", payload);
    } else {
        io.emit("dayVoteState", payload);
    }
}


'''
    s = s.replace(marker, helper + marker, 1)

# Initial empty/current state when vote phase starts.
dv_a = s.index("function startDayVote()")
dv_b = s.index("/* =========================================================\n   RESOLVE DAY VOTE", dv_a)
dv = s[dv_a:dv_b]
if "sendDayVoteState();" not in dv:
    pos = dv.find("\n    broadcastPlayers();")
    need(pos >= 0, "startDayVote broadcast")
    dv = dv[:pos] + "\n    sendDayVoteState();\n" + dv[pos:]
s = s[:dv_a] + dv + s[dv_b:]

# Update everyone after every vote/change of vote.
sock_a = s.index("/* =====================================================\n           🗳️ DAY VOTE")
sock_b = s.index("/* =====================================================\n           💬 CHAT", sock_a)
block = s[sock_a:sock_b]
if "sendDayVoteState();" not in block:
    m = re.search(r'(socket\.emit\(\s*"dayVoteAccepted"[\s\S]*?\n\s*\);)', block)
    need(m is not None, "dayVoteAccepted emit")
    block = block[:m.end()] + "\n\n                sendDayVoteState();" + block[m.end():]
s = s[:sock_a] + block + s[sock_b:]


# 3) Reconnect gets intro audio + current realtime vote
rec_a = s.index("function reconnectState(")
rec_b = s.index("/* =========================================================\n   SOCKET CONNECTION", rec_a)
rec = s[rec_a:rec_b]

if 'musicKey = "intro";' not in rec:
    needle = '''} else if (
    room.phase === "night"
) {

    musicKey = "night";'''
    need(needle in rec, "reconnect night music")
    repl = '''} else if (
    room.phase === "intro"
) {

    musicKey = "intro";

} else if (
    room.phase === "night"
) {

    musicKey = "night";'''
    rec = rec.replace(needle, repl, 1)

if "sendDayVoteState(socket.id);" not in rec:
    needle = '''    emitMusic(
        musicKey,
        socket.id
    );

    sendHistoryToPlayer('''
    need(needle in rec, "reconnect emitMusic")
    repl = '''    emitMusic(
        musicKey,
        socket.id
    );

    if (room.phase === "dayVote") {
        sendDayVoteState(socket.id);
    }

    sendHistoryToPlayer('''
    rec = rec.replace(needle, repl, 1)

s = s[:rec_a] + rec + s[rec_b:]


# 4) Server-enforced chat lock during day vote.
old = '''                if (
                    room.phase === "daySpeech" ||
                    room.phase === "dayVote"
                ) {'''
new = '''                if (
                    room.phase === "daySpeech"
                ) {'''
if old in s:
    s = s.replace(old, new, 1)
need('room.phase === "daySpeech" ||\n                    room.phase === "dayVote"' not in s, "dayVote chat lock")


# 5) Host advances immediately when intro.mp3 actually ends.
if '"introFinished"' not in s:
    marker = '''        /* =====================================================
           🐺 WOLF VOTE
        ===================================================== */'''
    need(marker in s, "wolf vote marker")
    handler = '''        /* =====================================================
           INTRO FINISHED
        ===================================================== */

        socket.on(
            "introFinished",
            () => {
                const player = findPlayer(socket.data.playerId);

                if (
                    !player ||
                    player.id !== room.hostId ||
                    !room.started ||
                    room.phase !== "intro"
                ) {
                    return;
                }

                startNight();
            }
        );


'''
    s = s.replace(marker, handler + marker, 1)

p.write_text(s, encoding="utf-8")
