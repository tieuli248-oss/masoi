const fs = require('fs');
const path = require('path');

// Loaded after server-test-ai-groq-max.js. The max preload builds a block through
// String.raw, so normalize doubled escapes in that generated block before core compiles.
const previousReadFileSync = fs.readFileSync;

fs.readFileSync = function(file, ...args) {
    const result = previousReadFileSync.call(fs, file, ...args);
    try {
        if (path.basename(String(file)) !== 'server-core.js') return result;
        const isBuffer = Buffer.isBuffer(result);
        let source = isBuffer ? result.toString('utf8') : String(result);
        const marker = '/* TEST_AI_GROQ_MAX_V3';
        const start = source.indexOf(marker);
        if (start < 0) return result;
        const endMarker = '/* ========================================================== */';
        const end = source.indexOf(endMarker, start);
        if (end < 0) return result;
        let block = source.slice(start, end);
        block = block.split('\\\\').join('\\');
        source = source.slice(0, start) + block + source.slice(end);
        return isBuffer ? Buffer.from(source, 'utf8') : source;
    } catch (err) {
        console.error('[TEST GROQ ESCAPE FIX]', err);
        throw err;
    }
};
