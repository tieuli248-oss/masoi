const fs = require('fs');
const path = require('path');

// Test-backend-only preload. It emits a private wolf-team marker event to each
// real player whenever the player list is broadcast. Only Wolves receive the
// actual wolf list; everyone else receives an empty list so stale markers clear.
const previousReadFileSync = fs.readFileSync;

fs.readFileSync = function(file, ...args) {
  const result = previousReadFileSync.call(fs, file, ...args);
  try {
    if (path.basename(String(file)) !== 'server-core.js') return result;
    const isBuffer = Buffer.isBuffer(result);
    let source = isBuffer ? result.toString('utf8') : String(result);
    if (source.includes('TEST_WOLF_IDENTITY_MARKERS_V1')) return result;

    const oldBlock = `function broadcastPlayers() {\n\n    io.emit(\n        \"playersUpdated\",\n        {\n            players:\n                publicPlayers(false)\n        }\n    );\n\n}`;

    const newBlock = `function broadcastPlayers() {\n\n    io.emit(\n        \"playersUpdated\",\n        {\n            players:\n                publicPlayers(false)\n        }\n    );\n\n    /* TEST_WOLF_IDENTITY_MARKERS_V1 */\n    if (room.testMode && room.started) {\n        const wolves = room.players\n            .filter(p => p.role === \"Sói\")\n            .map(p => ({ id: p.id, name: p.name, alive: !!p.alive }));\n\n        for (const viewer of room.players.filter(p => !p.isBot && p.connected)) {\n            try {\n                io.to(viewer.id).emit(\"testWolfIdentityMarkers\", {\n                    isWolf: viewer.role === \"Sói\",\n                    wolves: viewer.role === \"Sói\" ? wolves : []\n                });\n            } catch (_) {}\n        }\n    }\n\n}`;

    if (!source.includes(oldBlock)) {
      throw new Error('[TEST WOLF MARKERS] Missing broadcastPlayers anchor');
    }
    source = source.replace(oldBlock, newBlock);
    return isBuffer ? Buffer.from(source, 'utf8') : source;
  } catch (err) {
    console.error('[TEST WOLF MARKERS PRELOAD]', err);
    throw err;
  }
};
