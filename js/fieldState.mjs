/** =====================
 *  状態保存/読込
 *  ===================== */
//function degToRad(d) { return (d * Math.PI) / 180; }
let deps = null;

function initFieldState(d) {
  // d は { get SEED(){...}, get INITIAL_RETURN_LEFT(){...}, get ZONES(){...}, saveText }
  deps = d;
}

function exportState(){
  const { getSEED, getINITIAL_RETURN_LEFT, ZONES, saveText } = deps;

  const data = {
    seed: getSEED(),
    initialReturnLeft: getINITIAL_RETURN_LEFT(),
    zones: Object.fromEntries(
      Object.entries(ZONES).map(([k, arr]) => [
        k,
        arr.map(c => ({
          uid: c.uid,
          cardNo: c.cardNo,
          name: c.name,           // ※ 正規名キーを使うなら適宜変更
          faceUp: !!c.faceUp,
          rot: c.rot | 0,
          counters: c.counters,
          isToken: !!c.isToken
        }))
      ])
    )
  };
  saveText('acg_state.json', JSON.stringify(data, null, 2));
}

function importState(file){
  return new Promise((resolve, reject) => {
    if (!deps) return reject(new Error('initFieldState() が未呼び出しです'));
    const {
      getSEED, setSEED,
      getINITIAL_RETURN_LEFT, setINITIAL_RETURN_LEFT,
      ZONES,
      randomSeed, makeUID,
      renderAll, log, $
    } = deps;

    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = ()=>{
    try{
      const data = JSON.parse(r.result);
      setSEED(data?.seed ?? randomSeed());
      setINITIAL_RETURN_LEFT(data?.initialReturnLeft ?? 0);
      for (const k of Object.keys(ZONES)) {
        ZONES[k].splice(0, ZONES[k].length);
      }

        const zonesIn = data?.zones ?? {};
        for (const [k, arr] of Object.entries(zonesIn)) {
          const dest = ZONES[k] ?? (ZONES[k] = []);
          const list = (arr ?? []).map(o => ({
            uid: o.uid || makeUID(),
            cardNo: o.cardNo,
            // もしプロジェクトで 'info["カード名"]' を正規キーにしているなら
            // name ではなく info を復元する（必要に応じて調整）
            name: o.name, 
            faceUp: !!o.faceUp,
            rot: o.rot | 0,
            counters: {
              p1p1: 0,
              plus1: 0,
              ...(o.counters || {})
            },
            zone: k,
            isToken: !!o.isToken
          }));
          dest.push(...list);
        }

        // 4) UIの反映（要素がなければスキップ）
        const nLeft = getINITIAL_RETURN_LEFT();
        const box = $('#initReturn');
        if (box) box.classList.toggle('hidden', nLeft <= 0);
        const lbl = $('#initReturnLeft');
        if (lbl) lbl.textContent = String(nLeft);

        // 5) 再描画＆ログ
        renderAll();
        log?.('状態を読み込みました');
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    r.readAsText(file);
  });
}
export { initFieldState, exportState, importState };
