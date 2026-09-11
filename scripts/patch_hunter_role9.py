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

old_hunter = '''    /*
     * Hunter.
     */

    const hunter =
        deaths.find(
            p =>
                p.role === "Thợ săn"
        );

    if (
        hunter
    ) {

        room.pendingHunter = {

            id:
                hunter.id,

            name:
                hunter.name

        };

        finalDeaths(
            deaths,
            "voteResult",
            {

                executed: {

                    id:
                        target.id,

                    name:
                        target.name

                }

            }
        );

        if (
            hunter.connected
        ) {

            io.to(
                hunter.id
            ).emit(
                "hunterActionRequired",
                {

                    seconds:
                        TIME.hunterShoot,

                    players:
                        alivePlayers()
                            .filter(
                                p =>
                                    p.id !==
                                    hunter.id
                            )
                            .map(
                                p => ({

                                    id:
                                        p.id,

                                    name:
                                        p.name

                                })
                            )

                }
            );

        }

        startTimer(
            TIME.hunterShoot,
            () => {

                if (
                    !room.pendingHunter
                ) {

                    return;

                }

                room.pendingHunter =
                    null;

                if (
                    checkWinner()
                ) {

                    return;

                }

                startNight();

            }
        );

        return;

    }

'''
if old_hunter not in s:
    raise SystemExit('Legacy day-vote Hunter block not found')

s = s.replace(
    old_hunter,
    '''    /*
     * Hunter is handled centrally by finalDeaths().
     * This prevents duplicate Hunter processing after a daytime execution.
     */

''',
    1
)

p.write_text(s, encoding='utf-8')
print('Patched server.js')
