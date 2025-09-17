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
- サイドデッキの表示とサイドチェンジ　#調整中

## 基本操作
- 左ドラッグ : カードの移動
- 右クリック : 夜状態（裏面）/起床（表面）の変更
- 左ダブルクリック : ムーブ（90°回転）の変更
- FREEゾーンの+1/+1, [+1]を左ドラッグしてカードに置く : カウンターを付与
- ﾄｰｸﾝ生成ボタン : トークンカードをFREEゾーンに生成（ほかのカードと同様にゾーンの移動が可能）．
- 盤面リセット：盤面のカードを全てデッキに戻す．
- 初手：初手7枚をドロー（盤面リセットに使用）
- サイドデッキ：サイドデッキを表示，基礎デッキのカードと交換可能（サイドデッキの枚数は増減なしが基本）#調整中

## ファイル構成
- `index.html`: メインのHTMLファイル
- `style.css`: スタイルシート
- `script.js`: メインのJavaScriptロジック
- `./js/`: その他の機能のJavaScriptロジック
- `card_list.json` : カード情報（ブースター2弾まで．PRは含まず）
- `deck_list_kimesai.json` : お試し用のデッキJSON(キメラサイクル)
- `./images_setup/`: 画像アセットが必要な方向け（pythonスクリプト）
- `images_setup/Back.png`: 裏面の画像．これをimages/に入れると裏面として利用できます．
- `images_setup/token.png`: トークンの画像．裏面と同様に使ってもよい．

## ライセンス
このプロジェクトは [MIT License](./LICENSE) のもとで公開されています。

## 参考にしたプロジェクト
- SparkNahito / [ACGCardSimulator](https://github.com/SparkNahito/ACGCardSimulator/tree/main/AcgPlaySimulator)
- fugart / [solo-mode](https://fugarta.github.io/solo-mode/)
