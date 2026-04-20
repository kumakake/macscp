import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerSessionIpc } from './ipc/sessions.js';
import { registerFilesIpc } from './ipc/files.js';
import { registerEditorIpc } from './ipc/editor.js';
import { cleanupAllEditSessions } from './remote-editor/watcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

/**
 * 基本 IPC ハンドラを登録する
 * @returns {void}
 */
function registerIpc() {
	ipcMain.handle('ping', () => 'pong');
	registerFilesIpc();
}

/**
 * メインウィンドウを作成する
 * @returns {void}
 */
function createWindow() {
	const win = new BrowserWindow({
		width: 1280,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	if (isDev) {
		win.loadURL('http://localhost:5374');
		win.webContents.openDevTools();
	} else {
		win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
	}

	// ウィンドウ参照が必要な IPC ハンドラはここで登録する
	registerSessionIpc(win);
	registerEditorIpc(win);
}

app.whenReady().then(() => {
	registerIpc();
	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

// アプリ終了前に編集中の tmp ファイルをすべてクリーンアップする
app.on('before-quit', async (event) => {
	event.preventDefault();
	await cleanupAllEditSessions();
	app.exit(0);
});
