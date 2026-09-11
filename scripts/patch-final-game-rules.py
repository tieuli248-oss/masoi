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
# Current server variant: result is wolf / village.
s = re.sub(
    r'const result\s*=\s*target\.role\s*===\s*"Sói"\s*\?\s*"🐺 Sói"\s*:\s*"👨‍🌾 Phe Dân"\s*;',
    'const result = target.role === "Dân" ? "🟢 THIỆN" : "❓ KHÔNG RÕ";',
    s
)
# Older verbose variant.
s = re.sub(
    r'let result\s*=\s*"❓ Không rõ";\s*if\s*\(\s*target\.role\s*===\s*"Sói"\s*\)\s*\{.*?\}\s*else if\s*\(\s*target\.role\s*===\s*"Dân(?: làng)?"\s*\)\s*\{.*?\}',
    'let result = target.role === "Dân" ? "🟢 THIỆN" : "❓ KHÔNG RÕ";',
    s,
    flags=re.S
)

p.write_text(s, encoding='utf-8')
print('Final game rules patched')
