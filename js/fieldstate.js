/** =====================
 *  状態保存/読込
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