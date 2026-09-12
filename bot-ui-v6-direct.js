const http = require('http');
const fs = require('fs');
const path = require('path');

// Final safety layer for masoi-bot-ui.
// Keeps cache-busting local, injects final UI, speeds intro, and prevents UI flashing.
let FINAL_PATCH = '';
try {
  const src = fs.readFileSync(path.join(__dirname, 'bot-ui-final-v5.js'), 'utf8');
  const startMarker = 'const PATCH = String.raw`';
  const endMarker = '`;\n\nhttp.ServerResponse.prototype.end';
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (start >= 0 && end > start) {
    FINAL_PATCH = src.slice(start + startMarker.length, end);
    FINAL_PATCH = FINAL_PATCH
      .replace('},42);', '},12);')
      .replace('},1200);', '},300);')
      .replace(
        "introRunning=true;\n    overlay.classList.remove('hidden');",
        "introRunning=true;\n    try{\n      window.__masoiIntroNightMusic=true;\n      const a=document.getElementById('gameMusic');\n      const enabled=localStorage.getItem('masoi_sound_enabled')==='1';\n      if(a){\n        const nightSrc='https://masoi15.netlify.app/audio/night.mp3';\n        if(!String(a.src||'').includes('/audio/night.mp3')){\n          a.pause();\n          a.src=nightSrc;\n          a.currentTime=0;\n          a.load();\n        }\n        a.loop=true;\n        a.volume=.35;\n        if(enabled){const p=a.play();if(p&&p.catch)p.catch(()=>{});}\n      }\n    }catch(e){}\n    overlay.classList.remove('hidden');"
      );
  }
} catch (err) {
  console.error('[UI V6 DIRECT] patch read failed', err);
}

const STABILITY_PATCH = String.raw`
<style id="masoi-stability-fix-v1">
.testWolfPrivateMarker{display:none!important}
#gameScreen .player.msStableWolf .pname::before{
  content:"🐺";display:inline-block;margin-right:4px;font-size:13px;line-height:1;vertical-align:baseline;
}
#gameScreen .player,#gameScreen .player.actionable,#gameScreen .player.selected,#gameScreen .player.msStableVoteSelected{
  animation:none!important;transition:none!important;
}
#gameScreen .player.msStableVoteSelected{
  border-color:#ffd257!important;
  box-shadow:0 0 22px rgba(255,204,82,.18)!important;
  background:linear-gradient(145deg,rgba(54,43,34,.88),rgba(13,13,29,.96))!important;
}
</style>
<script id="masoi-stability-fix-v1-script">
(function(){
  let scheduled=false;
  let lastVoteName='';
  function cleanName(v){return String(v||'').replace(/🐺|🤖/g,'').replace(/\\s*[•·]\\s*(Bạn|Host)\\s*$/i,'').replace(/\\s+/g,' ').trim()}
  function getPhase(){try{return (typeof currentPhase!=='undefined'&&currentPhase)||room?.phase||''}catch(e){try{return room?.phase||''}catch(_){return ''}}}
  function cardName(card){const n=card&&card.querySelector('.pname');if(n)return cleanName(n.textContent);const a=String(card?.innerText||'').split(/\\n+/).map(cleanName).filter(Boolean);return a[0]||''}
  function getWolves(){try{if(sessionStorage.getItem('masoi_test_viewer_is_wolf')!=='1')return new Set();const a=JSON.parse(sessionStorage.getItem('masoi_test_wolf_names')||'[]');return new Set(Array.isArray(a)?a.map(cleanName).filter(Boolean):[])}catch(e){return new Set()}}
  function reconcile(){
    scheduled=false;
    const game=document.getElementById('gameScreen');if(!game)return;
    const wolves=getWolves(),p=getPhase();
    game.querySelectorAll('.player').forEach(card=>{
      const name=cardName(card);
      card.classList.toggle('msStableWolf',wolves.has(name));
      card.classList.toggle('msStableVoteSelected',p==='dayVote'&&!!lastVoteName&&name===lastVoteName);
    });
    if(p!=='dayVote')lastVoteName='';
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(reconcile)}
  document.addEventListener('click',e=>{if(getPhase()!=='dayVote')return;const c=e.target?.closest?.('#gameScreen .player');if(!c)return;const n=cardName(c);if(n){lastVoteName=n;schedule()}},true);
  const obs=new MutationObserver(schedule);
  function start(){const game=document.getElementById('gameScreen');if(game)obs.observe(game,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});schedule()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  setInterval(schedule,1000);
})();
</script>
`;

const originalCreateServer = http.createServer;
http.createServer = function patchedCreateServer(listener, ...rest) {
  if (typeof listener !== 'function') return originalCreateServer.call(http, listener, ...rest);
  return originalCreateServer.call(http, function wrappedListener(req, res) {
    try {
      const rawUrl = String(req.url || '/');
      if (/^\/(?:index\.html)?\?/.test(rawUrl)) req.url = rawUrl.startsWith('/index.html?') ? '/index.html' : '/';
      const rootRequest = req.url === '/' || req.url === '/index.html';
      if (rootRequest) {
        const originalEnd = res.end.bind(res);
        res.end = function directEnd(chunk, encoding, callback) {
          try {
            if (chunk && FINAL_PATCH) {
              let html = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);

              // Night 1: intro starts the night track. When the server changes phase from
              // intro -> night 1, keep that same playback running instead of restarting it.
              // Once music changes away from night 1, clear the guard. Night 2+ then use
              // the normal server-driven night music behavior.
              html = html.replace(
                "socket.on('musicChange',applyMusic);",
                "socket.on('musicChange',d=>{try{const n=Number((typeof nightNo!=='undefined'&&nightNo)||room?.nightNumber||0);if(window.__masoiIntroNightMusic&&d?.key==='night'&&n===1){pendingMusic=d;return;}if(window.__masoiIntroNightMusic&&d?.key!=='night')window.__masoiIntroNightMusic=false;}catch(e){}applyMusic(d)});"
              );

              if (/<\/body>/i.test(html) && !html.includes('masoi-final-v5-style')) html = html.replace(/<\/body>/i, FINAL_PATCH + '\n' + STABILITY_PATCH + '\n</body>');
              else if (/<\/body>/i.test(html) && !html.includes('masoi-stability-fix-v1')) html = html.replace(/<\/body>/i, STABILITY_PATCH + '\n</body>');
              chunk = html;
              try { res.removeHeader('content-length'); } catch (_) {}
              try { res.setHeader('x-masoi-ui-v6', 'direct-intro12-night1-continuous'); } catch (_) {}
              try { res.setHeader('cache-control', 'no-store, no-cache, must-revalidate, max-age=0'); } catch (_) {}
            }
          } catch (err) { console.error('[UI V6 DIRECT] response inject failed', err); }
          return originalEnd(chunk, encoding, callback);
        };
      }
    } catch (err) { console.error('[UI V6 DIRECT] request wrapper failed', err); }
    return listener(req, res);
  }, ...rest);
};

console.log('[UI V6 DIRECT] active:', !!FINAL_PATCH, 'bytes:', FINAL_PATCH.length, 'intro:12ms', 'night1:continuous-from-intro', 'stability:on');
