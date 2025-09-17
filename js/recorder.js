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
  let sx=0, sy=0, right=0, top=0, dragging=false;

  // ヘッダー行をハンドルに
  const handle = panel.querySelector('.row');
  (handle||panel).style.cursor = 'move';

  (handle||panel).addEventListener('mousedown', (e)=>{
    dragging = true;
    const r = panel.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY;
    right = r.right; top = r.top;
    panel.style.left = '44px'; // 右上原点で動かすため inset: 44px auto auto 758px;
    panel.style.bottom = 'auto';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{
    if(!dragging) return;
    const nx = right + (e.clientX - sx);
    const ny = top  + (e.clientY - sy);
    panel.style.left = Math.max(0, nx) + 'px';
    panel.style.top  = Math.max(0, ny) + 'px';
  });
  window.addEventListener('mouseup', ()=> dragging=false);
})();

// ===== Recording / Replay: END =====