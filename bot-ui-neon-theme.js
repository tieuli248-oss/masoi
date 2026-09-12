const http = require('http');

// UI-only skin for masoi-bot-ui. This file intentionally changes only CSS.
// No Socket.IO events, game state, rules, timers, roles, or server logic are touched.
const previousEnd = http.ServerResponse.prototype.end;

const THEME = String.raw`
<style id="masoi-neon-moon-theme-v1">
:root{
  --ms-bg:#050713;
  --ms-bg2:#080b1d;
  --ms-panel:rgba(8,11,28,.86);
  --ms-panel2:rgba(13,16,38,.9);
  --ms-line:rgba(125,102,255,.48);
  --ms-line-soft:rgba(127,111,255,.24);
  --ms-purple:#7c5cff;
  --ms-violet:#a978ff;
  --ms-blue:#4c86ff;
  --ms-cyan:#59dcff;
  --ms-pink:#ff5ea8;
  --ms-red:#ff3f66;
  --ms-gold:#ffd257;
  --ms-green:#35e46f;
  --ms-text:#f7f5ff;
  --ms-muted:#9ea6c7;
  --ms-shadow:0 20px 60px rgba(0,0,0,.45);
}

html{background:var(--ms-bg)!important;scroll-behavior:smooth}
body{
  margin:0!important;
  color:var(--ms-text)!important;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important;
  min-height:100vh!important;
  background:
    radial-gradient(circle at 82% 5%,rgba(174,170,255,.20) 0 5%,rgba(93,74,190,.16) 6%,transparent 20%),
    radial-gradient(circle at 18% 34%,rgba(45,63,140,.22),transparent 30%),
    radial-gradient(circle at 76% 75%,rgba(85,42,150,.18),transparent 34%),
    linear-gradient(180deg,#050716 0%,#07091a 48%,#03040c 100%)!important;
  background-attachment:fixed!important;
  position:relative;
  isolation:isolate;
  overflow-x:hidden;
}
body:before{
  content:"";
  position:fixed;
  inset:0;
  z-index:-3;
  pointer-events:none;
  opacity:.82;
  background:
    radial-gradient(circle at 8% 12%,rgba(255,255,255,.5) 0 1px,transparent 1.8px),
    radial-gradient(circle at 18% 7%,rgba(255,255,255,.35) 0 1px,transparent 1.7px),
    radial-gradient(circle at 29% 16%,rgba(255,255,255,.32) 0 1px,transparent 1.8px),
    radial-gradient(circle at 43% 6%,rgba(255,255,255,.28) 0 1px,transparent 1.7px),
    radial-gradient(circle at 57% 14%,rgba(255,255,255,.36) 0 1px,transparent 1.8px),
    radial-gradient(circle at 68% 8%,rgba(255,255,255,.25) 0 1px,transparent 1.7px),
    radial-gradient(circle at 91% 16%,rgba(255,255,255,.32) 0 1px,transparent 1.8px),
    linear-gradient(180deg,transparent 0 66%,rgba(4,6,17,.3) 80%,rgba(1,2,8,.92) 100%);
}
body:after{
  content:"";
  position:fixed;
  top:28px;
  right:max(28px,6vw);
  width:clamp(95px,11vw,165px);
  aspect-ratio:1;
  border-radius:50%;
  z-index:-2;
  pointer-events:none;
  opacity:.34;
  background:
    radial-gradient(circle at 36% 32%,rgba(255,255,255,.95),rgba(218,220,255,.82) 33%,rgba(150,158,225,.7) 56%,rgba(90,82,171,.5) 69%,transparent 71%);
  filter:drop-shadow(0 0 28px rgba(144,137,255,.6)) drop-shadow(0 0 70px rgba(108,82,225,.35));
}

*{scrollbar-width:thin;scrollbar-color:#6555d3 rgba(6,8,21,.8)}
*::-webkit-scrollbar{width:9px;height:9px}
*::-webkit-scrollbar-track{background:rgba(6,8,21,.7);border-radius:99px}
*::-webkit-scrollbar-thumb{background:linear-gradient(#745eff,#4b43a6);border-radius:99px;border:2px solid rgba(5,7,18,.8)}

.wrap{
  width:min(1240px,94%)!important;
  margin:auto!important;
  padding:22px 0 36px!important;
  position:relative;
  z-index:1;
}
.header{
  text-align:left!important;
  margin:8px 0 22px!important;
  min-height:78px;
  display:flex;
  flex-direction:column;
  justify-content:center;
  position:relative;
  padding-left:74px;
}
.header:before{
  content:"🐺";
  position:absolute;
  left:0;
  top:50%;
  transform:translateY(-50%);
  font-size:48px;
  filter:drop-shadow(0 0 14px rgba(131,97,255,.8));
}
.header h1{
  margin:0!important;
  font-family:Georgia,"Times New Roman",serif!important;
  font-size:clamp(34px,4.1vw,56px)!important;
  font-weight:800!important;
  letter-spacing:.5px!important;
  line-height:1!important;
  color:#fbf9ff!important;
  text-shadow:0 0 8px rgba(255,255,255,.18),0 0 22px rgba(127,90,255,.6),0 3px 16px rgba(0,0,0,.7)!important;
}
.header #connectionText{
  margin-top:8px!important;
  color:#aab2cf!important;
  font-size:13px!important;
  font-weight:700!important;
  letter-spacing:.25px;
}
.header #connectionText:before{content:"● ";color:#38e668;text-shadow:0 0 10px rgba(56,230,104,.9)}

.card,.statusBox,.modalBox,.winBox,.witchSaveBox,.hunterBox,.hunterPublicBox{
  background:
    linear-gradient(160deg,rgba(18,21,49,.92),rgba(7,9,24,.91))!important;
  border:1px solid var(--ms-line)!important;
  border-radius:20px!important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.045),
    0 0 0 1px rgba(37,29,93,.22),
    0 16px 45px rgba(0,0,0,.34),
    0 0 28px rgba(91,68,220,.09)!important;
  backdrop-filter:blur(16px) saturate(125%);
  -webkit-backdrop-filter:blur(16px) saturate(125%);
}
.card{padding:17px!important;margin-bottom:14px!important}
.card:hover{border-color:rgba(144,116,255,.58)!important}
.title{
  color:#f4f2ff!important;
  font-size:17px!important;
  font-weight:900!important;
  letter-spacing:.15px;
  text-shadow:0 0 16px rgba(130,100,255,.25);
}
.muted{color:var(--ms-muted)!important}
.notice{
  padding:10px 12px!important;
  border-radius:12px!important;
  border:1px solid rgba(117,109,187,.23)!important;
  background:linear-gradient(90deg,rgba(9,12,31,.84),rgba(14,17,39,.72))!important;
  color:#c1c7e1!important;
}
.big{color:#fff!important;text-shadow:0 0 18px rgba(112,97,255,.25)}

.input,select.input,textarea.input{
  min-height:44px;
  background:rgba(5,8,22,.88)!important;
  border:1px solid rgba(112,107,178,.46)!important;
  border-radius:12px!important;
  color:#f8f7ff!important;
  outline:none!important;
  transition:border-color .16s ease,box-shadow .16s ease,background .16s ease!important;
}
.input::placeholder{color:#777f9e!important}
.input:focus{
  border-color:#7e67ff!important;
  box-shadow:0 0 0 3px rgba(114,87,255,.12),0 0 18px rgba(114,87,255,.14)!important;
  background:rgba(8,11,29,.96)!important;
}

.btn{
  border:1px solid rgba(142,135,210,.26)!important;
  border-radius:12px!important;
  min-height:44px;
  background:linear-gradient(180deg,#252943,#15192f)!important;
  color:#f7f6ff!important;
  font-weight:900!important;
  box-shadow:inset 0 1px rgba(255,255,255,.06),0 8px 18px rgba(0,0,0,.18)!important;
  transition:transform .14s ease,filter .14s ease,box-shadow .14s ease!important;
}
.btn:not(:disabled):hover{transform:translateY(-1px);filter:brightness(1.10);box-shadow:0 10px 22px rgba(0,0,0,.28),0 0 20px rgba(113,82,255,.16)!important}
.btn.blue{background:linear-gradient(135deg,#6148e9,#3427bd)!important;border-color:#8d7cff!important;box-shadow:0 8px 22px rgba(76,57,210,.28)!important}
.btn.green{background:linear-gradient(135deg,#24a865,#137449)!important;border-color:#4cdb8a!important}
.btn.red{background:linear-gradient(135deg,#d82650,#8d1538)!important;border-color:#ff5277!important;box-shadow:0 8px 22px rgba(164,26,65,.24)!important}
.btn.orange{background:linear-gradient(135deg,#d9791c,#8f4510)!important;border-color:#f2a25a!important}
.btn.purple{background:linear-gradient(135deg,#8a54f4,#5630b8)!important;border-color:#aa83ff!important}

.soundToggle{
  width:42px!important;height:42px!important;
  border-radius:13px!important;
  top:14px!important;left:14px!important;
  background:rgba(9,11,30,.9)!important;
  border:1px solid rgba(131,111,255,.54)!important;
  box-shadow:0 0 20px rgba(95,72,229,.22)!important;
}

/* Join screen */
#joinScreen:not(.hidden){display:flex!important;align-items:center;justify-content:center;min-height:calc(100vh - 145px)}
#joinScreen>.card{
  width:min(480px,100%)!important;
  max-width:480px!important;
  margin:24px auto 70px!important;
  padding:26px!important;
  border-color:rgba(141,113,255,.62)!important;
  box-shadow:0 24px 70px rgba(0,0,0,.5),0 0 45px rgba(92,68,224,.16)!important;
}
#joinScreen>.card:before{
  content:"🌙  BƯỚC VÀO NGÔI LÀNG";
  display:block;
  color:#9f91ff;
  font-size:11px;
  letter-spacing:2.1px;
  font-weight:1000;
  margin-bottom:9px;
}
#joinScreen .title{font-size:26px!important;margin-bottom:18px!important}
#joinBtn{margin-top:12px!important}

/* Lobby screen */
#lobbyScreen:not(.hidden){
  display:grid!important;
  grid-template-columns:minmax(290px,.72fr) minmax(0,1.28fr)!important;
  gap:14px!important;
  align-items:start;
}
#lobbyScreen>.card{margin:0!important}
#lobbyScreen>.card:nth-child(1){grid-column:1;grid-row:1}
#lobbyScreen>.card:nth-child(2){grid-column:1;grid-row:2}
#lobbyScreen>.card:nth-child(3){grid-column:1;grid-row:3 / span 2}
#lobbyScreen>.card:nth-child(4){grid-column:2;grid-row:1}
#lobbyScreen>.card:nth-child(5){grid-column:2;grid-row:2}
#lobbyScreen>.card:nth-child(6){grid-column:2;grid-row:3 / span 2}
#lobbyScreen>#testModeCard{grid-column:1 / -1!important;grid-row:auto!important;margin-top:0!important}
#playerCount{font-size:38px!important;color:#8fdcff!important;text-shadow:0 0 22px rgba(78,170,255,.35)!important}

/* Game top status row */
#gameScreen .grid3{gap:14px!important}
#gameScreen .statusBox{
  min-height:114px;
  display:flex;
  flex-direction:column;
  justify-content:center;
  padding:18px 20px!important;
  overflow:hidden;
  position:relative;
}
#gameScreen .statusBox:after{
  content:"";position:absolute;inset:auto -30px -45px auto;width:130px;height:130px;border-radius:50%;filter:blur(1px);opacity:.17;pointer-events:none
}
#gameScreen .statusBox:nth-child(1){border-color:rgba(255,203,75,.58)!important;box-shadow:inset 0 1px rgba(255,255,255,.04),0 0 28px rgba(255,193,66,.08)!important}
#gameScreen .statusBox:nth-child(1):after{background:radial-gradient(circle,#ffd257,transparent 68%)}
#gameScreen .statusBox:nth-child(2){border-color:rgba(91,119,255,.7)!important;box-shadow:inset 0 1px rgba(255,255,255,.04),0 0 30px rgba(71,79,255,.13)!important}
#gameScreen .statusBox:nth-child(2):after{background:radial-gradient(circle,#6457ff,transparent 68%)}
#gameScreen .statusBox:nth-child(3){border-color:rgba(255,87,161,.6)!important;box-shadow:inset 0 1px rgba(255,255,255,.04),0 0 30px rgba(255,65,145,.1)!important}
#gameScreen .statusBox:nth-child(3):after{background:radial-gradient(circle,#ff4e9d,transparent 68%)}
#phaseName{font-size:26px!important;color:#fff5d7!important;text-shadow:0 0 16px rgba(255,200,82,.32)!important}
#timer{font-size:48px!important;color:#fff!important;line-height:1!important;text-shadow:0 0 13px rgba(136,120,255,.75),0 0 34px rgba(87,67,255,.34)!important}
#roleName{font-size:25px!important;color:#fff0f7!important;text-shadow:0 0 17px rgba(255,80,153,.34)!important}

/* Role chips */
.roleComposition{gap:9px!important}
.roleChip{
  background:linear-gradient(180deg,rgba(14,18,42,.92),rgba(7,9,24,.92))!important;
  border:1px solid rgba(121,111,190,.5)!important;
  border-radius:999px!important;
  padding:8px 12px!important;
  color:#f2f1ff!important;
  box-shadow:inset 0 1px rgba(255,255,255,.04)!important;
}
.roleChip:first-child{border-color:rgba(237,70,111,.5)!important;color:#ffd8e2!important}

/* Main in-game layout */
#gameScreen .mainGrid{
  grid-template-columns:minmax(0,1.35fr) minmax(330px,.85fr)!important;
  gap:14px!important;
  align-items:start;
}
#playerActionCard,#gameChatCard{min-height:100%}
#playerActionCard>.title,#gameChatCard>.title{font-size:19px!important}
.players{gap:10px!important;grid-template-columns:repeat(auto-fill,minmax(185px,1fr))!important}
.player{
  background:linear-gradient(145deg,rgba(16,20,45,.96),rgba(8,10,27,.96))!important;
  border:1px solid rgba(95,105,169,.42)!important;
  border-radius:13px!important;
  padding:12px!important;
  min-height:68px;
  position:relative;
  box-shadow:inset 0 1px rgba(255,255,255,.035),0 7px 18px rgba(0,0,0,.17)!important;
  transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease,opacity .14s ease!important;
}
.player:hover{transform:translateY(-1px);border-color:rgba(125,112,225,.62)!important}
.player.me{
  border-color:#4e9cff!important;
  box-shadow:0 0 0 1px rgba(65,137,255,.16),0 0 23px rgba(60,118,255,.18),inset 0 1px rgba(255,255,255,.06)!important;
}
.player.actionable{cursor:pointer!important}
.player.actionable:hover{border-color:#846cff!important;box-shadow:0 0 22px rgba(112,78,255,.18)!important}
.player.selected{border-color:#ffd257!important;box-shadow:0 0 22px rgba(255,204,82,.18)!important;background:linear-gradient(145deg,rgba(54,43,34,.88),rgba(13,13,29,.96))!important}
.player.dead{opacity:.48!important;filter:saturate(.45)}
.pname{font-size:14px!important;font-weight:900!important;color:#fbfaff!important}
.pmeta{color:#9da6c7!important;font-size:11px!important}

/* Chat and event stream */
#gameChatCard{border-color:rgba(113,95,236,.58)!important}
#chatPhaseTitle,.chatCommonTitle{
  color:#f7f3ff!important;
  font-weight:1000!important;
  letter-spacing:.25px;
  text-shadow:0 0 14px rgba(125,95,255,.26);
}
#chatTitle{font-size:18px!important}
.chatBox,.logBox{
  background:linear-gradient(180deg,rgba(3,5,16,.84),rgba(6,8,22,.92))!important;
  border:1px solid rgba(93,100,158,.36)!important;
  border-radius:14px!important;
  padding:12px!important;
  box-shadow:inset 0 10px 30px rgba(0,0,0,.16)!important;
}
#chatBox{height:310px!important}
#lobbyChatBox{height:290px!important}
#eventLog{height:165px!important}
.msgLine{padding:7px 8px!important;margin:0 0 3px!important;border-radius:9px!important;line-height:1.4!important}
.msgLine:hover{background:rgba(100,88,180,.07)!important}
.who{color:#f7f5ff!important;font-weight:1000!important}
.msgLine.wolf .who{color:#ff657e!important}
.msgLine.couple,.msgLine.couple .who{color:#ff6e8d!important}
.historySection{background:rgba(103,84,186,.12)!important;border-color:rgba(119,100,219,.28)!important;color:#cfc6ff!important}
.chatModes{gap:7px!important}
.modeBtn{border-radius:10px!important}
.modeBtn.active{outline:none!important;border-color:#8c77ff!important;box-shadow:0 0 0 2px rgba(108,82,255,.17)!important}

/* Test controls follow the same visual language */
#testModeCard{
  background:linear-gradient(160deg,rgba(17,13,42,.94),rgba(8,9,25,.93))!important;
  border-color:rgba(155,104,255,.62)!important;
  box-shadow:0 0 34px rgba(111,66,228,.11),0 18px 45px rgba(0,0,0,.3)!important;
}
#testShowAllWrap{background:rgba(84,65,157,.12)!important;border-color:rgba(151,119,255,.28)!important}
#testHumanRoleList .testHumanRoleRow{background:rgba(7,9,24,.5)!important;border-color:rgba(112,101,174,.24)!important}

/* Modal polish */
.modal,.winModal,.witchSaveModal,.hunterModal,.hunterPublicModal{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.modal{background:rgba(2,3,11,.82)!important}
.modalBox,.winBox,.witchSaveBox,.hunterBox,.hunterPublicBox{border-color:rgba(136,109,255,.63)!important;box-shadow:0 25px 90px rgba(0,0,0,.65),0 0 45px rgba(92,66,225,.15)!important}
.toast{background:rgba(11,14,34,.96)!important;border:1px solid rgba(129,106,255,.6)!important;color:#fff!important;box-shadow:0 12px 38px rgba(0,0,0,.4),0 0 25px rgba(105,74,245,.15)!important}

/* Admin stays functional but visually consistent */
#adminModal .modalBox,#adminLoginModal .modalBox{background:linear-gradient(160deg,#10142e,#080b1d)!important}
.adminTable td,.adminTable th{border-color:rgba(101,107,166,.23)!important}

/* Small decorative glows */
#gameScreen>.card:first-of-type,#lobbyScreen>.card:first-child{position:relative;overflow:hidden}
#gameScreen>.card:first-of-type:after,#lobbyScreen>.card:first-child:after{
  content:"";position:absolute;width:180px;height:180px;border-radius:50%;right:-80px;bottom:-115px;background:radial-gradient(circle,rgba(112,77,255,.24),transparent 68%);pointer-events:none
}

@media(max-width:900px){
  body:after{width:95px;right:18px;top:38px;opacity:.2}
  .wrap{width:min(96%,760px)!important;padding-top:14px!important}
  .header{padding-left:56px;min-height:68px;margin-bottom:15px!important}
  .header:before{font-size:38px}
  .header h1{font-size:35px!important}
  #lobbyScreen:not(.hidden){grid-template-columns:1fr!important}
  #lobbyScreen>.card,#lobbyScreen>#testModeCard{grid-column:1!important;grid-row:auto!important}
  #gameScreen .grid3,#gameScreen .mainGrid{grid-template-columns:1fr!important}
  #gameScreen .statusBox{min-height:88px}
  #gameScreen .mainGrid{gap:12px!important}
  #chatBox{height:260px!important}
  .players{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}

@media(max-width:540px){
  body:after{display:none}
  .wrap{width:94%!important;padding-bottom:26px!important}
  .header{padding-left:45px;min-height:55px;margin-bottom:12px!important}
  .header:before{font-size:30px}
  .header h1{font-size:29px!important}
  .header #connectionText{font-size:11px!important;margin-top:6px!important}
  .card{padding:13px!important;border-radius:16px!important}
  #joinScreen:not(.hidden){min-height:calc(100vh - 110px)}
  #joinScreen>.card{padding:19px!important;margin-bottom:30px!important}
  #gameScreen .grid3{gap:9px!important}
  #gameScreen .statusBox{min-height:82px;padding:13px 15px!important;border-radius:16px!important}
  #phaseName,#roleName{font-size:20px!important}
  #timer{font-size:37px!important}
  .players{grid-template-columns:1fr 1fr!important;gap:8px!important}
  .player{padding:10px!important;min-height:62px}
  .pname{font-size:13px!important}
  .pmeta{font-size:10px!important}
  .roleChip{font-size:11px!important;padding:7px 9px!important}
  #chatBox{height:235px!important}
  #eventLog{height:135px!important}
  .btn{min-height:42px;padding:9px 11px!important}
}

@media(max-width:380px){
  .players{grid-template-columns:1fr!important}
}
</style>
`;

http.ServerResponse.prototype.end = function(chunk, encoding, cb){
  try{
    if(typeof chunk === 'string' && chunk.includes('</head>') && chunk.includes('Ma Sói')){
      chunk = chunk.replace('</head>', THEME + '\n</head>');
    }
  }catch(e){}
  return previousEnd.call(this, chunk, encoding, cb);
};
