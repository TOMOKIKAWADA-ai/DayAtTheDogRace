# Three.js Topdown Racing Mock

ローカルで動く、見下ろし視点の Three.js レーシングゲーム試作です。外部 CDN や外部 URL から実行時にスクリプトを読み込まず、素材は `public/assets/` 以下から参照します。

## 実行方法

```bash
npm install
npm run dev
```

ブラウザで Vite が表示するローカル URL を開いてください。通常は次のURLです。

```text
http://127.0.0.1:5173/
```

ビルド確認:

```bash
npm run build
```

## 操作

- `W` / `↑`: 前進
- `S` / `↓`: 後退
- `A` / `←`: 左に曲がる
- `D` / `→`: 右に曲がる
- `R`: リセット

## 現在入っている機能

- 3Dの見下ろし追従カメラ
- オーバル型コース
- 芝生エリアでの減速
- ラップ数、今回ラップ、最速ラップ、速度表示
- 自車のキーボード操作
- 相手車1台の自動走行
- 影、ヘミスフィアライト、ディレクショナルライト
- 路面・芝生のプロシージャルフォールバックテクスチャ
- GLBが無い場合の箱ベース車体フォールバック

## 差し替え素材

素材が無くても動きます。以下を置くと自動で読み込みを試み、失敗した場合はフォールバックに戻ります。

```text
public/assets/models/car.glb
public/assets/models/opponent.glb
public/assets/textures/road/basecolor.jpg
public/assets/textures/road/basecolor.png
public/assets/textures/road/albedo.jpg
public/assets/textures/road/albedo.png
public/assets/textures/road/road.jpg
public/assets/textures/road/road.png
public/assets/textures/grass/basecolor.jpg
public/assets/textures/grass/basecolor.png
public/assets/textures/grass/albedo.jpg
public/assets/textures/grass/albedo.png
public/assets/textures/grass/grass.jpg
public/assets/textures/grass/grass.png
public/assets/hdri/studio.hdr
```

GLBモデルは、車の前方がローカル `+Z` 方向、接地面が `Y=0` 付近になる向きだとそのまま扱いやすいです。サイズは読み込み時におおよそ車体サイズへ正規化します。

## 構成

```text
index.html
vite.config.js
src/
  main.js
  styles.css
  game/
    RacingGame.js
    assets.js
    config.js
    track.js
    vehicles.js
public/
  assets/
    models/
    textures/
      road/
      grass/
    hdri/
```

ゲームロジックは `src/game/RacingGame.js`、コース生成は `src/game/track.js`、素材パスとコース寸法は `src/game/config.js` にまとめています。
