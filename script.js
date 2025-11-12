// import
 import { takeScreenshot } from './js/screenshot.mjs';
 import { initFieldState, exportState, importState } from './js/fieldState.mjs';
 import {
   initCounters,
   fmtP1P1,      // 表示整形: “+2/+2”
   fmtPlus1,     // 表示整形: “[+3]”
   showCtrMenu,  // カウンターポップアップ
   adjustCounter,
 } from './js/counters.mjs';

//  ユーティリティ
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const logBox = $('#logBox');
// const bind = (sel, type, handler) => document.querySelector(sel)?.addEventListener(type, handler);
let SIDEDECK_TARGET = 0;

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

// === Images picker support ===
const IMG_EXTS = ["webp","png"];

const CARD_IMG_CACHE = new Map();// 成功キャッシュ（base -> URL文字列）
const CARD_IMG_NEG = new Set();  // 失敗した URL はここに入れて次回以降スキップ

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

async function setCardImage(imgEl, baseName) {
  if (baseName === 'Back'){
    imgEl.crossOrigin = 'anonymous';
    imgEl.src = './images/Back.png';
    return;
  }
  // 1) 選択フォルダ由来（即URL完成：ObjectURL）
  const picked = pickFromSelectedFolder(baseName);
  if (picked) {
    imgEl.crossOrigin = 'anonymous';
    imgEl.src = picked;
    return;
  }
  // 2) 成功キャッシュ命中なら即適用
  const cached = CARD_IMG_CACHE.get(baseName);
  if (cached) {
    imgEl.crossOrigin = 'anonymous';
    imgEl.src = cached;
    return;
  }

  // 3) 既定 ./images の拡張子総当たり（img.onerror で順送り）
  for (const ext of IMG_EXTS) {
    const url = `./images/${baseName}.${ext}`;
    if (CARD_IMG_NEG.has(url)) continue;
    const ok = await imageExists(url); // HEAD 相当 or fetch→ok 判定のあなたの既存関数
    if (ok) {
      CARD_IMG_CACHE.set(baseName, url);
      imgEl.crossOrigin = 'anonymous';
      imgEl.src = url;
      return;
    } else {
      CARD_IMG_NEG.add(url);
    }
  }

  // 4) 最後の手段：裏面などのデフォルト
  imgEl.crossOrigin = 'anonymous';
  imgEl.src = './images/Back.png';
}

function pickFromSelectedFolder(baseName) {
  // 完全一致 → 大文字・小文字ゆらぎを軽く吸収
  if (imageStore.map.has(baseName)) return imageStore.map.get(baseName);
  const lower = baseName.toLowerCase();
  const upper = baseName.toUpperCase();
  for (const k of [lower, upper]) {
    if (imageStore.map.has(k)) return imageStore.map.get(k);
  }
  return null;
}

function wakeAllTerritory(){
  const terrs = [...ZONES.T_FIELD];

  __CTX = 'wake';
  try{
    for(const c of terrs){
      if(!c.faceUp){ toggleFace(c.uid); }
      // 裏なら表にする（Action.FLIP が積まれる）
      // rot が 0 以外なら縦に戻す（Action.ROTATE が積まれる）
      if(c.rot % 180 !== 0){   // 90° / 270° を想定
        toggleTap(c.uid, 0);   // deg は元の toggleTap 側では無視される実装
      }
    }
  } finally {
    __CTX = null;
  }

  log('領地のカードを起床');
  renderZone('T_FIELD', $('#territory'), {row:true});
}
$('#btnWakeTerritory')?.addEventListener('click', wakeAllTerritory);

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

// データと状態
let CARD_DB = {}; // カードナンバー→情報
let CARD_BACKS = ['webp','png'].map(ext=>`./images/Back.${ext}`);
let SEED = randomSeed();
let INITIAL_RETURN_LEFT = 0; // 初期2枚戻しの残回数

const ZONES = {
  DECK: [], HAND: [], BATTLEFIELD: [], GRAVE: [], BANISH: [], FREE: [],
  T_DECK: [], T_FIELD: [], SIDEDECK: [],
};

const allowedMoves = {
  DECK:        ['HAND','BATTLEFIELD','GRAVE','BANISH','FREE','SIDEDECK'],
  HAND:        ['BATTLEFIELD','GRAVE','BANISH','DECK','FREE'],
  BATTLEFIELD: ['HAND','GRAVE','BANISH','FREE', 'DECK'],
  GRAVE:       ['HAND','DECK','BANISH','FREE','BATTLEFIELD'], 
  BANISH:      ['HAND','GRAVE','DECK','FREE','BATTLEFIELD'],   
  T_DECK:      ['T_FIELD','GRAVE','BANISH'],
  T_FIELD:     ['GRAVE','BANISH','T_DECK'],
  FREE:        ['HAND','BATTLEFIELD','GRAVE','BANISH','DECK', 'SIDEDECK'],
  SIDEDECK:    ['DECK','FREE'],
};

let selectedUID = null;
// ★ ダブルクリック判定の猶予（ミリ秒）を好きに設定 
const DBLCLICK_MS = 190;

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

// 画像解決（拡張子フォールバック）

function imageSrcForCardNo(cardNo){
  if(cardNo === 'TOKEN'){
    return ['./images/token.webp', './images/token.png'];
  }
  const base = './images/' + cardNo;
  return IMG_EXTS.map(ext => `${base}.${ext}`);
}

//ID→カードナンバー変換

function idToCardNoMain(id){
  if(id === 9028) return 'BP1-080'; // 特例
  if(1 <= id && id <= 164) return 'ACG-' + pad3(id);
  if(5001 <= id && id <= 5079) return 'BP1-' + pad3(id - 5000);
  if(5101 <= id && id <= 5180) return 'BP2-' + pad3(id - 5100);
  if(5201 <= id && id <= 5280) return 'BP3-' + pad3(id - 5200);
  console.warn('未知のmainDeck ID', id);
  return 'ACG-' + pad3(id);
}
function idToCardNoTerr(id){
  if(8001 <= id && id <= 8018) return 'RYO-' + pad3(id - 8000);
  console.warn('未知のterritoryDeck ID', id);
  return 'RYO-' + pad3(id - 8000);
}

//カード生成 / レンダリング
let uidCounter = 0;
function makeUID(){ return 'c' + (++uidCounter) + '_' + Math.random().toString(36).slice(2,7); }

