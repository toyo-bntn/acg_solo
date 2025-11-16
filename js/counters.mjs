let D = null;
function initCounters(deps){ D = deps; }
function notify(uid, typ, before, after, src){
  if (!D || !D.onCounterChange) return;
  const delta = (after|0) - (before|0);
  D.onCounterChange({ uid, typ, before: before|0, after: after|0, delta, src });
}
/* ── p1p1 カウンターを “+2/+2” “-1/-1” 形式に整形 ─── */
function fmtP1P1(n){
  const sign = n > 0 ? '+' : '';         
  return `${sign}${n}/${sign}${n}`;
}

/* ── [+1] カウンターを “[+3]” 形式に整形 ─── */
function fmtPlus1(n){
  const sign = n > 0 ? '+' : '';        
  return `[${sign}${n}]`;
}

function showCtrMenu(uid, typ, anchorEl){
  const menu = document.createElement('div');
  menu.className = 'ctrMenu';

  const pm = document.createElement('button'); pm.className='btn sm'; pm.textContent='±';
  const up = document.createElement('button'); up.className='btn sm'; up.textContent='▲';
  const dn = document.createElement('button'); dn.className='btn sm'; dn.textContent='▼';
  const rm = document.createElement('button'); rm.className='btn sm warn'; rm.textContent='×';

  pm.onclick = ()=>{ toggleCounterSign(uid, typ, 'menu:±'); menu.remove(); };
  up.onclick = ()=>{ adjustCounter(uid, typ, +1, 'menu:+'); menu.remove(); };
  dn.onclick = ()=>{ adjustCounter(uid, typ, -1, 'menu:-'); menu.remove(); };
  rm.onclick = ()=>{ setCounter(uid, typ, 0,     'menu:x'); menu.remove(); };

  menu.append(pm, up,dn,rm);
  anchorEl.parentElement.appendChild(menu);
  setTimeout(()=>document.addEventListener('click', ()=>menu.remove(), {once:true}), 0);
}

function renderZonesOf(card){
  if(!D) return;
  const el = D.zoneToEl?.(card.zone);
  if(el && D.renderZone) D.renderZone(card.zone, el);
  else D.renderAll?.();
}

function adjustCounter(uid, typ, delta){
  if(!D) return;
  const card = D.findCard(uid);
  if(!card) return;
  const cur  = card.counters[typ] ?? 0;
  const next = (NEGATABLE_TYPES.has(typ) ? cur + delta : Math.max(0, cur +delta));
  card.counters[typ] = NEGATABLE_TYPES.has(typ) ? next : Math.max(0, next);
  renderZonesOf(card);
  notify(uid, typ, cur, card.counters[typ], arguments[3]||'adjust');
}
function setCounter(uid, typ, val, src){
  if(!D) return;
  const card = D.findCard(uid);
  if(!card) return;
  card.counters ||= {};
  const v   = val|0;
  const cur = card.counters[typ] ?? 0;
  card.counters[typ] = NEGATABLE_TYPES.has(typ) ? v : Math.max(0, v);
  renderZonesOf(card);
  notify(uid, typ, cur, card.counters[typ], src||'set');
}

// 反転を許可するカウンター種別（必要に応じて拡張）
const NEGATABLE_TYPES = new Set(['plus1', 'p1p1']);

/** ±: 符号を反転 */
function toggleCounterSign(uid, typ, src){
  if(!D) return;
  const card = D.findCard(uid); if(!card) return;
  card.counters ||= {};
  const cur = card.counters[typ] ?? 0;

  // 許可種別は -cur へ。未設定(0)なら +1 にする（お好みで -1 にしてもOK）
  const next = (NEGATABLE_TYPES.has(typ))
    ? (cur === 0 ? 1 : -cur)
    : cur; // 非対象は何もしない

  card.counters[typ] = next;
  renderZonesOf(card);
  notify(uid, typ, cur, next, src||'toggle');
}

export{ 
   initCounters,
   fmtP1P1,      // 表示整形: “+2/+2”
   fmtPlus1,     // 表示整形: “[+3]”
   showCtrMenu,  // カウンターポップアップ
   adjustCounter,
   setCounter,
   toggleCounterSign,
}