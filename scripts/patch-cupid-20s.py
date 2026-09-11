from pathlib import Path

p = Path('server.js')
s = p.read_text(encoding='utf-8')

old = '''const TIME = {\n    night: 45,\n    witchPoison: 45,'''
new = '''const TIME = {\n    night: 45,\n    cupidPair: 20,\n    witchPoison: 45,'''
if old in s:
    s = s.replace(old, new, 1)

old = '''    resetNight(\n        previousGuardTarget\n    );\n\n    addLog('''
new = '''    resetNight(\n        previousGuardTarget\n    );\n\n    room.night.cupidPairEndsAt =\n        room.nightNumber === 1\n            ? Date.now() + TIME.cupidPair * 1000\n            : null;\n\n    addLog('''
if old not in s:
    raise SystemExit('startNight anchor not found')
s = s.replace(old, new, 1)

old = '''                if (\n                    room.phase !== "night" ||\n                    room.night?.witchActionOpen ||\n                    room.nightNumber !== 1\n                ) {'''
new = '''                if (\n                    room.phase !== "night" ||\n                    room.night?.witchActionOpen ||\n                    room.nightNumber !== 1 ||\n                    !room.night?.cupidPairEndsAt ||\n                    Date.now() > room.night.cupidPairEndsAt\n                ) {'''
if old not in s:
    raise SystemExit('Cupid guard anchor not found')
s = s.replace(old, new, 1)

# Give a useful error when Cupid tries after the 20-second window.
anchor = '''                const cupid =\n                    findPlayer(\n                        socket.data.playerId\n                    );'''
insert = '''                if (\n                    room.nightNumber === 1 &&\n                    room.night?.cupidPairEndsAt &&\n                    Date.now() > room.night.cupidPairEndsAt\n                ) {\n                    socket.emit(\n                        "actionError",\n                        { message: "Cupid chỉ được ghép đôi trong 20 giây đầu của đêm 1." }\n                    );\n                    return;\n                }\n\n'''
# The earlier guard returns first, so place this check before guard instead by replacing the guard block.
# Rewrite guard into two stages to preserve the explicit error.
old_guard = '''                if (\n                    room.phase !== "night" ||\n                    room.night?.witchActionOpen ||\n                    room.nightNumber !== 1 ||\n                    !room.night?.cupidPairEndsAt ||\n                    Date.now() > room.night.cupidPairEndsAt\n                ) {\n\n                    return;\n\n                }\n\n                const cupid ='''
new_guard = '''                if (\n                    room.phase !== "night" ||\n                    room.night?.witchActionOpen ||\n                    room.nightNumber !== 1\n                ) {\n                    return;\n                }\n\n                if (\n                    !room.night?.cupidPairEndsAt ||\n                    Date.now() > room.night.cupidPairEndsAt\n                ) {\n                    socket.emit(\n                        "actionError",\n                        { message: "Cupid chỉ được ghép đôi trong 20 giây đầu của đêm 1." }\n                    );\n                    return;\n                }\n\n                const cupid ='''
if old_guard not in s:
    raise SystemExit('Cupid staged guard anchor not found')
s = s.replace(old_guard, new_guard, 1)

p.write_text(s, encoding='utf-8')
print('Cupid 20-second rule patched')
