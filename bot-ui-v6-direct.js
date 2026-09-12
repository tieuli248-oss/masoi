const http = require('http');
const fs = require('fs');
const path = require('path');

// Final safety layer for masoi-bot-ui.
// 1) Keeps cache-busting query strings on the bot-ui service instead of redirecting to production.
// 2) Injects the approved V5 UI payload directly into the root HTML response.
let FINAL_PATCH = '';
try {
  const src = fs.readFileSync(path.join(__dirname, 'bot-ui-final-v5.js'), 'utf8');
  const startMarker = 'const PATCH = String.raw`';
  const endMarker = '`;\n\nhttp.ServerResponse.prototype.end';
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (start >= 0 && end > start) {
    FINAL_PATCH = src.slice(start + startMarker.length, end);

    // Faster pre-game typewriter: 42ms/char -> 20ms/char,
    // and shorten the pause after the final character: 1200ms -> 500ms.
    // The server still waits for testIntroComplete before starting the game timer.
    FINAL_PATCH = FINAL_PATCH
      .replace('},42);', '},20);')
      .replace('},1200);', '},500);');
  }
} catch (err) {
  console.error('[UI V6 DIRECT] patch read failed', err);
}

const originalCreateServer = http.createServer;
http.createServer = function patchedCreateServer(listener, ...rest) {
  if (typeof listener !== 'function') return originalCreateServer.call(http, listener, ...rest);

  return originalCreateServer.call(http, function wrappedListener(req, res) {
    try {
      // The old proxy redirected /?v=... to production. Keep root cache-busters local.
      const rawUrl = String(req.url || '/');
      if (/^\/(?:index\.html)?\?/.test(rawUrl)) {
        req.url = rawUrl.startsWith('/index.html?') ? '/index.html' : '/';
      }

      const rootRequest = req.url === '/' || req.url === '/index.html';
      if (rootRequest) {
        const originalEnd = res.end.bind(res);
        res.end = function directEnd(chunk, encoding, callback) {
          try {
            if (chunk && FINAL_PATCH) {
              let html = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
              if (/<\/body>/i.test(html) && !html.includes('masoi-final-v5-style')) {
                html = html.replace(/<\/body>/i, FINAL_PATCH + '\n</body>');
              }
              chunk = html;
              try { res.removeHeader('content-length'); } catch (_) {}
              try { res.setHeader('x-masoi-ui-v6', 'direct-fast-intro'); } catch (_) {}
              try { res.setHeader('cache-control', 'no-store, no-cache, must-revalidate, max-age=0'); } catch (_) {}
            }
          } catch (err) {
            console.error('[UI V6 DIRECT] response inject failed', err);
          }
          return originalEnd(chunk, encoding, callback);
        };
      }
    } catch (err) {
      console.error('[UI V6 DIRECT] request wrapper failed', err);
    }

    return listener(req, res);
  }, ...rest);
};

console.log('[UI V6 DIRECT] active:', !!FINAL_PATCH, 'bytes:', FINAL_PATCH.length, 'intro:20ms');