const UID_MAP = new Map(); // uid -> card
function createCardInstance(cardNo, srcZone, faceUp=true, extra={}){
  const info = CARD_DB[cardNo] || null;
  const obj ={
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
  UID_MAP.set(obj.uid, obj);
  return obj;
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

  const sideCont = document.getElementById('sideDeck');
  if (sideCont) {
    renderZone('SIDEDECK', sideCont, {row:true, faceDown:false});
  }
  $('#deckCountChip').textContent = '基礎デッキ: ' + ZONES.DECK.length;
  $('#tDeckCountChip').textContent = '領土デッキ: ' + ZONES.T_DECK.length;
  updateDeckTitleCounts();
}

// 例: 読み込んだ deck JSON から算出する関数（reserveDeck の合計）
function sideTargetFrom(deck){
  const obj = deck.reserveDeck||{};
  return Object.values(obj).reduce((s,c)=>s+(c|0),0);
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
    h3TerrDeck.textContent = '領土デッキ：' + ZONES.T_DECK.length;
  }
  // デッキ読込後:
  if (loadedDeckData){
    SIDEDECK_TARGET = sideTargetFrom(loadedDeckData);
  }
    const cur = ZONES.SIDEDECK.length|0;
  // サイドデッキ：枚数と「残り/超過」
  const h3Side = document.querySelector('.zone[data-zone="SIDEDECK"] > h3');
  const btnSideClose = document.getElementById('btnSideClose');
  const btnSide = document.getElementById('btnSide');
  if (h3Side) {
    const target = (typeof SIDEDECK_TARGET === 'number' ? SIDEDECK_TARGET : 0);
    let html = `サイドデッキ：${cur}`;
    const diff = target - cur;
    if (target > 0) { 
      if (diff > 0) html += ` <span class="dangerText">＜残り：${diff}＞</span>`;
      else if (diff < 0) html += ` <span class="dangerText">＜超過：${-diff}＞</span>`;
    }
    const newH3 = h3Side.cloneNode(true);
    newH3.innerHTML = html;
    newH3.appendChild(h3Side.querySelector('.toolbar'));
    h3Side.parentNode.replaceChild(newH3, h3Side);
    // diffが0の場合にのみボタンを有効化
    if (btnSideClose) {
      if (diff === 0) {
        btnSideClose.removeAttribute('disabled');
        btnSideClose.style.pointerEvents = ''; // CSSで無効化している場合にクリックを許可
      } else {
        btnSideClose.setAttribute('disabled', 'disabled');
        btnSideClose.style.pointerEvents = 'none'; // クリックイベントを無効化
      }
    }
      if (btnSide) {
      if (diff === 0) {
        btnSide.removeAttribute('disabled');
        btnSide.style.pointerEvents = ''; // CSSで無効化している場合にクリックを許可
      } else {
        btnSide.setAttribute('disabled', 'disabled');
        btnSide.style.pointerEvents = 'none'; // クリックイベントを無効化
      }
    }
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
   if (img.dataset.base && img.dataset.base !== 'Back'){
     CARD_IMG_CACHE.set(card.cardNo, this.src);     // 小サムネの成功URLをプレビュー側キャッシュへ学習
   }
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
  el.style.setProperty('--rot-card', card.rot + 'deg');
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
    document.body.classList.add('dragging');
    if(selectedUID !== card.uid){ // 選択中のみドラッグ可（仕様）→ ただしUXのため選択してからドラッグ開始
      selectCard(card.uid);
    }
    e.dataTransfer.setData('text/plain', card.uid);
  });
 el.addEventListener('dragend', ()=>{
 document.body.classList.remove('dragging');
 });
  return el;
}

