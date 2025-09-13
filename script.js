/** =====================
 *  ユーティリティ
 *  ===================== */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const logBox = $('#logBox');
function log(msg){
  const t = new Date();
  const hh = String(t.getHours()).padStart(2,'0');
  const mm = String(t.getMinutes()).padStart(2,'0');
  const ss = String(t.getSeconds()).padStart(2,'0');
  const line = document.createElement('div');
  line.textContent = `[${hh}:${mm}:${ss}] ${msg}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}
function saveText(filename, text, mime){
  const type = mime || (/\.json$/i.test(filename) ? 'application/json' : 'text/plain');
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function saveJson(filename, obj){
  saveText(filename, JSON.stringify(obj, null, 2), 'application/json');
}

function pad3(n){ return String(n).padStart(3,'0'); }
function randomSeed(){ return Math.floor(Math.random()*1e9); }

const CARD_IMG_CACHE = {};               // cardNo → 解決済み画像URLをキャッシュ
const CARD_IMG_EXT_ORDER = ['jpg','png','webp','jpeg']; // 実ファイルに合わせて順序調整
function resolveCardImage(cardNo){
  // 既に確定済みなら即返す
  if (CARD_IMG_CACHE[cardNo]) return Promise.resolve(CARD_IMG_CACHE[cardNo]);

  const candidates = CARD_IMG_EXT_ORDER.map(ext => `images/${cardNo}.${ext}`);
  return new Promise((resolve, reject)=>{
    (function tryNext(i){
      if (i >= candidates.length) return reject(new Error('not found'));
      const test = new Image();
      test.onload = ()=>{ CARD_IMG_CACHE[cardNo] = candidates[i]; resolve(candidates[i]); };
      test.onerror = ()=> tryNext(i+1);
      test.src = candidates[i];
    })(0);
  });
}

// === Images picker support ===
const IMG_EXTS = ["png", "jpg", "jpeg", "webp", "gif"];

const imageStore = {
  // "picker": フォルダ選択, "auto": ./images 推定
  source: "auto",
  map: new Map(),       // key: 拡張子抜きのベース名（例: "ACG-001", "Back", "token"）
  hasAny: false,
  hasDefaultDir: false, // ./images が存在するかの簡易プローブ
};

// UI要素を取る（overlay内）
const btnPickImages   = document.getElementById("btnPickImages");
const imagesDirInput  = document.getElementById("imagesDirInput");
const imagesStatus    = document.getElementById("imagesStatus");

// 画像の存在チェック（Image オブジェクトで軽量確認）
function imageExists(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url + ((url.includes("?") ? "&" : "?") + "t=" + Date.now());
  });
}

// ./images に「Back.*」or「token.*」があるかを簡易検出（起動時に一度だけ）
async function probeDefaultImages() {
  for (const base of ["Back", "token"]) {
    for (const ext of IMG_EXTS) {
      if (await imageExists(`./images/${base}.${ext}`)) {
        imageStore.hasDefaultDir = true;
        updateImagesStatus(true);
        return true;
      }
    }
  }
  imageStore.hasDefaultDir = false;
  updateImagesStatus(false);
  return false;
}

function updateImagesStatus(ok) {
  // ok===true なら強制的に非表示。そうでなければ imageStore の状態で判定
  const hide = ok === true || imageStore.hasAny || imageStore.hasDefaultDir;
  imagesStatus?.classList.toggle("hidden", hide);
}

function setCardImage(imgEl, base) {
  const candidates = [];

  // 1) 選択フォルダ由来（即URL完成：ObjectURL）
  const picked = pickFromSelectedFolder(base);
  if (picked) candidates.push(picked);

  // 2) 既定 ./images の拡張子総当たり（img.onerror で順送り）
  for (const ext of IMG_EXTS) {
    candidates.push(`./images/${base}.${ext}`);
  }

  // 順に試す
  trySetImgSequential(imgEl, candidates);
}

function pickFromSelectedFolder(base) {
  // 完全一致 → 大文字・小文字ゆらぎを軽く吸収
  if (imageStore.map.has(base)) return imageStore.map.get(base);
  const lower = base.toLowerCase();
  const upper = base.toUpperCase();
  for (const k of [lower, upper]) {
    if (imageStore.map.has(k)) return imageStore.map.get(k);
  }
  return null;
}

function trySetImgSequential(imgEl, urls) {
  let i = 0;
  const tryNext = () => {
    if (i >= urls.length) {
      // 全滅：src消去＆エラーメッセージ表示
      imgEl.removeAttribute("src");
      updateImagesStatus(false);
      return;
    }
    const url = urls[i++];
    imgEl.onerror = () => tryNext();
    imgEl.onload  = () => updateImagesStatus(true);
    imgEl.src = url;
  };
  tryNext();
}

/* ── p1p1 カウンターを “+2/+2” “-1/-1” 形式に整形 ──────────── */
function fmtP1P1(n){
  const sign = n > 0 ? '+' : '';         // 正ならプラス記号、負ならそのまま
  return `${sign}${n}/${sign}${n}`;
}

/* ── [+1] カウンターを “[+3]” 形式に整形 ───────────────── */
function fmtPlus1(n){
  const sign = n > 0 ? '+' : '';         // 負はめったに使わないが一応対応
  return `[${sign}${n}]`;
}

function wakeAllTerritory(){
  for(const c of ZONES.T_FIELD){
    c.faceUp = true;
    c.rot = 0;
  }
  log('領地のカードを起床');  // ← 後述の“名前表示ログ”対応済みlog
  renderZone('T_FIELD', $('#territory'), {row:true});
}
$('#btnWakeTerritory1')?.addEventListener('click', wakeAllTerritory);
$('#btnWakeTerritory2')?.addEventListener('click', wakeAllTerritory);

let CARD_W = 92, CARD_H = 132;
function applySquareBox(el){
  const side = CARD_H; // ← 常に「h」を一辺に
  el.style.width  = side + 'px';
  el.style.height = side + 'px';

  // 画像の実寸（縦向き基準）で中央配置
  const wrap = el.querySelector('.imgWrap');
  if (wrap){
    wrap.style.position = 'absolute';
    wrap.style.width  = CARD_W + 'px';
    wrap.style.height = CARD_H + 'px';
    wrap.style.left   = '50%';
    wrap.style.top    = '50%';
    wrap.style.transform = 'translate(-50%, -50%)';
    // 中の <img> は width:100%; height:100% でOK（歪まず等倍）
    const img = wrap.querySelector('img');
    if (img){
      img.style.width  = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain'; // 念のため（歪み防止）
    }
  }
}
function applyRotation(cardEl, rot){
  cardEl.style.setProperty('--rot', (((rot%360)+360)%360) + 'deg');
}
function refreshCardMetrics(){
  const cs = getComputedStyle(document.documentElement);
  const w = parseInt(cs.getPropertyValue('--card-w')) || 92;
  const h = parseInt(cs.getPropertyValue('--card-h')) || Math.round(w*132/92);
  CARD_W = w; CARD_H = h;
}
window.addEventListener('resize', ()=>{ refreshCardMetrics(); renderAll(); });
document.addEventListener('DOMContentLoaded', ()=>{ refreshCardMetrics(); });


function displayName(card){
  // c.name を最優先。なければ CARD_DB を引き、最後に cardNo をフォールバック
  if(card?.name) return card.name;
  const db = CARD_DB?.[card.cardNo];
  return (db && (db.名前 || db.name)) || card.cardNo || 'UNKNOWN';
}
/** =====================
 *  データと状態
 *  ===================== */
let CARD_DB = {}; // カードナンバー→情報
let CARD_BACKS = ['png','jpg','jpeg','webp'].map(ext=>`./images/Back.${ext}`);
let SEED = randomSeed();
let INITIAL_RETURN_LEFT = 0; // 初期2枚戻しの残回数

const ZONES = {
  DECK: [], HAND: [], BATTLEFIELD: [], GRAVE: [], BANISH: [], FREE: [],
  T_DECK: [], T_FIELD: []
};

const allowedMoves = {
  DECK:        ['HAND','BATTLEFIELD','GRAVE','BANISH','FREE'],
  HAND:        ['BATTLEFIELD','GRAVE','BANISH','DECK','FREE'],
  BATTLEFIELD: ['HAND','GRAVE','BANISH','FREE', 'DECK'],
  GRAVE:       ['HAND','DECK','BANISH','FREE','BATTLEFIELD'], 
  BANISH:      ['HAND','GRAVE','DECK','FREE','BATTLEFIELD'],   
  T_DECK:      ['T_FIELD','FREE','GRAVE','BANISH'],
  T_FIELD:     ['GRAVE','BANISH','FREE','T_DECK'],
  FREE:        ['HAND','BATTLEFIELD','GRAVE','BANISH','DECK']
};

let selectedUID = null;
// ★ ダブルクリック判定の猶予（ミリ秒）を好きに設定
const DBLCLICK_MS = 280;

// DOM 準備後に初期化（既存の起動処理にぶら下げてOK）
document.addEventListener("DOMContentLoaded", () => {
  // 1) デフォルト ./images 存在確認
  probeDefaultImages();

  // 2) フォルダ選択 UI
  btnPickImages?.addEventListener("click", () => imagesDirInput?.click());

  imagesDirInput?.addEventListener("change", (e) => {
    // 既存の ObjectURL を掃除
    for (const url of imageStore.map.values()) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
    imageStore.map.clear();

    const files = Array.from(e.target.files || []);
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      const nameNoExt = f.name.replace(/\.[^.]+$/, "");
      // ベース名（拡張子なし） → ObjectURL
      imageStore.map.set(nameNoExt, URL.createObjectURL(f));
    }
    imageStore.source = "picker";
    imageStore.hasAny = imageStore.map.size > 0;
    updateImagesStatus();
  });
});

// ===== Recording / Replay: CLEAN SINGLE IMPLEMENTATION =====

// --- Globals ---
let isRecording = false;          // recording flag
let RECORDED_INIT = null;         // initial snapshot at record start
let ACTION_LOG = [];              // action list
let RECORD_SUSPEND = 0;           // reentrancy guard (disable logging during replay)

const replay = { idx:0, timer:null, rate:1, isPlaying:false };

// --- Utils (assumes $ and $$ helpers exist in your file) ---
function snapshotState(){
  const snap = {};
  for(const z of Object.keys(ZONES)){
    snap[z] = ZONES[z].map(c=>({
      uid:c.uid, cardNo:c.cardNo, name:c.name,
      zone:z, isToken:!!c.isToken,
      faceUp:!!c.faceUp, rot:c.rot|0,
      counters: {...(c.counters||{})}
    }));
  }
  return snap;
}
function restoreState(snap){
  for(const z of Object.keys(ZONES)) ZONES[z].length = 0;
  let max = 0;
  for(const z of Object.keys(snap)){
    for(const s of snap[z]){
      const c = createCardInstance(s.cardNo, z, true, {name:s.name, isToken:s.isToken});
      c.uid = s.uid; c.faceUp = s.faceUp; c.rot = s.rot|0; c.counters = {...(s.counters||{})};
      ZONES[z].push(c);
      const n = +String(c.uid).replace(/[^\d]/g,'') || 0; if(n>max) max = n;
    }
  }
  if(typeof uidCounter!=='undefined') uidCounter = Math.max(uidCounter, max);
  renderAll();
}

function pushAction(type, payload){
  if(!isRecording || RECORD_SUSPEND>0) return;
  if(!RECORDED_INIT) RECORDED_INIT = snapshotState();
  ACTION_LOG.push({ type, ...payload, t: Date.now() });
}
function withRecordSuspended(fn){
  RECORD_SUSPEND++; try{ return fn(); } finally{ RECORD_SUSPEND--; }
}

// --- Wrap mutating functions to log actions ---
const _origMove = moveCardTo;
moveCardTo = function(uid, to){
  const c = findCard(uid); const from = c?.zone;
  const rv = _origMove(uid, to);
  if(c) pushAction('move', { uid, from, to });
  return rv;
};

const _origFace = toggleFace;
toggleFace = function(uid){
  _origFace(uid);
  const c = findCard(uid); if(c) pushAction('face', { uid, faceUp:c.faceUp });
};

const _origTap = toggleTap;
toggleTap = function(uid, deg=90){
  _origTap(uid, deg);
  const c = findCard(uid); if(c) pushAction('tap', { uid, rot:c.rot|0 });
};

const _origCtr = setCounter;
setCounter = function(uid, typ, val){
  _origCtr(uid, typ, val);
  pushAction('ctr', { uid, typ, val });
};

const _origDraw = drawFromMain;
drawFromMain = function(){
  const top = ZONES.DECK[0];
  const rv = _origDraw();
  if(top){ const c = findCard(top.uid); if(c) pushAction('move', { uid:c.uid, from:'DECK', to:'HAND' }); }
  return rv;
};

const _origDrawT = (typeof drawFromTDeck==='function') ? drawFromTDeck : null;
if(_origDrawT){
  drawFromTDeck = function(){
    const top = ZONES.T_DECK[0];
    const rv = _origDrawT();
    if(top){ const c = findCard(top.uid); if(c) pushAction('move', { uid:c.uid, from:'T_DECK', to:'T_FIELD' }); }
    return rv;
  };
}

if(typeof createToken === 'function'){
  const _origToken = createToken;
  createToken = function(){
    const c = _origToken();
    if(c) pushAction('token', { uid:c.uid, zone:c.zone||'FREE' });
    return c;
  };
}

// --- Save / Load ---
function saveReplayJson(){
  const data = { init: RECORDED_INIT || snapshotState(), actions: ACTION_LOG };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'acg_replay.json'; a.click();
  URL.revokeObjectURL(a.href);
}

function loadReplayJson(obj){
  RECORDED_INIT = obj.init; ACTION_LOG = obj.actions || [];
  replay.idx = 0; replay.rate = 1; replay.isPlaying = false;
  const seek = document.getElementById('replaySeek');
  const stat = document.getElementById('replayStatus');
  if(seek){ seek.max = ACTION_LOG.length; seek.value = 0; }
  if(stat){ stat.textContent = `0 / ${ACTION_LOG.length}`; }
  gotoIndex(0); // show initial position immediately
}

// --- Apply / Seek / Play ---
function applyAction(a){
  if(!a) return;
  withRecordSuspended(()=>{
    switch(a.type){
      case 'move':  _origMove(a.uid, a.to); break;
      case 'face':  { const c=findCard(a.uid); if(c){ c.faceUp=a.faceUp; renderAll(); } } break;
      case 'tap':   { const c=findCard(a.uid); if(c){ c.rot=a.rot|0; renderAll(); } } break;
      case 'ctr':   _origCtr(a.uid, a.typ, a.val); break;
      case 'token': { if(typeof createToken==='function'){ const t = createToken(); if(t){ t.uid=a.uid; renderAll(); } } } break;
      case 'shuffle': {
        const zone = a.zone, arr = ZONES[zone];
        if(arr && a.order?.length===arr.length){
          const map = Object.fromEntries(arr.map(c=>[c.uid, c]));
          ZONES[zone] = a.order.map(uid=>map[uid]).filter(Boolean);
          renderAll();
        }
        break;
      }
    }
  });
}

function gotoIndex(n){
  n = Math.max(0, Math.min(n, ACTION_LOG.length));
  withRecordSuspended(()=> restoreState(RECORDED_INIT) );
  for(let i=0;i<n;i++) applyAction(ACTION_LOG[i]);
  replay.idx = n;
  const seek = document.getElementById('replaySeek');
  const stat = document.getElementById('replayStatus');
  if(seek) seek.value = n;
  if(stat) stat.textContent = `${n} / ${ACTION_LOG.length}`;
}

function playStep(){
  if(replay.idx >= ACTION_LOG.length){ replay.isPlaying=false; replay.timer=null; return; }
  applyAction(ACTION_LOG[replay.idx++]);
  const seek = document.getElementById('replaySeek');
  const stat = document.getElementById('replayStatus');
  if(seek) seek.value = replay.idx;
  if(stat) stat.textContent = `${replay.idx} / ${ACTION_LOG.length}`;
  replay.timer = setTimeout(playStep, 500 / replay.rate);
}

// --- UI wiring ---
function toggleRecording(){
  const btn = document.getElementById('btnRecord');
  isRecording = !isRecording;
  if(isRecording){
    ACTION_LOG = [];
    RECORDED_INIT = snapshotState();
    if(btn){ btn.textContent = '■ 記録停止'; btn.classList.add('recording'); }
    log('記録を開始しました');
  }else{
    if(btn){ btn.textContent = '● 記録開始'; btn.classList.remove('recording'); }
    saveReplayJson();
    log('記録を停止して JSON を保存しました');
  }
}

document.getElementById('btnRecord')?.addEventListener('click', toggleRecording);

document.getElementById('btnReplay')?.addEventListener('click', ()=>{
  document.getElementById('replayPanel')?.classList.toggle('hidden');
});
document.getElementById('btnReplayClose')?.addEventListener('click', ()=>{
  document.getElementById('replayPanel')?.classList.add('hidden');
});

document.getElementById('btnReplayOpen')?.addEventListener('click', ()=> document.getElementById('replayFile')?.click());
document.getElementById('replayFile')?.addEventListener('change', (e)=>{
  const f = e.target.files?.[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ev => { try{ loadReplayJson(JSON.parse(ev.target.result)); } catch(err){ alert('JSON読込失敗: '+err.message); } };
  r.readAsText(f, 'UTF-8');
});

document.getElementById('btnPlay')?.addEventListener('click', ()=>{
  if(!RECORDED_INIT){ alert('先にログ(JSON)を読み込むか、記録を停止して保存してください'); return; }
  if(replay.isPlaying) return;
  gotoIndex(0);
  replay.isPlaying = true; playStep();
});

document.getElementById('btnPause')?.addEventListener('click', ()=>{
  replay.isPlaying = false; if(replay.timer){ clearTimeout(replay.timer); replay.timer=null; }
});

document.getElementById('btnStepNext')?.addEventListener('click', ()=>{
  replay.isPlaying = false; if(replay.timer){ clearTimeout(replay.timer); replay.timer=null; }
  if(replay.idx < ACTION_LOG.length){ applyAction(ACTION_LOG[replay.idx++]); }
  const seek = document.getElementById('replaySeek');
  const stat = document.getElementById('replayStatus');
  if(seek) seek.value = replay.idx; if(stat) stat.textContent = `${replay.idx} / ${ACTION_LOG.length}`;
});

document.getElementById('btnStepPrev')?.addEventListener('click', ()=>{
  replay.isPlaying = false; if(replay.timer){ clearTimeout(replay.timer); replay.timer=null; }
  gotoIndex(Math.max(0, replay.idx-1));
});

document.getElementById('replaySeek')?.addEventListener('input', (e)=>{
  const n = +e.target.value|0; gotoIndex(n);
});

document.querySelectorAll('.rate[data-rate]')?.forEach(b=>{
  b.addEventListener('click', ()=>{
    replay.rate = parseFloat(b.dataset.rate||'1')||1;
    document.querySelectorAll('.rate[data-rate]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  });
});


// ===== UI =====
// 進捗HUD
function updateReplayHUD(){
  $('#replaySeek').max = ACTION_LOG.length;
  $('#replaySeek').value = replay.idx;
  $('#replayStatus').textContent = `${replay.idx}/${ACTION_LOG.length}`;
}

// ▷ ↔ ▮▮ トグル
$('#btnPlayToggle')?.addEventListener('click', ()=>{
  if(!RECORDED_INIT){
    alert('先にログ(JSON)を読み込むか、記録を停止して保存してください');
    return;
  }
  if(replay.isPlaying){
    replay.isPlaying = false;
    if(replay.timer){ clearTimeout(replay.timer); replay.timer=null; }
    $('#btnPlayToggle').textContent = '▷';
  }else{
    replay.isPlaying = true;
    $('#btnPlayToggle').textContent = '▮';
    playStep();
  }
});

$('#btnStepNext')?.addEventListener('click', ()=>{
  replay.isPlaying=false; if(replay.timer){ clearTimeout(replay.timer); replay.timer=null; }
  if(replay.idx < ACTION_LOG.length){ applyAction(ACTION_LOG[replay.idx++]); }
  updateReplayHUD();
});
$('#btnStepPrev')?.addEventListener('click', ()=>{
  replay.isPlaying=false; if(replay.timer){ clearTimeout(replay.timer); replay.timer=null; }
  gotoIndex(Math.max(0, replay.idx-1));
  updateReplayHUD();
});
$('#replaySeek')?.addEventListener('input', e=>{
  const n = +e.target.value|0;
  replay.isPlaying=false; if(replay.timer){ clearTimeout(replay.timer); replay.timer=null; }
  gotoIndex(n);
  updateReplayHUD();
});

// リプレイパネルのドラッグ化
(function enableReplayDrag(){
  const panel = document.getElementById('replayPanel');
  if(!panel) return;
  let sx=0, sy=0, left=0, top=0, dragging=false;

  // ヘッダー行をハンドルに
  const handle = panel.querySelector('.row');
  (handle||panel).style.cursor = 'move';

  (handle||panel).addEventListener('mousedown', (e)=>{
    dragging = true;
    const r = panel.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY;
    left = r.left; top = r.top;
    panel.style.right = 'auto'; // 左上原点で動かすため
    panel.style.bottom = 'auto';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{
    if(!dragging) return;
    const nx = left + (e.clientX - sx);
    const ny = top  + (e.clientY - sy);
    panel.style.left = Math.max(0, nx) + 'px';
    panel.style.top  = Math.max(0, ny) + 'px';
  });
  window.addEventListener('mouseup', ()=> dragging=false);
})();

// ===== Recording / Replay: END =====

/** =====================
 *  画像解決（拡張子フォールバック）
 *  ===================== */
function imageSrcForCardNo(cardNo){
  if(cardNo === 'TOKEN'){
    return ['./images/token.png','./images/token.jpg','./images/token.jpeg','./images/token.webp'];
  }
  const base = './images/' + cardNo;
  return IMG_EXTS.map(ext => `${base}.${ext}`);
}

/** =====================
 *  ID→カードナンバー変換
 *  ===================== */
function idToCardNoMain(id){
  if(id === 9028) return 'BP1-080'; // 特例
  if(1 <= id && id <= 164) return 'ACG-' + pad3(id);
  if(5001 <= id && id <= 5079) return 'BP1-' + pad3(id - 5000);
  if(5101 <= id && id <= 5180) return 'BP2-' + pad3(id - 5100);
  console.warn('未知のmainDeck ID', id);
  return 'ACG-' + pad3(id);
}
function idToCardNoTerr(id){
  if(8001 <= id && id <= 8018) return 'RYO-' + pad3(id - 8000);
  console.warn('未知のterritoryDeck ID', id);
  return 'RYO-' + pad3(id - 8000);
}

/** =====================
 *  カード生成 / レンダリング
 *  ===================== */
let uidCounter = 0;
function makeUID(){ return 'c' + (++uidCounter) + '_' + Math.random().toString(36).slice(2,7); }

function createCardInstance(cardNo, srcZone, faceUp=true, extra={}){
  const info = CARD_DB[cardNo] || null;
  return {
    uid: makeUID(),
    cardNo,
    name: info ? info['カード名'] : cardNo,
    faceUp: !!faceUp,
    rot: 0,
    counters: { p1p1:0, plus1:0 },
    zone: srcZone,
    isToken: (cardNo === 'TOKEN'),
    ...extra
  };
}

function createToken(){
  const c = createCardInstance('TOKEN', 'FREE', true, {isToken:true, name:'トークン'});
  ZONES.FREE.push(c); 
  renderAll(); 
  log('トークンを生成');
  return c;
}

function renderAll(){
  renderZone('FREE', $('#zone-free .content'));
  renderZone('BATTLEFIELD', $('#battlefield'));
  renderZone('HAND', $('#hand'), {row:true});
  renderZone('DECK', $('#mainDeck'), {row:true, faceDown:false});
  renderZone('T_FIELD', $('#territory'), {row:true});
  renderZone('T_DECK', $('#tDeck'), {row:true, faceDown:false});
  renderZone('GRAVE', $('#grave'), {column:true});
  renderZone('BANISH', $('#banish'), {column:true});
  $('#deckCountChip').textContent = '基礎デッキ: ' + ZONES.DECK.length;
  $('#tDeckCountChip').textContent = '領土デッキ: ' + ZONES.T_DECK.length;
  updateDeckTitleCounts();
}


// ★ 見出しに「基礎デッキ：n」「領土：n」を出す
function updateDeckTitleCounts(){
  // 基礎デッキゾーン
  const h3Main = document.querySelector('.zone[data-zone="DECK"] > h3');
  if(h3Main){
    // h3の先頭テキストだけ差し替え（toolbarは保持）
    const tb = h3Main.querySelector('.toolbar');
    const label = '基礎デッキ：' + ZONES.DECK.length + ' ';
    const textNode = Array.from(h3Main.childNodes).find(n=>n.nodeType===Node.TEXT_NODE);
    if(textNode){ textNode.textContent = label; }
    else{ h3Main.insertBefore(document.createTextNode(label), tb || null); }
  }
  // 領土デッキ（「領土：10」を表示）
  const h3TerrDeck = document.querySelector('.zone[data-zone="T_DECK"] > h3');
  if(h3TerrDeck){
    h3TerrDeck.textContent = '領土：' + ZONES.T_DECK.length;
  }
}

function cardElement(card){
  const el = document.createElement('div');
  el.className = 'card' + (card.faceUp ? '' : ' face-down');
  el.dataset.uid = card.uid;
  el.draggable = true;
  // イメージ
  const w = document.createElement('div'); w.className = 'imgWrap';
  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';
  const srcs = card.faceUp ? imageSrcForCardNo(card.cardNo) : CARD_BACKS;
  if (card.faceUp) {
  setCardImage(img, card.cardNo);
} else {
  setCardImage(img, 'Back');
}
  img.dataset.alts = JSON.stringify(srcs.slice(1));
  img.onload  = function(){
    // 小サムネの成功URLをプレビュー側キャッシュへ学習
    CARD_IMG_CACHE[card.cardNo] = this.src;
  };
  img.onerror = function onerr(){
    try{
      const remain = JSON.parse(this.dataset.alts || '[]');
      if(remain.length){
        const nx = remain.shift();
        this.src = nx;
        this.dataset.alts = JSON.stringify(remain);
      }else{
        this.onerror = null;
      }
    }catch(e){ this.onerror = null; }
  };
  w.appendChild(img);
  el.appendChild(w);
  // 名前バー（表の時のみ）
  if(card.faceUp){
    const bar = document.createElement('div');
    bar.className = 'nameBar';
    bar.textContent = card.name || card.cardNo;
    el.appendChild(bar);
  }
  // カウンターバッジ
  if(card.counters.p1p1 !== 0 || card.counters.plus1 !== 0){
    const ctrs = document.createElement('div');
    ctrs.className = 'ctrBadges';
    if(card.counters.p1p1 !== 0){
      const c = document.createElement('span'); c.className='ctr';
      c.textContent = fmtP1P1(card.counters.p1p1);
      c.title = 'クリックで調整';
      c.onclick = (ev)=>{ ev.stopPropagation(); showCtrMenu(card.uid, 'p1p1', c); };
      ctrs.appendChild(c);
    }
    if(card.counters.plus1 !== 0){
      const c = document.createElement('span'); c.className='ctr plus1';
      c.textContent = fmtPlus1(card.counters.plus1);
      c.title = 'クリックで調整';
      c.onclick = (ev)=>{ ev.stopPropagation(); showCtrMenu(card.uid, 'plus1', c); };
      ctrs.appendChild(c);
    }
    el.appendChild(ctrs);
  }
  // 回転
  el.style.transform = `rotate(${card.rot}deg)`;
  applySquareBox(el);

 {
  let lastClickTS = 0;
  let singleTimer = null;

  el.addEventListener('click', (e)=>{
    // 左クリックのみ / 修飾キー付きは無視
    if (e.button !== 0) return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

    const now = e.timeStamp;
    // 直前クリックからDBLCLICK_MS以内なら“ダブルクリック”
    if (now - lastClickTS <= DBLCLICK_MS){
      lastClickTS = 0;
      if (singleTimer){ clearTimeout(singleTimer); singleTimer = null; }

      // ★ ダブルクリックの挙動（必要に応じて変更）
      if(card.zone==='BATTLEFIELD' || card.zone==='T_FIELD'){
        toggleTap(card.uid, 90);
      }
      return;
    }
    // ここから“単クリック”のディレイ（DBLCLICK_MS待って確定）
    lastClickTS = now;
    if (singleTimer){ clearTimeout(singleTimer); }
    singleTimer = setTimeout(()=>{
      // ★ 単クリック：選択トグル（同じカードなら解除）
      // el を渡して、その場で accent を付け外し（再描画待ちにしない）
      const accentTarget = el.querySelector('.imgWrap') || el;
      selectCard(card.uid, accentTarget);
      singleTimer = null;
    }, DBLCLICK_MS + 10);
  });
}

  el.addEventListener('contextmenu', (e)=>{ // 右クリックで表裏
    e.preventDefault();
    toggleFace(card.uid);
  });
  el.addEventListener('dragstart', (e)=>{
    if(selectedUID !== card.uid){ // 選択中のみドラッグ可（仕様）→ ただしUXのため選択してからドラッグ開始
      selectCard(card.uid);
    }
    e.dataTransfer.setData('text/plain', card.uid);
  });
  return el;
}

function showCtrMenu(uid, typ, anchorEl){
  const menu = document.createElement('div');
  menu.className = 'ctrMenu';
  const up = document.createElement('button'); up.className='btn sm'; up.textContent='▲';
  const dn = document.createElement('button'); dn.className='btn sm'; dn.textContent='▼';
  const rm = document.createElement('button'); rm.className='btn sm warn'; rm.textContent='×';
  up.onclick = ()=>{ adjustCounter(uid, typ, +1); menu.remove(); };
  dn.onclick = ()=>{ adjustCounter(uid, typ, -1); menu.remove(); };
  rm.onclick = ()=>{ setCounter(uid, typ, 0); menu.remove(); };
  menu.append(up,dn,rm);
  anchorEl.parentElement.appendChild(menu);
  setTimeout(()=>document.addEventListener('click', ()=>menu.remove(), {once:true}), 0);
}

function adjustCounter(uid, typ, delta){
  const card = findCard(uid);
  if(!card) return;
  card.counters[typ] = Math.max(0, (card.counters[typ]||0)+delta);
  renderAll();
}
function setCounter(uid, typ, val){
  const card = findCard(uid);
  if(!card) return;
  card.counters[typ] = Math.max(0, val|0);
  renderAll();
}

/** 汎用：縦に5枚ずつ積んで、6枚目は右の新しい列へ（オーバーラップは任意） */
function renderPileColumns(container, cards, {maxPerCol=5, colGap=12, overlap=0, startX=0}={}){
  // ステップ計算（overlap=0.3 なら 70%刻み、0なら等間隔=カード高）
  const stepY = Math.round(CARD_H * (1 - overlap));
  // クリア
  container.innerHTML = '';
  container.classList.remove('hrow');
  container.classList.add('pileCols');

  let maxRowsThisZone = 0;
  for(let i=0;i<cards.length;i++){
    const r = i % maxPerCol;                 // 0..4
    const c = Math.floor(i / maxPerCol);     // 列 index
    const el = cardElement(cards[i]);
    if(selectedUID === cards[i].uid) el.classList.add('selected');
    el.style.left = (startX + c*(CARD_W + colGap)) + 'px';
    el.style.top  = (r * stepY) + 'px';
    el.style.zIndex = String(i + 1);
    container.appendChild(el);
    if(r+1 > maxRowsThisZone) maxRowsThisZone = r+1;
  }

  // このゾーンの“必要高さ”と“必要幅”を返す（FREE拡張用）
  const rows = Math.max(1, Math.min(maxPerCol, maxRowsThisZone));
  const usedHeight = rows * (CARD_H * (1 - overlap)) + (CARD_H * overlap); 
  const usedCols   = Math.max(1, Math.ceil(cards.length / maxPerCol));
  const usedWidth  = usedCols * CARD_W + (usedCols - 1) * colGap + startX;
  // container は墓地/除外ゾーンの列ラッパ（.pileCols 要素）
  container.style.height = Math.max(CARD_H, usedHeight) + 'px';
  container.style.minHeight = CARD_H + 'px';
  return { usedHeight, usedWidth, rows, usedCols, stepY };
}

function renderZone(zoneName, container, opt={}){
  if(zoneName === 'DECK'){
    container.classList.add('deckStrip');
  }else if(zoneName === 'T_DECK'){
    container.classList.add('tdeckStrip');
  }else{
    container.classList.remove('deckStrip','tdeckStrip');
    container.classList.remove('deckStrip','tdeckStrip','handStrip');
  } 
  // 並び替えオプション
  container.innerHTML='';
  let arr = ZONES[zoneName];
  
  // （任意のソート：トグルがONなら並べ替え）
  if(zoneName==='HAND' && $('#sortHand')?.checked){
    arr = [...arr].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  }
  if(zoneName==='T_FIELD' && $('#sortTerritory')?.checked){
    arr = [...arr].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  }

  // 1) 横並び：戦場/手札/領地
  if(zoneName==='BATTLEFIELD' || zoneName==='HAND' || zoneName==='T_FIELD'){
    container.classList.remove('pileCols');     // 保険：縦積みクラスを外す
    container.classList.add('hrow');
    if (zoneName === 'HAND') container.classList.add('handStrip');
    else container.classList.remove('handStrip');

    container.innerHTML = '';
    for(const c of arr){
      const el = cardElement(c);
     if(selectedUID === c.uid){
       (el.querySelector('.imgWrap') || el).classList.add('selected');
     }
      container.appendChild(el);
    }
    return; // 横並びはここで終了
  }

    // =========================
  // 2) 縦5枚ずつ → 右に列追加：墓地/除外/フリー
  // =========================
  if(zoneName==='GRAVE' || zoneName==='BANISH' || zoneName==='FREE'){
    // FREE だけは欄を縦に拡張したい → overlapはお好みで
    const overlap = (zoneName==='FREE') ? 0.40 : 0.40; // 必要なら 0 にすれば重なり無
    const { usedHeight, usedWidth } =
      renderPileColumns(container, arr, {maxPerCol:5, overlap, colGap:12});

    // 幅は念のため最小幅をセット（横スクロールに頼らない）
    container.style.minWidth = usedWidth + 'px';

    // FREE は“縦スクロールではなく欄自体を拡張”する
    if(zoneName==='FREE'){
      const zoneEl   = container.closest('.zone');          // FREEの親セクション
      const headerH  = zoneEl?.querySelector('h3')?.offsetHeight || 0;
      const padding  = 16;                                  // ゾーン内余白の概算
      const totalH   = headerH + usedHeight + padding;

      // 左ペインの1段目の行高をダイナミックに変更
      // （CSSの .leftpane で grid-template-rows:minmax(132px, var(--left-free-row, auto)) にしてある前提）
      document.documentElement.style.setProperty('--left-free-row', totalH + 'px');

      // コンテンツ自身の高さも更新（見た目のズレを抑える）
      container.style.height = usedHeight + 'px';
      // FREEはoverflowを出さない
      container.style.overflow = 'visible';
    }else{
      // 墓地/除外は必要なら固定高さ（重なりを崩さない）
      container.style.height = usedHeight + 'px';
    }
    return;
  }

  // =========================
  // 3) その他（デッキ帯など）の既存描画
  // =========================
  container.classList.remove('hrow','pileCols');
  container.innerHTML = '';
  for(const c of arr){
    const el = cardElement(c);
   if(selectedUID === c.uid){
     (el.querySelector('.imgWrap') || el).classList.add('selected');
   }
    container.appendChild(el);
  }
}

/** =====================
 *  選択・操作
 *  ===================== */
function findCard(uid){
  for(const z in ZONES){
    const i = ZONES[z].findIndex(c=>c.uid===uid);
    if(i>=0) return ZONES[z][i];
  }
  return null;
}
function removeCard(uid){
  for(const z in ZONES){
    const i = ZONES[z].findIndex(c=>c.uid===uid);
    if(i>=0) return ZONES[z].splice(i,1)[0];
  }
  return null;
}
function clearSelection(){
  document.querySelectorAll('.imgWrap.accent').forEach(el=> el.classList.remove('selected'));
  selectedUID = null;
  if (typeof updatePreview === 'function') updatePreview(null);
}
function selectCard(uid, el){
  if(selectedUID === uid){
    // もう一度同じカードをクリック → 解除
    el?.classList.remove('selected');
    selectedUID = null;
    if (typeof updatePreview === 'function') updatePreview(null);
    return;
  }
  document.querySelectorAll('.imgWrap.selected')
    .forEach(n => n.classList.remove('selected'));

  clearSelection();
  selectedUID = uid;
  el?.classList.add('selected');
  if (typeof updatePreview === 'function') updatePreview(uid);
}
function updatePreview(uid, opts ={}){
  const card = findCard(uid);
  const big = $('#bigImg'), title=$('#infoTitle'), kv=$('#infoKV'), txt=$('#infoText');
  
  if(!card){
    big.src='';
    if (big) delete big.dataset.cardNo; // ← 未選択時は記録も消す
    title.textContent='（カード未選択）'; 
    kv.innerHTML=''; 
    txt.innerHTML='';
    return;
  }

  // ★ 同じカードを表示中で、画像を触る必要がないときは張り替えない
  const sameCardShown = big?.dataset.cardNo === card.cardNo;
  const touchImage = opts.forceImage || !sameCardShown;
  if (touchImage && big) {
    big.dataset.cardNo = card.cardNo;
    big.crossOrigin = 'anonymous';
    setCardImage(big, card.cardNo);
  }

  title.textContent = `${card.name || card.cardNo}（${card.cardNo}）`;
  const info = CARD_DB[card.cardNo];
  kv.innerHTML='';
  if(info){
    const tags = [];
    if(info['条件']) tags.push('条件:'+info['条件']);
    if(typeof info['コスト']!=='undefined' && info['コスト']!=='') tags.push('コスト:'+info['コスト']);
    if(info['タイプ']) tags.push('タイプ:'+info['タイプ']);
    if(info['種族']) tags.push('種族:'+info['種族']);
    for(const t of tags){
      const el=document.createElement('span'); el.className='tag'; el.textContent=t; kv.appendChild(el);
    }
    const atk = info['ATK'], def = info['DEF'];
    let html = '';
    if(atk!=null || def!=null){
    html += `<div class="stats"><b>ATK:</b> ${atk ?? '-'} / <b>DEF:</b> ${def ?? '-'}</div>`;
    }

    // 能力
    const kws = info['キーワード能力']||[];
    const ab = info['能力']||[];
    if(kws.length){ html += '<div><b>キーワード能力:</b> '+kws.join(' / ')+'</div>'; }
    if(ab.length){
      html += '<div style="margin-top:2px"><b>能力:</b><ol style="margin:4px 0 0 0px;padding-left: 30px;padding-right: 5px; padding-bottom :20px;font-size: 14px">';
      for(const a of ab){
        const t = a['テキスト']||'';
        html += '<li>'+escapeHtml(t)+'</li>';
      }
      html += '</ol></div>';
    }
    txt.innerHTML = html || '<span class="muted">（情報なし）</span>';
  }else{
    kv.innerHTML=''; 
    txt.innerHTML='<span class="muted">（カードリスト未登録）</span>';
  }
}

function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function toggleFace(uid){
  const c = findCard(uid); if(!c) return;
  c.faceUp = !c.faceUp;
  log(`${displayName(c)} を${c.faceUp?'表':'裏'}に`);
  renderAll(); updatePreview(uid);
}
function toggleTap(uid){
  const c = findCard(uid);
  if(!c) return;

  /* 0°／180°（縦）なら +90°、90°／270°（横）なら -90° */
  if(c.rot % 180 === 0){
    c.rot = (c.rot + 90) % 360;          // 縦 → 横
  }else{
    c.rot = (c.rot + 270) % 360;         // 横 → 縦（= -90°）
  }

  log(`${displayName(c)} を回転 (${c.rot}°)`);
  const el = document.querySelector(`.card[data-uid="${uid}"]`);
  if (el) applySquareBox(el);

  renderAll();
}

/** =====================
 *  ドラッグ＆ドロップ / ゾーン移動
 *  ===================== */
function onDragOver(ev){ ev.preventDefault(); }
function onDrop(ev){
  ev.preventDefault();
  const uid = ev.dataTransfer.getData('text/plain');
  
  const fromAttr = ev.currentTarget.getAttribute('data-zone');
  const fromSection = ev.currentTarget.closest('.zone')?.getAttribute('data-zone');
  const fromId = ev.currentTarget.id;

  const targetZone = fromAttr || fromSection || fromId;
  moveCardTo(uid, targetZone);
}

function moveCardTo(uid, newZone){
  const c = removeCard(uid);
  if(!c) return;
  const from = c.zone;
  const to = newZone;
  if(!allowedMoves[from] || !allowedMoves[from].includes(to)){
    log(`[無効] ${from}→${to} は移動不可`);
    // 元に戻す
    ZONES[from].push(c);
    renderAll();
    return;
  }
  // HAND→DECK の初期2枚戻し判定（ボトムへ）
  if(from==='HAND' && to==='DECK' && INITIAL_RETURN_LEFT>0){
    INITIAL_RETURN_LEFT--;
    $('#initReturnLeft').textContent = INITIAL_RETURN_LEFT;
    if(INITIAL_RETURN_LEFT<=0) $('#initReturn').classList.add('hidden');
    c.zone = to;
    ZONES[to].push(c); // ボトムへ
    log(`${displayName(c)} を手札→デッキ（ボトム）。初期戻し残 ${INITIAL_RETURN_LEFT}`);
  }else{
    // 通常はトップに積む（DECK/T_DECK に戻すとき）
    c.zone = to;
    // ★ 戦場から上記ゾーンへ移す時は回転をリセット
    if(from==='BATTLEFIELD' && to !=='BATTLEFIELD'){
      c.rot = 0;
      c.faceUp = true;
    }
    if(to==='DECK' || to==='T_DECK'){
      ZONES[to].unshift(c); // トップへ
    }else{
      ZONES[to].push(c);
    }
    log(`${displayName(c)} を ${from} → ${to}`);
  }
  renderAll();
  updatePreview(uid);
}

/** =====================
 *  デッキ操作
 *  ===================== */
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function drawFromMain(){
  if(ZONES.DECK.length===0){ log('デッキ切れ'); return; }
  const c = ZONES.DECK.shift();
  c.zone='HAND'; c.faceUp=true;
  ZONES.HAND.push(c);
  log(`${displayName(c)} をドロー`);
  renderAll();
}
function drawFromTDeck(){
  if(ZONES.T_DECK.length===0){ log('領土デッキ切れ'); return; }
  const c = ZONES.T_DECK.shift();
  c.zone='T_FIELD'; c.faceUp=true;
  ZONES.T_FIELD.push(c);
  log(`${displayName(c)} を領土へ補充`);
  renderAll();
}
function initDraw7(){
  if(ZONES.HAND.length>0){
    if(!confirm('手札をデッキへ戻してシャッフルしてから7枚ドローしますか？')) return;
    // 手札→デッキ（トップに積む→後でシャッフル）
    while(ZONES.HAND.length){
      const c = ZONES.HAND.pop();
      c.zone='DECK'; c.faceUp=true; c.rot=0;
      ZONES.DECK.unshift(c);
    }
  }
  shuffle(ZONES.DECK);
  shuffle(ZONES.T_DECK);
  renderAll();
  for(let i=0;i<7;i++) drawFromMain();
  INITIAL_RETURN_LEFT = 2;
  $('#initReturn').classList.remove('hidden');
  $('#initReturnLeft').textContent = INITIAL_RETURN_LEFT;
}

function resetBoardAndDraw7(){
  // トークンを消し、その他は対応デッキへ戻す
  function flushZone(fromArr, to){
    for(let i=fromArr.length-1;i>=0;i--){
      const c = fromArr[i];
      if(c.isToken){ fromArr.splice(i,1); continue; } // トークンは消える
      c.rot=0; c.faceUp=true;
      if(c.counters){ c.counters.p1p1 = 0; c.counters.plus1 = 0; } // ★ カウンターをリセット
      c.zone = to;
      if(to==='DECK' || to==='T_DECK') ZONES[to].push(c); else ZONES[to].unshift(c);
      fromArr.splice(i,1);
    }
  }
  flushZone(ZONES.HAND, 'DECK');
  flushZone(ZONES.BATTLEFIELD, 'DECK');
  flushZone(ZONES.GRAVE, 'DECK');
  flushZone(ZONES.BANISH, 'DECK');
  // 領土/T_FIELDはT_DECKへ、FREEは非領土ならDECK, 領土ならT_DECK
  for(const arrName of ['T_FIELD','FREE']){
    for(let i=ZONES[arrName].length-1;i>=0;i--){
      const c = ZONES[arrName][i];
      if(c.isToken){ ZONES[arrName].splice(i,1); continue; }
      c.rot=0; c.faceUp=true;
      if(c.counters){ c.counters.p1p1 = 0; c.counters.plus1 = 0; } // ★ カウンターをリセット
      // 領土カード判定
      const isTerr = String(c.cardNo).startsWith('RYO-');
      c.zone = isTerr ? 'T_DECK' : 'DECK';
      ZONES[c.zone].push(c);
      ZONES[arrName].splice(i,1);
    }
  }
  // シャッフルして7枚
  shuffle(ZONES.DECK);
  shuffle(ZONES.T_DECK);
  renderAll();
  for(let i=0;i<7;i++) drawFromMain();
  INITIAL_RETURN_LEFT = 2;
  $('#initReturn').classList.remove('hidden');
  $('#initReturnLeft').textContent = INITIAL_RETURN_LEFT;
  log('盤面リセット&7枚ドロー');
}

/** =====================
 *  状態保存/読込・スクショ
 *  ===================== */
function degToRad(d) { return (d * Math.PI) / 180; }

function exportState(){
  const data = {
    seed: SEED,
    initialReturnLeft: INITIAL_RETURN_LEFT,
    zones: Object.fromEntries(Object.entries(ZONES).map(([k,arr])=>[k, arr.map(c=>({
      uid:c.uid, cardNo:c.cardNo, name:c.name, faceUp:c.faceUp, rot:c.rot, counters:c.counters, isToken:c.isToken
    }))]))
  };
  saveText('acg_state.json', JSON.stringify(data, null, 2));
}
function importState(file){
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const data = JSON.parse(r.result);
      SEED = data.seed || randomSeed();
      INITIAL_RETURN_LEFT = data.initialReturnLeft||0;
      for(const k in ZONES) ZONES[k] = [];
      for(const [k,arr] of Object.entries(data.zones||{})){
        ZONES[k] = (arr||[]).map(o=>({uid:o.uid||makeUID(), cardNo:o.cardNo, name:o.name, faceUp:!!o.faceUp, rot:o.rot|0, counters:o.counters||{p1p1:0,plus1:0}, zone:k, isToken:!!o.isToken}));
      }
      $('#initReturn').classList.toggle('hidden', INITIAL_RETURN_LEFT<=0);
      $('#initReturnLeft').textContent = INITIAL_RETURN_LEFT;
      renderAll();
      log('状態を読み込みました');
    }catch(e){
      alert('読込に失敗しました: '+e.message);
    }
  };
  r.readAsText(file);
}
// スクショ
 async function takeScreenshot(){
   const root = document.documentElement;                 // ★ ページ全体
   if (!window.html2canvas) {
     alert('html2canvas が読み込めませんでした。オンラインで再試行してください。');
     return;
   }
   // ページ全体の実寸
  const w = Math.max(root.scrollWidth, document.body.scrollWidth, window.innerWidth);
  const h = Math.max(root.scrollHeight, document.body.scrollHeight, window.innerHeight);
 
  // CSS変数からカード基準サイズを取得（正方形の一辺＝CARD_H）
  const cs = getComputedStyle(root);
  const CARD_W = parseInt(cs.getPropertyValue('--card-w')) || 92;
  const CARD_H = parseInt(cs.getPropertyValue('--card-h')) || Math.round(CARD_W*132/92);

   const canvas = await html2canvas(root, {
     backgroundColor: '#0f1216',
     scale: 2,
     useCORS: true,
     allowTaint: false,
     imageTimeout: 15000,
     windowWidth:  w,
     windowHeight: h,
     scrollX: 0,
     scrollY: 0,
     onclone: (doc) => {
       // 撮影時だけ内部スクロール領域を全展開
       doc.querySelectorAll('.wrap, .leftpane, .rightpane, main, .content, #infoText, #logBox')
         .forEach(el => {
           el.style.height   = 'auto';
           el.style.maxHeight = 'none';
           el.style.overflow  = 'visible';
        // 行の高さが落ちないよう最低高さをカード一辺分確保
        if (el.classList.contains('hrow') ||
            el.classList.contains('handStrip') ||
            el.classList.contains('deckStrip') ||
            el.classList.contains('tdeckStrip')) {
          el.style.minHeight = CARD_H + 'px';
            }           
         });
      // 2) カードと画像の箱もクリッピング無効（回転×中央寄せ対策）
      doc.querySelectorAll('.card, .imgWrap').forEach(el => {
        el.style.overflow = 'visible';
      });
       // （任意）デバッグ：撮影時に当たり枠を出す
       doc.querySelectorAll('.imgWrap').forEach(el=>{
         el.style.outline = '1px dashed rgba(255,0,0,.4)';
       });
     }
   });
 


   canvas.toBlob((blob) => {
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = 'acg_board.png';
     a.click();
     URL.revokeObjectURL(url);
   });
 }

/** =====================
 *  初期セットアップ（読込/検証）
 *  ===================== */
const overlay = $('#overlay');
const startBtn = $('#startBtn');
let loadedDeckData = null;

async function tryLoadDefaultCardList(){
  try{
    const res = await fetch('./card_list.json', {cache:'no-cache'});
    if(!res.ok) throw 0;
    const arr = await res.json();
    CARD_DB = {};
    for(const it of arr){ CARD_DB[it['カードナンバー']] = it; }
    $('#cardListStatus').textContent = '自動読込済み';
    $('#cardListStatus').classList.remove('danger');
  }catch(_){
    // 失敗時は何もしない（手動ボタンで読ませる）
  }
}
// 起動時に“静かに”試す
document.addEventListener('DOMContentLoaded', tryLoadDefaultCardList);

function validateDeck(deck){
  const mainCount = Object.entries(deck.mainDeck||{}).reduce((s,[id,c])=>s+(c|0),0);
  const terrCount = Object.entries(deck.territoryDeck||{}).reduce((s,[id,c])=>s+(c|0),0);
  const errs = [];
  if(mainCount < 40) errs.push('基礎デッキが40枚未満です ('+mainCount+')');
  if(terrCount > 10) errs.push('領土デッキが10枚を超えています ('+terrCount+')');
  return errs;
}

function buildInitialZones(deck){
  // クリア
  for(const k in ZONES) ZONES[k] = [];
  // main
  for(const [idStr, count] of Object.entries(deck.mainDeck||{})){
    const id = parseInt(idStr,10);
    const cardNo = idToCardNoMain(id);
    for(let i=0;i<(count|0);i++){
      ZONES.DECK.push( createCardInstance(cardNo, 'DECK', true) );
    }
  }
  // territory
  for(const [idStr, count] of Object.entries(deck.territoryDeck||{})){
    const id = parseInt(idStr,10);
    const cardNo = idToCardNoTerr(id);
    for(let i=0;i<(count|0);i++){
      ZONES.T_DECK.push( createCardInstance(cardNo, 'T_DECK', true) );
    }
  }
  // reserve は今回は読み込むだけ（表示しない）
  // シャッフルはユーザ操作に任せる
  renderAll();
}

function openFilePicker(accept, cb){
  const inp = document.createElement('input');
  inp.type='file'; inp.accept=accept;
  inp.onchange = ()=>{ if(inp.files && inp.files[0]) cb(inp.files[0]); };
  inp.click();
}

$('#pickDeckBtn').onclick = ()=>{
  openFilePicker('.json', (file)=>{
    const r = new FileReader();
    r.onload = ()=>{
      try{
        const deck = JSON.parse(r.result);
        const errs = validateDeck(deck);
        if(errs.length) alert('警告:\n- '+errs.join('\n- '));
        loadedDeckData = deck;
        $('#deckChosen').textContent = file.name;
        $('#deckChosen').classList.remove('hidden');
        startBtn.disabled = false;
      }catch(e){
        alert('デッキJSONの読み込みに失敗: '+e.message);
      }
    };
    r.readAsText(file);
  });
};

$('#loadDefaultDeckBtn').onclick = async ()=>{
  try{
    const res = await fetch('./deck_list_kimesai.json', {cache:'no-cache'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const deck = await res.json();
    const errs = validateDeck(deck);
    if(errs.length) alert('警告:\n- '+errs.join('\n- '));
    loadedDeckData = deck;
    $('#deckChosen').textContent = 'deck_list_kimesai.json';
    $('#deckChosen').classList.remove('hidden');
    startBtn.disabled = false;
  }catch(e){
    alert('deck_list.json の読込に失敗: '+e.message);
  }
};

$('#pickCardListBtn').onclick = ()=>{
  openFilePicker('.json', (file)=>{
    const r = new FileReader();
    r.onload = ()=>{
      try{
        const arr = JSON.parse(r.result);
        CARD_DB = {};
        for(const it of arr){
          CARD_DB[it['カードナンバー']] = it;
        }
        $('#cardListStatus').textContent = '手動で読込済み';
        $('#cardListStatus').classList.remove('danger');
        $('#cardListChosen').textContent = file.name;
        $('#cardListChosen').classList.remove('hidden');
      }catch(e){
        alert('card_list.json の読み込みに失敗: '+e.message);
      }
    };
    r.readAsText(file);
  });
};

startBtn.onclick = ()=>{
  if(!loadedDeckData){ alert('デッキが選択されていません'); return; }
  overlay.classList.add('hidden');
  SEED = randomSeed(); $('#seedView').textContent = SEED;
  buildInitialZones(loadedDeckData);
  log('ゲーム開始。デッキ枚数: '+ZONES.DECK.length+' / 領土デッキ: '+ZONES.T_DECK.length);
};

/** =====================
 *  UIボタン動作
 *  ===================== */
$('#btnShuffleMain').onclick = ()=>{ shuffle(ZONES.DECK); renderAll(); log('基礎デッキをシャッフル'); };
$('#btnDrawFromDeck').onclick = ()=> drawFromMain();
$('#btnShuffleTerr').onclick = ()=>{ shuffle(ZONES.T_DECK); renderAll(); log('領土デッキをシャッフル'); };
$('#btnDrawFromTDeck').onclick = ()=> drawFromTDeck();
$('#btnDraw1').onclick = ()=> drawFromMain();
$('#btnInit7').onclick = ()=> initDraw7();
$('#btnReset7').onclick = ()=> resetBoardAndDraw7();
$('#btnExport').onclick = ()=> exportState();
$('#btnImport').onclick = ()=> openFilePicker('.json', importState);
$('#btnToken').onclick = ()=> createToken();
$('#btnShot').onclick = ()=> takeScreenshot();
$('#sortHand').onchange = ()=> renderAll();
$('#sortTerritory').onchange = ()=> renderAll();
$('#btnReloadDeck').onclick = ()=>{
  openFilePicker('.json', (file)=>{
    const r = new FileReader();
    r.onload = ()=>{
      try{
        const deck = JSON.parse(r.result);
        const warns = validateDeck(deck);
        if(warns.length) alert('警告:\n- '+warns.join('\n- '));

        loadedDeckData = deck;
        overlay.classList.add('hidden');   // 既に開始後でもオーバーレイは閉じる
        SEED = randomSeed(); $('#seedView').textContent = SEED;

        buildInitialZones(loadedDeckData); // ← 盤面をリセットして新デッキで開始
        log('デッキを再選択: '+file.name);
      }catch(e){
        alert('デッキJSONの読み込みに失敗: '+e.message);
      }
    };
    r.readAsText(file, 'UTF-8');
  });
};
$('#btnDealToFree').onclick = ()=>{
  if(ZONES.DECK.length === 0){ log('デッキ切れ'); return; }
  const c = ZONES.DECK[0];            // shift() せずにUIDを取得
  moveCardTo(c.uid, 'FREE');          // ← ラッパー経由で pushAction('move')
  const moved = findCard(c.uid);
  if(moved){ moved.faceUp = true; }
  renderAll();
  log(`${displayName(moved||c)} を FREE へ`);
};

/** =====================
 *  カウンターパレット → カードへドロップ
 *  ===================== */
let dragCounterType = null;
$$('#counterPalette .paletteItem').forEach(el=>{
  el.addEventListener('dragstart', (e)=>{
    dragCounterType = el.dataset.ctype;
    e.dataTransfer.setData('text/plain', 'COUNTER:'+dragCounterType);
  });
});
document.addEventListener('dragover', (e)=>{
  // カード上でのみ有効化する場合は追加判定も可能
});
document.addEventListener('drop', (e)=>{
  const dt = e.dataTransfer; if(!dt) return;
  const data = dt.getData('text/plain') || '';
  if(!data.startsWith('COUNTER:')) return;
  const target = e.target.closest('.card');
  if(!target) return;
  const uid = target.dataset.uid;
  const typ = data.split(':')[1];
  const c = findCard(uid);
  if(!c) return;
  c.counters[typ] = (c.counters[typ]||0)+1;
  renderAll();
  log(`${displayName(c)} にカウンターを1個追加 (${typ})`);
});

/** =====================
 *  キーボードショートカット
 *  ===================== */
document.addEventListener('keydown', (e)=>{
  // 入力要素内では無効
  const tag = (e.target && e.target.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA' || e.isComposing) return;

  // 修飾キーが一つでも押されていたら無視
  if(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

  const k = e.key.toLowerCase();
  if(k==='d'){ /* ドロー */ drawFromMain(); e.preventDefault(); }
  else if(k==='r'){ /* 回転 */ if(selectedUID) toggleTap(selectedUID); e.preventDefault(); }
  else if(k==='x'){ /* 表裏 */ if(selectedUID) toggleFace(selectedUID); e.preventDefault(); }
  else if(k==='f'){ /* 基デ→FREE */ 
    if(ZONES.DECK.length){
      const c = ZONES.DECK.shift();
      c.zone='FREE'; c.faceUp=true; ZONES.FREE.push(c);
      renderAll(); log(`${displayName(c)} を基デ→FREE`);
    }
    e.preventDefault();
  }
  else if(k==='s'){ /* ログ保存（録画トグル停止側）*/
    if(isRecording){ toggleRecording(); } // 記録停止→自動保存
    e.preventDefault();
  }
});