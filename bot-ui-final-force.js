const http = require('http');
const fs = require('fs');
const path = require('path');

// Safety net for the test UI proxy: guarantee the approved final UI patch is
// present in every HTML response even if another preload wrapper bypasses it.
let patch = '';
try {
  const src = fs.readFileSync(path.join(__dirname, 'bot-ui-final-v5.js'), 'utf8');
  const startMarker = 'const PATCH = String.raw`';
  const endMarker = '`;\n\nhttp.ServerResponse.prototype.end';
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (start >= 0 && end > start) patch = src.slice(start + startMarker.length, end);
} catch (err) {
  console.error('[FINAL FORCE] cannot read v5 patch', err);
}

const previousEnd = http.ServerResponse.prototype.end;
http.ServerResponse.prototype.end = function(chunk, encoding, callback) {
  try {
    const type = String(this.getHeader?.('content-type') || '');
    if (patch && chunk && /text\/html/i.test(type)) {
      let html = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (!html.includes('masoi-final-v5-style')) {
        html = html.replace('</body>', patch + '\n</body>');
      }
      chunk = html;
      try { this.removeHeader?.('content-length'); } catch (_) {}
    }
  } catch (err) {
    console.error('[FINAL FORCE]', err);
  }
  return previousEnd.call(this, chunk, encoding, callback);
};

console.log('[FINAL FORCE] active:', !!patch);
