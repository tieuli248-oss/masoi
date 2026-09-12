const fs = require('fs');
const path = require('path');

// TEST BACKEND ONLY: keep phase=INTRO until the Host finishes the typewriter story.
// Production server-core.js on GitHub is not edited.
const originalReadFileSync = fs.readFileSync;
let patchedOnce = false;

fs.readFileSync = function(file, options){
  const result = originalReadFileSync.apply(this, arguments);
  try{
    if(patchedOnce || path.basename(String(file)) !== 'server-core.js') return result;
    const isBuffer = Buffer.isBuffer(result);
    let src = isBuffer ? result.toString('utf8') : String(result);

    const gameClockOld = `    room.gameStartedAt =\n        Date.now();`;
    const gameClockNew = `    room.gameStartedAt =\n        room.testMode ? null : Date.now();`;
    if(src.includes(gameClockOld)) src = src.replace(gameClockOld, gameClockNew);
    else console.warn('[TEST INTRO] game clock anchor not found');

    const startOld = `    emitRoom();\n\n    sendAdminState();\n\n    startNight();\n\n    return {\n        ok: true\n    };`;
    const startNew = `    emitRoom();\n\n    sendAdminState();\n\n    if (room.testMode) {\n        room.testIntroWaiting = true;\n        const introToken = Date.now() + \"-\" + Math.random().toString(36).slice(2);\n        room.testIntroToken = introToken;\n        setTimeout(() => {\n            if (!room.started || !room.testMode || room.phase !== \"intro\" || !room.testIntroWaiting || room.testIntroToken !== introToken) return;\n            room.testIntroWaiting = false;\n            if (!room.gameStartedAt) room.gameStartedAt = Date.now();\n            startNight();\n        }, 12000);\n    } else {\n        startNight();\n    }\n\n    return {\n        ok: true\n    };`;
    if(src.includes(startOld)) src = src.replace(startOld, startNew);
    else console.warn('[TEST INTRO] startGame anchor not found');

    const chatAnchor = `        socket.on(\n            \"chatMessage\",\n            data => {`;
    const introHandler = `        socket.on(\"testIntroComplete\", () => {\n            const player = findPlayer(socket.data.playerId);\n            if (!player || player.id !== room.hostId) return;\n            if (!room.started || !room.testMode || room.phase !== \"intro\" || !room.testIntroWaiting) return;\n            room.testIntroWaiting = false;\n            room.testIntroToken = null;\n            if (!room.gameStartedAt) room.gameStartedAt = Date.now();\n            startNight();\n        });\n\n` + chatAnchor;
    if(src.includes(chatAnchor)) src = src.replace(chatAnchor, introHandler);
    else console.warn('[TEST INTRO] socket anchor not found');

    patchedOnce = true;
    console.log('[TEST INTRO] Server-coordinated intro delay enabled');
    return isBuffer ? Buffer.from(src,'utf8') : src;
  }catch(err){
    console.error('[TEST INTRO PRELOAD]',err);
    return result;
  }
};
