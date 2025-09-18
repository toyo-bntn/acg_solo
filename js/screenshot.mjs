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
export {takeScreenshot };