# ACG solo

## 概要
このプロジェクトは，アニマルカードゲームのシミュレーションを行うためのウェブアプリケーションです．
index.html, style.css, script.js, card_list.json で構成されています．

## 主な機能
- デッキ JSON（ACG Builder 形式 : https://acg-builder.vercel.app/ ）の読み込み
- フォルダ選択でのカード画像読込（ローカルでの画像フォルダ必要）
- card_list.json（カード情報）の自動読み込み
- 盤面ログの記録，再現
- 盤面のスクリーンショット

## 基本操作
- 左ドラッグ : カードの移動
- 右クリック : 夜状態（裏面）/起床（表面）の変更
- 左ダブルクリック : ムーブ（90°回転）の変更
- FREEゾーンの+1/+1, [+1]を左ドラッグしてカードに置く : カウンターを付与
- ﾄｰｸﾝ生成ボタン : トークンカードをFREEゾーンに生成（ほかのカードと同様にゾーンの移動が可能）．
- 盤面リセット＆初手：盤面のカードを全てデッキに戻して，7枚ドローする

## ファイル構成
- `index.html`: メインのHTMLファイル
- `style.css`: スタイルシート
- `script.js`: JavaScriptロジック
- `card_list.json` : カード情報（ブースター2弾まで．PRは含まず）
- `deck_list_kimesai.json` : お試し用のデッキJSON(キメラサイクル)
- `images_setup/`: 画像アセットが必要な方向け（pythonスクリプト）

## ライセンス
このプロジェクトは [MIT License](./LICENSE) のもとで公開されています。

## 参考にしたプロジェクト
- SparkNahito / [ACGCardSimulator](https://github.com/SparkNahito/ACGCardSimulator/tree/main/AcgPlaySimulator)
- fugart / [solo-mode](https://fugarta.github.io/solo-mode/)
