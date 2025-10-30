# ACG solo

## 概要
このプロジェクトは，ACGカードシミュレーションを行うためのウェブアプリケーションです．
index.html, style.css, script.js で構成されています．

## 主な機能
- デッキ JSON（ACG Builder 形式 : https://acg-builder.vercel.app/ ）の読み込みと初期配置
- フォルダ選択でのカード画像読込（自動拡張子検出）
- card_list.json（カード情報）の自動読み込み
- 盤面ログの記録，再現
- 盤面のスクリーンショット

## 基本操作
- 左ドラッグ : カードの移動
- 右クリック : 夜状態（裏面）/起床（表面）の変更
- 左ダブルクリック : ムーブ（90°回転）の変更
- FREEゾーンの+1/+1, [+1]を左ドラッグしカードに置く : カウンターを付与
- ﾄｰｸﾝ生成ボタン : トークンカードをFREEゾーンに生成（ほかのカードと同様にゾーンの移動が可能）．

## ファイル構成
- `index.html`: メインのHTMLファイル
- `style.css`: スタイルシート
- `script.js`: メインのJavaScriptロジック
- `card_list.json` : カード情報
- `deck_list_kimesai.json` : お試し用のデッキJSON(キメラサイクル)
- `images_setup/`: 画像アセットが必要な方向け

## ライセンス
このプロジェクトは [MIT License](./LICENSE) のもとで公開されています。

## 参考にしたプロジェクト
- SparkNahito / [ACGCardSimulator](https://github.com/SparkNahito/ACGCardSimulator/tree/main/AcgPlaySimulator)
- fugart / [solo-mode](https://fugarta.github.io/solo-mode/)
- miyauchi / [Duel Simulator](https://duel-simulator.miyauchidp.dev/)
