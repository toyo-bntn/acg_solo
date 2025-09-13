# ACG solo

## 概要
このプロジェクトは，ACGカードシミュレーションを行うためのウェブアプリケーションです．
index.html, style.css, script.js で構成されています．

## 主な機能
- デッキ JSON（ACG Builder 形式 : https://acg-builder.vercel.app/ ）の読み込みと初期配置
- フォルダ選択でのカード画像読込（自動拡張子検出）
- card_list.json（カード情報）の自動読み込みりません」）

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