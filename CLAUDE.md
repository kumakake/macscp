# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コマンド

```bash
npm run dev          # Vite + Electron 同時起動（開発）
npm run build        # Renderer を dist/ にビルド
npm run build:mac    # DMG 作成（署名なし）
npm test             # Jest ユニットテスト
npm run test:e2e     # Playwright E2E テスト
docker compose up -d # テスト用コンテナ起動（SFTP/FTP/MinIO/WebDAV）
```

## アーキテクチャ

Electron（main + preload + renderer）の 3 層構成。

- **electron/main.js** — BrowserWindow 生成、IPC ハンドラ登録
- **electron/preload.cjs** — contextBridge で `window.macscp` を公開
- **electron/protocols/** — SFTP / SCP / FTP / FTPS / WebDAV / S3 アダプタ（共通 interface）
- **electron/ipc/** — IPC ハンドラ群（sessions.js / files.js / editor.js）
- **electron/sessions/store.js** — electron-store でセッション CRUD
- **electron/credentials/keytar.js** — macOS Keychain（service: com.kumakake.macscp）
- **electron/remote-editor/watcher.js** — chokidar で tmp 監視 → 自動アップロード
- **src/panes/** — LocalPane（左）/ RemotePane（右）のデュアルペイン UI
- **src/sessions/** — SessionList / SessionEditor
- **src/transfer/TransferQueue.jsx** — 転送キュー表示
- **shared/protocol-types.js** — 共通 JSDoc 型定義

## テスト環境（docker-compose）

| サービス | ポート | 認証 |
|---|---|---|
| SFTP (atmoz/sftp) | 2222 | testuser / testpass |
| FTP (alpine-ftp-server) | 21 | testuser / testpass |
| MinIO (S3 互換) | 9000/9001 | minioadmin / minioadmin |
| WebDAV | 8080 | testuser / testpass |

## 署名・配布

- `scripts/notarize.cjs` — afterSign フック（APPLE_ID 環境変数が未設定の場合はスキップ）
- `.github/workflows/build-mac.yml` — タグ push で自動ビルド・署名・リリース
- 必要 secrets: APPLE_ID / APPLE_ID_PASSWORD / APPLE_TEAM_ID / CSC_LINK / CSC_KEY_PASSWORD

## 実行環境

- テスト環境: docker-compose.yml
- 本番環境: DMG 配布（Developer ID 署名 + notarization）
