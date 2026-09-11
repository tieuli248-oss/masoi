from pathlib import Path

# Idempotent follow-up for the current deployed server.
p = Path('server.js')
s = p.read_text(encoding='utf-8')

schedule = '''    if (room.nightNumber === 1) {\n        const nightRef = room.night;\n        setTimeout(\n            () => autoPairCupidIfNeeded(nightRef),\n            TIME.cupidPair * 1000\n        );\n    }'''

if schedule not in s:
    needle = '''    startWitchPoisonAction();\n\n}'''
    replacement = '''    startWitchPoisonAction();\n\n''' + schedule + '''\n\n}'''
    if needle not in s:
        raise SystemExit('startNight schedule marker not found')
    s = s.replace(needle, replacement, 1)

p.write_text(s, encoding='utf-8')
print('Cupid auto-pair schedule ensured')
