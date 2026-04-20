# MacSCP

A dual-pane macOS file transfer client built with Electron. Supports SFTP, SCP, FTP/FTPS, WebDAV, and S3-compatible storage with native macOS Keychain integration.

## Features

- **Dual-pane layout** — Local (left) and Remote (right) file browsers side by side
- **Multi-protocol support** — SFTP, SCP, FTP, FTPS, WebDAV, S3-compatible (MinIO etc.)
- **macOS Keychain** — Passwords and key passphrases stored securely in Keychain
- **SSH key authentication** — Private key + passphrase support with file picker
- **File operations** — Upload, download, rename, delete, create directory
- **Sort** — Click column headers (Name / Size / Modified) to sort ascending/descending
- **Drag & drop** — Drag files between local and remote panes
- **In-place editing** — Open remote files in external editor; auto-upload on save
- **Transfer queue** — Live progress display with transfer history

## Requirements

- macOS (Apple Silicon / Intel)
- Node.js 20+

## Development

```bash
# Install dependencies
npm install

# Start dev server (Vite + Electron)
npm run dev
```

## Build

```bash
# Build DMG (unsigned, for local use)
npm run build:mac
# → release/MacSCP-0.1.0-arm64.dmg
```

For signed distribution, set the following environment variables before building:

```
APPLE_ID
APPLE_ID_PASSWORD
APPLE_TEAM_ID
CSC_LINK
CSC_KEY_PASSWORD
```

## Testing

```bash
# Unit tests (Jest)
npm test

# E2E tests (Playwright) — requires Docker
docker compose up -d
npm run test:e2e
```

### Test environment (Docker)

| Service | Port | Credentials |
|---|---|---|
| SFTP (atmoz/sftp) | 2222 | testuser / testpass |
| FTP (alpine-ftp-server) | 21 | testuser / testpass |
| MinIO (S3-compatible) | 9000 / 9001 | minioadmin / minioadmin |
| WebDAV | 8080 | testuser / testpass |

## Architecture

Electron 3-layer structure: **main** / **preload** / **renderer**

```
electron/
├── main.js               # BrowserWindow, IPC handler registration
├── preload.cjs           # contextBridge → window.macscp
├── protocols/            # Protocol adapters (SFTP / SCP / FTP / WebDAV / S3)
├── ipc/                  # IPC handlers (sessions / files / editor)
├── sessions/store.js     # Session CRUD (electron-store)
├── credentials/keytar.js # macOS Keychain (service: com.kumakake.macscp)
└── remote-editor/        # chokidar watch → auto-upload on save

src/
├── panes/
│   ├── LocalPane.jsx     # Left pane (local filesystem)
│   └── RemotePane.jsx    # Right pane (remote filesystem)
├── sessions/             # SessionList / SessionEditor
├── transfer/             # TransferQueue
├── hooks/useMacscpApi.js # IPC wrapper hooks
└── utils/format.js       # formatSize / formatDate

shared/
└── protocol-types.js     # Common JSDoc type definitions (FileEntry etc.)
```

## License

MIT