/** 縦に5枚ずつ積んで、6枚目は右の新しい列へ */
function renderPileColumns(container, cards, {maxPerCol=5, colGap=12, overlap=1, startX=0}={}){
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

/**
 * カードの配列を「カード名かな」の昇順でソートします。
 * @param {Array<object>} cards - ソート対象のカードオブジェクトの配列
 * @returns {Array<object>} ソート済みの新しい配列
 */
function sortCardsByKana(cards) {
  // 元の配列を変更しないように、コピーを作成してからソートします
  return [...cards].sort((a, b) => {
    const cardInfoA = CARD_DB[a.cardNo] || {};    // 各カードのカードナンバーを使って、CARD_DBから詳細情報を取得
    const cardInfoB = CARD_DB[b.cardNo] || {};

    const kanaA = cardInfoA['カード名かな'] || a.name || '';    // 「カード名かな」を取得します。もし存在しない場合は、通常のカード名で代用します
    const kanaB = cardInfoB['カード名かな'] || b.name || '';

    return kanaA.localeCompare(kanaB, 'ja');    // 「かな」を日本語のルールで比較します
  });
}

function renderZone(zoneName, container, opt={}){
  if(zoneName === 'DECK' || zoneName === 'SIDEDECK'){
    container.classList.add('deckStrip');
    container.classList.remove('tdeckStrip','handStrip');
  }else if(zoneName === 'T_DECK'){
    container.classList.add('tdeckStrip');
    container.classList.remove('deckStrip','handStrip');
  }else{
    container.classList.remove('deckStrip','tdeckStrip','handStrip');
  } 
  // 並び替えオプション
  container.innerHTML='';
  let arr = ZONES[zoneName];
  
  // （任意のソート：トグルがONなら並べ替え）
  if(zoneName==='HAND' && $('#sortHand')?.checked){
    arr = sortCardsByKana(arr);
  }
  if(zoneName==='DECK' && $('#sortDeck')?.checked){
    arr = sortCardsByKana(arr);
  }
  if(zoneName==='T_FIELD' && $('#sortTerritory')?.checked){
    arr = sortCardsByKana(arr);
  }
  if(zoneName==='SIDEDECK' && $('#sortSide')?.checked){
    arr = sortCardsByKana(arr);
  }

  // 1) 横並び：戦場/手札/領地
  if(zoneName==='BATTLEFIELD' || zoneName==='HAND' || zoneName==='T_FIELD' || zoneName==='SIDEDECK'){
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

  // 2) 縦5枚ずつ → 右に列追加：墓地/除外/フリー
  if(zoneName==='GRAVE' || zoneName==='BANISH' || zoneName==='FREE'){
    const overlap  = (typeof opt.overlap === 'number')
                      ? opt.overlap
                      : (zoneName === 'FREE' ? 0.50 : 0.50);    // 例：FREE は薄めに
    const colGap   = (typeof opt.colGap === 'number') ? opt.colGap : 12;
    const maxPerCol= (typeof opt.maxPerCol === 'number') ? opt.maxPerCol : 5;
    const startX   = (typeof opt.startX === 'number') ? opt.startX : 0;

    const { usedHeight, usedWidth } =
      renderPileColumns(container, arr, { maxPerCol, overlap, colGap, startX });

    // 幅は念のため最小幅をセット（横スクロールに頼らない）
    container.style.minWidth = usedWidth + 'px';

    // FREE は“縦スクロールではなく欄自体を拡張”する
    if (zoneName==='FREE') {
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


  // 3) その他（デッキ帯など）の既存描画
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

function renderZonesEl(...zones){
  for (const z of zones) {
    const el = zoneToEl(z);
    if (el) renderZone(z, el);
  }
}

function zoneToEl(z){
    // ゾーン名 → コンテナ要素 への解決（既存の選び方に合わせて）
    switch(z){
      case 'FREE':        return $('#zone-free .content');
      case 'BATTLEFIELD': return $('#battlefield');
      case 'HAND':        return $('#hand');
      case 'DECK':        return $('#mainDeck');
      case 'T_FIELD':     return $('#territory');
      case 'T_DECK':      return $('#tDeck');
      case 'GRAVE':       return $('#grave');
      case 'BANISH':      return $('#banish');
      case 'SIDEDECK':    return $('#sideDeck');
      default:            return null;
    }
  }


// 選択・操作
function findCard(uid){ return UID_MAP.get(uid) || null; }
function removeCard(uid){
  const c = UID_MAP.get(uid); if(!c) return null;
  const arr = ZONES[c.zone]; const i = arr.findIndex(x=>x.uid===uid);
  if (i>=0){ arr.splice(i,1); return c; }
  return null;
}
function clearSelection(){
  document.querySelectorAll('.imgWrap.selected').forEach(el=> el.classList.remove('selected'));
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
  renderZone(c.zone, zoneToEl(c.zone)); updatePreview(uid);
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

/** 指定UIDのカードに 0.7s のシャイン演出を一度だけ発火 */
function triggerShineEffect(uid){
  const el = document.querySelector(`.card[data-uid="${uid}"]`);
  if(!el) return;
  el.classList.remove('fx-burst');   // 付け直しで再生させる
  void el.offsetWidth;               // reflow
  el.classList.add('fx-burst');
  setTimeout(()=> el.classList.remove('fx-burst'), 2500); // 念のため自動クリア
}

//ドラッグ＆ドロップ / ゾーン移動
function isToken(card){
  return card.kind === 'token' || card.isToken === true || /token/i.test(card.number || '');
}
function onDragOver(ev){ ev.preventDefault(); }
function onDrop(ev){
  ev.preventDefault();
  const plain = ev.dataTransfer?.getData('text/plain') || '';
  if (plain.startsWith('COUNTER:') || plain.startsWith('EFFECT:')) return; // ★パレットは移動させない
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
    renderZonesEl(from, to); updatePreview(uid);
    return;
  }
    // ★ トークンは「墓地／除外／手札」に入った瞬間に消滅（カウンターも消す）
   if (isToken(c) && (to === 'GRAVE' || to === 'BANISH' || to === 'HAND')) {
    // カウンターをクリア（存在するキーは 0 に、最終的に空オブジェクトへ）
    if (c.counters) {
      for (const k of Object.keys(c.counters)) c.counters[k] = 0;
    }
    c.counters = {};
    log(`${displayName(c)}を${from}→${to}（消滅）`);
    // ゾーンへは積まない（=ゲーム状態から削除）
    renderZonesEl(from, to); updatePreview(uid);
    // プレビューは存在しないUIDになるので必要なら安全に無視
    try { updatePreview(uid); } catch {}
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
  renderZonesEl(from, to); updatePreview(uid);
}

// デッキ操作
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function drawFromMain(){
  if(ZONES.DECK.length===0){ log('デッキ切れ'); return; }
  const c = ZONES.DECK[0];
  __CTX = 'draw:main';
  try{
    moveCardTo(c.uid, 'HAND');
  } finally {
    __CTX = null;
  }
  const moved = findCard(c.uid);
  if(moved){ moved.faceUp = true; }
  log(`${displayName(moved||c)} をドロー`);
  renderAll();
}
function drawFromTDeck(){
  if(ZONES.T_DECK.length===0){ log('領土デッキ切れ'); return; }
  const c = ZONES.T_DECK[0];
  __CTX = 'draw:tdeck';
  try{
    moveCardTo(c.uid, 'T_FIELD');
  } finally {
    __CTX = null;
  }
  const moved = findCard(c.uid);
  if(moved){ moved.faceUp = true; }
  log(`${displayName(moved||c)} を領土へ補充`);
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

function resetBoard(){
  // トークンを消し、その他は対応デッキへ戻す
  function flushZone(fromArr, to){
    for(let i=fromArr.length-1;i>=0;i--){
      const c = fromArr[i];
      if(isToken(c)){ fromArr.splice(i,1); continue; } // トークンは消える
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
      if(isToken(c)){ ZONES[arrName].splice(i,1); continue; }
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
//  for(let i=0;i<7;i++) drawFromMain();
  INITIAL_RETURN_LEFT = 0;
  $('#initReturn').classList.toggle('hidden', INITIAL_RETURN_LEFT<=0);
  $('#initReturnLeft').textContent = INITIAL_RETURN_LEFT;
//  log('盤面リセット');
}

//初期セットアップ（読込/検証）

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
      ZONES.DECK.push(createCardInstance(cardNo, 'DECK', true));
    }
  }
  // territory
  for(const [idStr, count] of Object.entries(deck.territoryDeck||{})){
    const id = parseInt(idStr,10);
    const cardNo = idToCardNoTerr(id);
    for(let i=0;i<(count|0);i++){
      ZONES.T_DECK.push(createCardInstance(cardNo, 'T_DECK', true));
    }
  }
  // reserve (SIDEDECK)
  for (const [idStr, count] of Object.entries(deck.reserveDeck || {})) {
    const id = parseInt(idStr,10);
    const cardNo = idToCardNoMain(id);
    for(let i=0;i<(count|0);i++){
      ZONES.SIDEDECK.push(createCardInstance(cardNo, 'SIDEDECK', true));
    }
  }
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
  log('ゲーム開始。基礎デッキ: '+ZONES.DECK.length+' / 領土デッキ: '+ZONES.T_DECK.length +'/サイドデッキ: '+ZONES.SIDEDECK.length);
};

initFieldState({
  // “最新値”を常に返せるよう getter を渡す
  getSEED: () => SEED,
  setSEED: (v) => { SEED = v; },

  getINITIAL_RETURN_LEFT: () => INITIAL_RETURN_LEFT,
  setINITIAL_RETURN_LEFT: (v) => { INITIAL_RETURN_LEFT = v; },

  ZONES,              // 参照そのもの（各配列の中身を操作するため）
  randomSeed,
  makeUID,

  renderAll,
  log,
  $,
  saveText           // exportState 用
});

initCounters({
  findCard,                 // uid -> card を返す関数
  renderZone,               // 影響ゾーンのみ再描画したいので
  zoneToEl: (z)=> {
    // ゾーン名 → コンテナ要素 への解決（既存の選び方に合わせて）
    switch(z){
      case 'FREE':        return $('#zone-free .content');
      case 'BATTLEFIELD': return $('#battlefield');
      case 'HAND':        return $('#hand');
      case 'DECK':        return $('#mainDeck');
      case 'T_FIELD':     return $('#territory');
      case 'T_DECK':      return $('#tDeck');
      case 'GRAVE':       return $('#grave');
      case 'BANISH':      return $('#banish');
      case 'SIDEDECK':    return $('#sideDeck');
      default:            return null;
    }
  },
  renderAll,               // 全面再描画も必要な場面があるため
  log, displayName         // ログ文言の統一のため
});

// UIボタン動作
$('#btnShuffleMain').onclick = ()=>{ shuffle(ZONES.DECK); renderAll(); log('基礎デッキをシャッフル'); };
$('#btnDrawFromDeck').onclick = ()=> drawFromMain();
$('#btnShuffleTerr').onclick = ()=>{ shuffle(ZONES.T_DECK); renderAll(); log('領土デッキをシャッフル'); };
$('#btnDrawFromTDeck').onclick = ()=> drawFromTDeck();
$('#btnDraw1').onclick = ()=> drawFromMain();
$('#btnInit7').onclick = ()=>{
  __SILENT = true;
  try{
    initDraw7();        // 中では drawFromMain() を呼ぶが、ここでは記録しない
  } finally {
    __SILENT = false;
  }
  clearHistory();       // HISTORY.past / future を空にする
  log('初手を引き直しました（履歴をリセット）');
};
$('#btnReset7').onclick = ()=>{
  __SILENT = true;
  try{
    resetBoard();       // 盤面を初期状態に戻す
  } finally {
    __SILENT = false;
  }
  clearHistory();
  log('盤面をリセット（履歴をリセット）');
};
$('#btnShot').onclick = ()=> takeScreenshot();
$('#btnExport').onclick = ()=> exportState();
$('#btnImport').onclick = ()=> openFilePicker('.json', importState);
$('#btnToken').onclick = ()=> createToken();
$('#sortHand').onchange = ()=> renderAll();
$('#sortTerritory').onchange = ()=> renderAll();
$('#sortSide').onchange = ()=> renderAll();
$('#sortDeck').onchange = ()=> renderAll();
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
$('#resetSideDeck').onclick = () => {
    // ユーザーに確認を求めるダイアログを表示
    if (confirm("サイドチェンジをリセット")) {
        // 「OK」（確定）が押された場合の処理
        buildInitialZones(loadedDeckData);
        renderAll();
    }
    // 「キャンセル」が押された場合は何もしない
};
$('#btnDealToFree').onclick = ()=>{
  if(ZONES.DECK.length === 0){ log('デッキ切れ'); return; }
  const c = ZONES.DECK[0];            // shift() せずにUIDを取得
  __CTX = 'btnDealToFree';
  try{
    moveCardTo(c.uid, 'FREE'); // 1. DECK → FREE（Action.MOVE）
    const moved = findCard(c.uid); // 2. 裏なら表向きにする（Action.FLIP）
    if(moved && !moved.faceUp){
      toggleFace(moved.uid);
    }
  } finally {
    __CTX = null;
  }
  const moved = findCard(c.uid);
  renderAll();
  log(`${displayName(moved||c)} を FREE へ`);
};
document.getElementById('btnSide')?.addEventListener('click', ()=>{
  document.getElementById('sidePanel')?.classList.toggle('hidden');
  renderAll(); // 開いた瞬間にSIDEDECKを描画＆枚数更新
});
document.getElementById('btnSideClose')?.addEventListener('click', ()=>{
  document.getElementById('sidePanel')?.classList.add('hidden');
});
        
//カウンターパレット → カードへドロップ
let typ = null;
$$('#counterPalette .paletteItem').forEach(el=>{
  el.addEventListener('dragstart', (e)=>{
    const typ = el.dataset.ctype;
    if (typ === 'effect_on'){
      e.dataTransfer.setData('text/plain', 'EFFECT:effect_on');
    } else{
      e.dataTransfer.setData('text/plain', 'COUNTER:'+ typ);
    }   
    });
});
document.addEventListener('dragover', (e)=>{
  // カード上でのみ有効化する場合は追加判定も可能
});
document.addEventListener('drop', (e)=>{
  const dt = e.dataTransfer; if(!dt) return;
  const data = dt.getData('text/plain') || '';
  if (!(e.target instanceof Element)) return;

  if (data.startsWith('EFFECT:')) {
    const cardEl = e.target.closest('.card')
      || document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
    if (!cardEl) return;
    const uid = cardEl.dataset.uid;
    const card = findCard(uid); if (!card) return;

    if (card.zone === 'FREE' || card.zone === 'SIDEDECK') {
      log(`${displayName(card)} は ${card.zone} のため [効果] は発火しません`);
      e.stopPropagation();
      return;
    }
    triggerShineEffect(uid);    // 0.7s：拡大しながらシャイン→戻す
    log(`${displayName(card)} に [効果] を発火（0.7s）`);
    e.stopPropagation();        // ★ 念のため二重防御
    return;
  }  

  if(data.startsWith('COUNTER:')) {
    const cardEl = e.target.closest('.card')
     || document.elementsFromPoint(e.clientX, e.clientY)?.closest('.card');
    if (!cardEl) return;

    const uid = cardEl.dataset.uid;
    const typ = data.split(':')[1];
    const card = findCard(uid);
    if(!card) return;

    const beforeSnap = snapshotCard(card);
    const beforeVal = beforeSnap.counters?.[typ] || 0;

    adjustCounter(uid, typ, +1)

    const afterSnap = snapshotCard(card);
    const afterVal  = afterSnap.counters?.[typ] || 0;
    const delta     = afterVal -beforeVal;

    // 履歴に積む（apply() 中の __SILENT=true のときは記録しない）
    if (!__SILENT && delta !== 0) {
      const ev = {
        id:   ++OP_ID,
        type: Action.COUNTER,
        ts:   Date.now(),
        card: afterSnap,          // 「その操作後のカード状態」
        prev: beforeSnap,
        next: afterSnap,
        meta: { ctype: typ, delta, via: 'palette' },
      };
      recordAndPush(ev);
    }
    log(`${displayName(card)} にカウンターを追加 (${typ})`);
    e.stopPropagation();
    return;
  }
});

// カード移動のアニメーション//
function animateCardMove(uid, fromSnap, toSnap, doApplyMove){
  const realBefore = document.querySelector(`.card[data-uid="${uid}"]`);
  if (!realBefore) {
    // 見つからない場合はアニメなしで適用
    doApplyMove();
    return;
  }

  // 1. 現在位置（from）の rect を取得
  const fromRect = realBefore.getBoundingClientRect();

  // 2. 内部状態 + DOM を目的位置に更新（ただしカード本体は一時的に透明に）
  doApplyMove();  // ← applyMove 相当（ZONES更新 + renderAll や renderZonesOf）

  const realAfter = document.querySelector(`.card[data-uid="${uid}"]`);
  if (!realAfter) {
    // 何らかの理由で消えていたら諦める
    return;
  }

  // 実体カードは透過しておく（アニメ中見えないように）
  realAfter.style.opacity = '0';

  const toRect = realAfter.getBoundingClientRect();

  // 3. ゴースト DOM を生成（before の見た目をコピー）
  const ghost = realBefore.cloneNode(true);
  ghost.classList.add('card-ghost');

  // fixed 座標に合わせて配置
  ghost.style.left = fromRect.left + 'px';
  ghost.style.top  = fromRect.top + 'px';

  // transform を初期化（from位置）
  ghost.style.transform = 'translate(0px, 0px)';

  document.body.appendChild(ghost);

  // 次フレームで to 位置まで transform
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top  - fromRect.top;

  requestAnimationFrame(()=>{
    ghost.style.transform = `translate(${dx}px, ${dy}px)`;
  });

  // 4. アニメ終了後にゴースト削除 & 実体カード表示
  const onEnd = ()=>{
    ghost.removeEventListener('transitionend', onEnd);
    ghost.remove();
    realAfter.style.opacity = '';
  };
  ghost.addEventListener('transitionend', onEnd);
}

// ===============================
// 操作ログ / Undo-Redo / 録画エンジン
// ===============================
const Action = { MOVE:'move', ROTATE:'rotate', FLIP:'flip', COUNTER:'counter', DRAW:'draw', SHUFFLE:'shuffle', CREATE:'create', DESTROY:'destroy', EFFECT:'effect', UNDO:'undo', REDO:'redo' };
let __SILENT = false;            // 履歴適用中などの“無記録”ガード
let __CTX = null;                 // 一部操作の文脈（例: DRAW中）
let OP_ID = 0;                    // 通し番号
const HISTORY = { past: [], future: [] }; // Undo/Redo 用（通常操作のみ）
let RECORDING = false;            // 録画ON/OFF
let SESSION = null;               // { startedAt, startIndex, events: [] }

function clearHistory(){
  HISTORY.past.length = 0;
  HISTORY.future.length = 0;
  OP_ID = 0;
  updateUndoRedoButtons();
}

function pad2(n){ return String(n).padStart(2,'0'); }
function nowISO(){ return new Date().toISOString(); }
function snapshotCard(card){
  if(!card) return null;
  const arr = ZONES[card.zone] || [];
  const idx = arr.findIndex(x=>x.uid===card.uid);
  return {
    uid: card.uid, cardNo: card.cardNo, name: card.name,
    zone: card.zone, index: idx,
    faceUp: !!card.faceUp, rot: card.rot|0,
    counters: { ...(card.counters||{}) }
  };
}
function appendEventLogView(ev){
  const line = document.createElement('div');
  line.className = 'entry';
  const head = document.createElement('div');
  const t = new Date(ev.ts);
  head.textContent = `[${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}] ${describeEvent(ev)}`;
  const det = document.createElement('details');
  const sum = document.createElement('summary'); sum.textContent = '詳細';
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify({ prev: ev.prev||null, next: ev.next||null, meta: ev.meta||null }, null, 2);
  det.appendChild(sum); det.appendChild(pre);
  line.appendChild(head); line.appendChild(det);
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}
function describeEvent(ev){
  const card = ev.card?.name || ev.card?.cardNo || ev.card?.uid || '';
  switch(ev.type){
    case Action.MOVE:    return `${card} を ${ev.prev?.zone}→${ev.next?.zone}${ev.meta?.via?`（${ev.meta.via}）`:''}`;
    case Action.FLIP:    return `${card} を 表裏トグル (${ev.prev?.faceUp?'表→裏':'裏→表'})`;
    case Action.ROTATE:  return `${card} を 回転 (${ev.prev?.rot}→${ev.next?.rot})`;
    case Action.COUNTER: return `${card} のカウンター(${ev.meta?.ctype}) ${ev.meta?.delta>0?'+':''}${ev.meta?.delta}`;
    case Action.DRAW:    return `${card?card+'を':''} ドロー`;
    case Action.SHUFFLE: return `${ev.meta?.zone} をシャッフル`;
    case Action.CREATE:  return `カード生成（${card}）`;
    case Action.DESTROY: return `カード消滅（${card}）`;
    case Action.EFFECT:  return `${card} に[効果]発火`;
    case Action.UNDO:    return `Undo: #${ev.meta?.targetId} を取り消し`;
    case Action.REDO:    return `Redo: #${ev.meta?.targetId} をやり直し`;
    default:             return ev.type;
  }
}
function updateUndoRedoButtons(){
  const u = document.getElementById('btnUndo');
  const r = document.getElementById('btnRedo');
  if(u) u.disabled = HISTORY.past.length===0;
  if(r) r.disabled = HISTORY.future.length===0;
}
function logEventForExport(ev){
  if(!RECORDING || !SESSION) return;
  SESSION.events.push(ev);
  appendEventLogView(ev);
}
function beginRecording(){
  if(RECORDING) return;
  RECORDING = true;
  SESSION = { startedAt: nowISO(), startIndex: HISTORY.past.length, events: [] };
  const b = document.getElementById('btnRecord');
  if(b){ b.textContent='記録停止'; b.classList.add('recording'); }
  log('記録を開始');
}
function endRecording(){
  if(!RECORDING) return;
  const b = document.getElementById('btnRecord');
  if(b){ b.textContent='記録開始'; b.classList.remove('recording'); }
  RECORDING = false;
  const evs = (SESSION?.events||[]);
  const ts = new Date();
  const filename = `acg_log_${ts.getFullYear()}${pad2(ts.getMonth()+1)}${pad2(ts.getDate())}_${pad2(ts.getHours())}${pad2(ts.getMinutes())}${pad2(ts.getSeconds())}.json`;
  const payload = {
    type:'acg-log', version:1,
    startedAt: SESSION?.startedAt, endedAt: nowISO(),
    seed: SEED,
    events: evs
  };
  saveJson(filename, payload);
  log(`記録を保存: ${filename}`);
  SESSION = null;
}
function recordAndPush(ev){
  HISTORY.past.push(ev);            // 通常操作は Undo 対象
  HISTORY.future.length = 0;        // Redo 破棄
  updateUndoRedoButtons();
  logEventForExport(ev);            // 録画中のみJSON/表示へ
}
function invert(ev){
  const baseMeta = { ...(ev.meta || {}) };
  const base = { ts: Date.now(), card: ev.card, meta: { ...(ev.meta||{}) } };
  if(ev.type===Action.MOVE){
    return { id: ++OP_ID, type: Action.MOVE, ts: Date.now(),
      card: ev.card, prev: ev.next, next: ev.prev, meta: { ...ev.meta, via:'undo' } };
  }
  if(ev.type===Action.FLIP){
    return { id: ++OP_ID, type: Action.FLIP, ts: Date.now(),
      card: ev.card, prev: ev.next, next: ev.prev };
  }
  if(ev.type===Action.ROTATE){
    return { id: ++OP_ID, type: Action.ROTATE, ts: Date.now(),
      card: ev.card, prev: ev.next, next: ev.prev };
  }
  if(ev.type===Action.COUNTER){
    const inv = { ...(ev.meta||{}) }; inv.delta = -(inv.delta||0);
    // prev/next も逆転
    return { id: ++OP_ID, type: Action.COUNTER, ts: Date.now(),
      card: ev.card, prev: ev.next, next: ev.prev, meta: inv };
  }
  if(ev.type===Action.SHUFFLE){
    return { id: ++OP_ID, type: Action.SHUFFLE, ts: Date.now(),
      card: null, prev: ev.next, next: ev.prev, meta: ev.meta };
  }
  // CREATE/DESTROY/EFFECT/DRAW は“状態の巻き戻し”が曖昧なので最小動作
  if(ev.type===Action.CREATE){
    return { id: ++OP_ID, type: Action.DESTROY, ts: Date.now(), card: ev.card, prev: ev.prev, next: null, meta: baseMeta, };
  }
  if(ev.type===Action.DESTROY){
    return { id: ++OP_ID, type: Action.CREATE, ts: Date.now(), card: ev.card, prev: null, next: ev.next, meta: baseMeta, };
  }
  if(ev.type===Action.DRAW){
    // move として逆再生（HAND→DECKトップへ戻す）
    return { id: ++OP_ID, type: Action.MOVE, ts: Date.now(), card: ev.card, prev: ev.next, next: ev.prev, meta:{ via:'undo-draw' } };
  }
  if(ev.type===Action.EFFECT){
    // 視覚効果は副作用なし：何もしない“空反転”
    return { id: ++OP_ID, type: Action.EFFECT, ts: Date.now(), card: ev.card };
  }
  return { id: ++OP_ID, ...base };
}
function apply(ev, opts = {}){
  const animate = !!opts.animate;
  // 既存関数をラップしない“サイレント”実行
  __SILENT = true;
  try{
    switch(ev.type){
      case Action.MOVE:
        if(ev.next?.zone && ev.card?.uid){ 
          const uid      = ev.card.uid;
          const fromSnap = ev.prev || ev.card || ev.next;
          const toSnap   = ev.next || ev.card;
          
          const doApplyMove = () => {
          moveCardTo(ev.card.uid, ev.next.zone); 
        };

        if (animate){
        animateCardMove(uid, fromSnap, toSnap, doApplyMove);
        } else {
          doApplyMove();
        }
      }
      break;
      
      case Action.FLIP:
        if(ev.card?.uid){ toggleFace(ev.card.uid); }
        break;
      case Action.ROTATE:
        if(ev.card?.uid){ toggleTap(ev.card.uid, (ev.next?.rot|0) - (ev.prev?.rot|0)); }
        break;
      case Action.COUNTER:
        if(ev.card?.uid && ev.meta?.ctype){ adjustCounter(ev.card.uid, ev.meta.ctype, ev.meta.delta|0); }
        break;
      case Action.SHUFFLE:
        if(ev.meta?.zone==='DECK'){ ZONES.DECK = orderByUID(ZONES.DECK, ev.next?.order||[]); renderAll(); }
        if(ev.meta?.zone==='T_DECK'){ ZONES.T_DECK = orderByUID(ZONES.T_DECK, ev.next?.order||[]); renderAll(); }
        break;
      case Action.CREATE:
        //console.log('[DBG] apply CREATE', ev); //tmp
        if (ev.card?.cardNo === 'TOKEN') {
          // 復活させたいゾーン：meta.spawnZone > snapshot.zone > FREE の優先順
          const spawnZone = ev.meta?.spawnZone || ev.card.zone || 'FREE';
          const uid       = ev.card.uid;
          const zone = spawnZone;
          const arr  = ZONES[zone];
          const snap = ev.card;
          
          if (!arr){
            console.warn('[CreATE TOKEN] 不明なゾーン', zone,ev);
            break;
          }
          //console.log('[DBG] CREATE token', { uid, spawnZone }); //tmp
          // すでに同じ uid のカードが場にあるなら何もしない（多重適用防止）
          if (!arr.some(c => c.uid === uid)) {

           // console.log('[DBG] before insert', zone, arr?.length); //tmp
            // スナップショットからトークンオブジェクトを再構築
            const card = {
              uid: uid,
              cardNo: snap.cardNo,
              name: snap.name,
              faceUp: !!snap.faceUp,
              rot: snap.rot | 0,
              counters: { ...(snap.counters || { p1p1:0, plus1:0 }) },
              zone: zone,
              isToken: (snap.cardNo === 'TOKEN'),
            };
            // UID_MAP にも登録（createCardInstance と同じ役割）
            UID_MAP.set(card.uid, card);

            // 可能なら元の index 付近に挿入。なければ末尾。
            let idx = (typeof snap.index === 'number' && snap.index >= 0) ? snap.index : arr.length;
            if (idx > arr.length) idx = arr.length;
            arr.splice(idx, 0, card);
           // console.log('[DBG] INSERT TOKEN', { zone, idx, uid}); //tmp
          } else {
            console.log('[DBG] CREATE: すでにゾーン内にuidが存在', { zone, uid});
          }
          renderAll();
        }
        break;
      case Action.DESTROY:
        if(ev.card?.uid){ removeCard(ev.card.uid); renderAll(); }
        break;
      case Action.EFFECT:
        if(ev.card?.uid){ triggerShineEffect(ev.card.uid); }
        break;
    }
  } finally {
    __SILENT = false;
  }
}
function orderByUID(arr, uidOrder){
  const map = new Map(arr.map(c=>[c.uid,c]));
  return uidOrder.map(u=>map.get(u)).filter(Boolean);
}

// --------- 既存関数をラップ（通常操作 → 履歴に積む） ---------
(function(){ // move
  const _move = moveCardTo;

  function wrappedMoveCardTo(uid, newZone){
    const cardBefore = findCard(uid);
    const beforeSnap = snapshotCard(cardBefore);
    const isTok      = cardBefore && isToken(cardBefore);
    const fromZone   = beforeSnap?.zone;
    const res = _move(uid, newZone);

    const cardAfter = findCard(uid);
    const afterSnap = snapshotCard(cardAfter);

    if(__SILENT) return res;

    // ★ トークンが GRAVE / BANISH / HAND に送られたときは「消滅」として記録
    if (isTok && (newZone === 'GRAVE' || newZone === 'BANISH' || newZone === 'HAND')) {
      const ev = {
        id:   ++OP_ID,
        type: Action.DESTROY,
        ts:   Date.now(),
        card: beforeSnap,      // 消滅直前の状態
        prev: beforeSnap,
        next: null,
        meta: {
          from: fromZone,
          to:   newZone,
          spawnZone: fromZone, 
        },
      };
      recordAndPush(ev);
      return res;
    }

    // 通常のカード移動はこれまで通り MOVE で記録
    const ev = {
      id:   ++OP_ID,
      type: Action.MOVE,
      ts:   Date.now(),
      card: afterSnap || beforeSnap,
      prev: beforeSnap,
      next: afterSnap,
      meta: { via: (__CTX || 'user') },
    };
    recordAndPush(ev);
    return res;
  }
  moveCardTo = wrappedMoveCardTo;
  window.moveCardTo = wrappedMoveCardTo;  
  // flip
  const _flip = toggleFace;
  function wrappedToggleFace(uid){
    const before = snapshotCard(findCard(uid));
    const res = _flip(uid);
    const after  = snapshotCard(findCard(uid));
    if(__SILENT) return res;
    const ev = { id: ++OP_ID, type: Action.FLIP, ts: Date.now(), card: after||before, prev: before, next: after };
    recordAndPush(ev);
    return res;
  }
  toggleFace = wrappedToggleFace;
  window.toggleFace = wrappedToggleFace;
  // rotate
  const _tap = toggleTap;
  function wrappedToggleTap(uid, deg){
    const before = snapshotCard(findCard(uid));
    const res = _tap(uid, deg);
    const after  = snapshotCard(findCard(uid));
    if(__SILENT) return res;
    const ev = { id: ++OP_ID, type: Action.ROTATE, ts: Date.now(), card: after||before, prev: before, next: after };
    recordAndPush(ev);
    return res;
  }
  toggleTap = wrappedToggleTap;
  window.toggleTap = wrappedToggleTap;
  // token create
  const _createToken = createToken;
  function wrappedCreateToken(){
    const c = _createToken();
    if(__SILENT) return c;
    const snap = snapshotCard(c);
    const ev = { id: ++OP_ID, type: Action.CREATE, ts: Date.now(), card: snap, prev: null, next: snap, meta: { spawnZone: snap.zone || 'FREE', origin: 'btnToken',}, };
    recordAndPush(ev);
    return c;
  }
  createToken = wrappedCreateToken;
  window.createToken = wrappedCreateToken;
  // effect
  const _fx = triggerShineEffect;
  function wrappedTriggerShineEffect(uid){
    const res = _fx(uid);
    if(__SILENT) return res;
    const c = snapshotCard(findCard(uid));
    const ev = { id: ++OP_ID, type: Action.EFFECT, ts: Date.now(), card: c };
    recordAndPush(ev);
    return res;
  }
  triggerShineEffect = wrappedTriggerShineEffect;
  window.triggerShineEffect = wrappedTriggerShineEffect;
  // draw wrappers（move に via=draw を付与）
  const _drawMain = drawFromMain;
  function wrappedDrawFromMain(){ 
    __CTX='draw:main'; 
    const r=_drawMain(); 
    __CTX=null; 
    return r; 
  }
  drawFromMain = wrappedDrawFromMain;
  window.drawFromMain = wrappedDrawFromMain;
  const _drawTD = drawFromTDeck;
  function wrappedDrawFromDeck(){ 
    __CTX='draw:tdeck'; 
    const r=_drawTD(); 
    __CTX=null; 
    return r; 
  }
  drawFromTDeck = wrappedDrawFromDeck;
  window.drawFromDeck = wrappedDrawFromDeck;
  // カウンター調整：showCtrMenu 経由の操作をフック（差分検出）
  const _showCtrMenu = showCtrMenu;
  let __ctrCtx = null; // {uid, typ, before}
  function wrappedShowCtrMenu(uid, typ, anchor){
    const c = findCard(uid);
    __ctrCtx = { uid, typ, before: (c?.counters?.[typ]||0) };
    return _showCtrMenu(uid, typ, anchor);
  }
  window.showCtrMenu = wrappedShowCtrMenu;
  document.addEventListener('click', (e)=>{
    // ctrMenuが開いている間のボタン操作を検出（次tickで差分確認）
    if(!__ctrCtx) return;
    if(e.target.closest?.('.ctrMenu')){
      setTimeout(()=>{
        const c = findCard(__ctrCtx.uid);
        const after = (c?.counters?.[__ctrCtx.typ]||0);
        if(after !== __ctrCtx.before){
          const delta = after - __ctrCtx.before;
          const beforeSnap = snapshotCard(c); beforeSnap.counters = { ...(beforeSnap.counters||{}), [__ctrCtx.typ]: __ctrCtx.before };
          const afterSnap  = snapshotCard(c); afterSnap.counters  = { ...(afterSnap.counters||{}),  [__ctrCtx.typ]: after };
          if(!__SILENT){
            const ev = { id: ++OP_ID, type: Action.COUNTER, ts: Date.now(), card: afterSnap, prev: beforeSnap, next: afterSnap, meta:{ ctype: __ctrCtx.typ, delta } };
            recordAndPush(ev);
          }
          __ctrCtx.before = after;
        }
      },0);
    } else {
      __ctrCtx = null;
    }
  });
})();

// --------- シャッフル(ボタン)に履歴を付与 ---------
(function(){
  const btnMain = document.getElementById('btnShuffleMain');
  if(btnMain){
    const orig = btnMain.onclick;
    btnMain.onclick = ()=>{
      const prev = { order: ZONES.DECK.map(c=>c.uid) };
      orig?.(); // 既存動作（shuffle→renderAll→log）
      const next = { order: ZONES.DECK.map(c=>c.uid) };
      if(!__SILENT){
        const ev = { id: ++OP_ID, type: Action.SHUFFLE, ts: Date.now(), meta:{ zone:'DECK' }, prev, next };
        recordAndPush(ev);
      }
    };
  }
  const btnTerr = document.getElementById('btnShuffleTerr');
  if(btnTerr){
    const orig = btnTerr.onclick;
    btnTerr.onclick = ()=>{
      const prev = { order: ZONES.T_DECK.map(c=>c.uid) };
      orig?.();
      const next = { order: ZONES.T_DECK.map(c=>c.uid) };
      if(!__SILENT){
        const ev = { id: ++OP_ID, type: Action.SHUFFLE, ts: Date.now(), meta:{ zone:'T_DECK' }, prev, next };
        recordAndPush(ev);
      }
    };
  }
})();

// --------- Undo / Redo UI & ショートカット ---------
(function(){
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnRec  = document.getElementById('btnRecord');
  btnUndo && (btnUndo.onclick = ()=>{
    const last = HISTORY.past.pop();
    if(!last) return;

    const inv = invert(last);
    apply(inv, { animate: true });

  // ★ トークン消滅を Undo した場合、
  //    DESTROY 側の ev.card も “新しく生成されたトークン” の uid で上書きする
  if (last.type === Action.DESTROY &&
      inv.type  === Action.CREATE &&
      inv.card?.cardNo === 'TOKEN' &&
      inv.card?.uid) {
    last.card = { ...inv.card };   // prev も揃えたければ last.prev も上書き
    if (last.prev) last.prev = { ...inv.card };
  } 
    HISTORY.future.push(last);
    updateUndoRedoButtons();
    // Undo操作自体を“記録”には残す
    if(RECORDING && SESSION){ 
      const logEv = { 
        id: ++OP_ID, 
        type: Action.UNDO, 
        ts: Date.now(), 
        meta:{ targetId: last.id } 
      };
      appendEventLogView(logEv); 
      SESSION.events.push(logEv); 
    }
  });
  btnRedo && (btnRedo.onclick = ()=>{
    const next = HISTORY.future.pop();
    if(!next) return;

    HISTORY.past.push(next);
    apply(next, { animate: true });
    updateUndoRedoButtons();
    if(RECORDING && SESSION){ appendEventLogView({ id: ++OP_ID, type: Action.REDO, ts: Date.now(), meta:{ targetId: next.id } }); SESSION.events.push({ id: OP_ID, type: Action.REDO, ts: Date.now(), meta:{ targetId: next.id } }); }
  });
  btnRec  && (btnRec.onclick  = ()=> RECORDING ? endRecording() : beginRecording());

  // Ctrl/Cmd+Z（Undo）、Ctrl+Y or Shift+Ctrl/Cmd+Z（Redo）
  document.addEventListener('keydown', (e)=>{
    const tag = (e.target && e.target.tagName) || '';
    if(tag==='INPUT' || tag==='TEXTAREA' || e.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    if(!mod) return;
    const k = (e.key||'').toLowerCase();
    if(k==='z' && !e.shiftKey){ e.preventDefault(); btnUndo?.click(); return; }
    if(k==='y' || (k==='z' && e.shiftKey)){ e.preventDefault(); btnRedo?.click(); return; }
  });
  updateUndoRedoButtons();
})();

/**
 * 選択中カードを左右の隣と入れ替える（横並びゾーンのみ）
 * @param {number} dir +1: 右と入れ替え / -1: 左と入れ替え
 * @returns {boolean} 実際に入れ替えを行ったら true
 */
function swapSelectedWithNeighbor(dir){
 if(!selectedUID) return false;
 const card = findCard(selectedUID);
 if(!card) return false;
 const zone = card.zone;
 const HZ = new Set(['HAND','DECK','T_DECK','SIDEDECK']);
 if(!HZ.has(zone)) return false; // 横並び以外は対象外

 // ソートON中は入れ替え禁止（仕様）
 if ((zone==='HAND' && $('#sortHand')?.checked) ||
 (zone==='DECK' && $('#sortDeck')?.checked) ||
 (zone==='SIDEDECK' && $('#sortSide')?.checked)){
 log(`${zone} はソートONのため入れ替えできません`);
 return false;
 }

 const arr = ZONES[zone];
 const i = arr.findIndex(x => x.uid === selectedUID);
 if(i < 0) return false;
 const j = i + (dir > 0 ? 1 : -1);
 if(j < 0 || j >= arr.length) return false; // 端は無視（仕様）

 const a = arr[i], b = arr[j];
 [arr[i], arr[j]] = [b, a];

 // 再描画（selectedUID を見て renderZone 側が枠を付与）
 const el = zoneToEl(zone);
 if (el) renderZone(zone, el);

 log(`${displayName(a)} と ${displayName(b)} の順番を入れ替え（${zone} ${i+1}↔${j+1}）`);
 return true;
}
//キーボードショートカット
document.addEventListener('keydown', (e)=>{
  // 入力要素内では無効
  const tag = (e.target && e.target.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA' || e.isComposing) return;

  // 修飾キーが一つでも押されていたら無視
  if(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

 // ← / → で隣と入れ替え（実行できた場合のみ既定動作を抑止）
 if (e.key === 'ArrowRight' || e.key?.toLowerCase?.() === 'arrowright'){
 if (swapSelectedWithNeighbor(+1)) { e.preventDefault(); }
 return;
 }
 if (e.key === 'ArrowLeft' || e.key?.toLowerCase?.() === 'arrowleft'){
 if (swapSelectedWithNeighbor(-1)) { e.preventDefault(); }
 return;
 }

  const k = e.key.toLowerCase();
  if(k==='d'){ /* ドロー */ drawFromMain(); e.preventDefault(); }
  else if(k==='r'){ /* 回転 */ if(selectedUID) toggleTap(selectedUID); e.preventDefault(); }
  else if(k==='x'){ /* 表裏 */ if(selectedUID) toggleFace(selectedUID); e.preventDefault(); }
  else if(k==='f'){ /* 基デ→FREE */ 
    const top = ZONES.DECK && ZONES.DECK[0];
    if(top){
      moveCardTo(top.uid, 'FREE'); // 統一
      const moved = findCard(top.uid);
      if (moved) { moved.faceUp = true; updatePreview(moved.uid); };
      log(`${displayName(top)} を基デ→FREE`);
    }
    e.preventDefault();
  }
  else if(k==='s'){ /* ログ保存（録画トグル停止側）*/
    if(RECORDING){ 
      endRecording();
    }else{
      beginRecording();
    } // 記録停止→自動保存
    e.preventDefault();
  }
});

window.onDragOver = onDragOver;
window.onDrop = onDrop;

//https://toyo-bntn.github.io/acg_solo/