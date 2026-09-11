from pathlib import Path

p = Path('server.js')
s = p.read_text(encoding='utf-8')

old_role9 = '''    if (count === 9) {

        return [
            "Sói",
            "Sói",
            "Sói",
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Dân",
            "Dân"
        ];

    }'''
new_role9 = '''    if (count === 9) {

        return [
            "Sói",
            "Sói",
            "Tiên tri",
            "Bảo vệ",
            "Phù thủy",
            "Thợ săn",
            "Dân",
            "Dân",
            "Dân"
        ];

    }'''
if old_role9 not in s:
    raise SystemExit('Role-9 block not found')
s = s.replace(old_role9, new_role9, 1)

fn = s.find('function resolveDayVote()')
if fn < 0:
    raise SystemExit('resolveDayVote not found')
marker = s.find('/*\n     * Hunter.\n     */', fn)
if marker < 0:
    raise SystemExit('Day-vote Hunter marker not found')

# Find the legacy `if (hunter) { ... }` block and remove the whole Hunter
# section through its following `return;`. finalDeaths() already owns Hunter
# death handling, including the 15-second shot window.
if_pos = s.find('if (', marker)
open_brace = s.find('{', if_pos)
if if_pos < 0 or open_brace < 0:
    raise SystemExit('Hunter if block not found')

depth = 0
close_brace = None
for i in range(open_brace, len(s)):
    if s[i] == '{':
        depth += 1
    elif s[i] == '}':
        depth -= 1
        if depth == 0:
            close_brace = i
            break
if close_brace is None:
    raise SystemExit('Hunter if block did not close')

return_pos = s.find('return;', close_brace + 1, close_brace + 400)
if return_pos < 0:
    raise SystemExit('Hunter branch return not found')
remove_end = return_pos + len('return;')

replacement = '''/*
     * Hunter is handled centrally by finalDeaths().
     * This prevents duplicate Hunter processing after a daytime execution.
     */'''
s = s[:marker] + replacement + s[remove_end:]

p.write_text(s, encoding='utf-8')
print('Patched server.js')
