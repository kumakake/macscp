/**
 * @file editor.js
 * @description リモートファイル編集操作の IPC ハンドラ
 */

import { ipcMain } from 'electron';
import { openRemoteFile, closeEditSession, listEditSessions } from '../remote-editor/watcher.js';

/**
 * エディタ操作に関する IPC ハンドラを登録する
 * @param {import('electron').BrowserWindow} mainWindow - メインウィンドウ
 * @returns {void}
 */
export function registerEditorIpc(mainWindow) {
	/**
	 * リモートファイルを外部エディタで開く
	 * ダウンロードして tmp に保存し、chokidar で変更を監視する
	 */
	ipcMain.handle('editor:open', async (_, sessionId, remotePath, editorApp) => {
		const tmpPath = await openRemoteFile(sessionId, remotePath, editorApp, (event, data) => {
			mainWindow.webContents.send('editor:event', { event, data, remotePath });
		});
		return tmpPath;
	});

	/**
	 * 編集セッションを終了して tmp ファイルを削除する
	 */
	ipcMain.handle('editor:close', async (_, tmpPath) => {
		// 登録済みセッション以外は拒否（型チェックも含む）
		if (typeof tmpPath !== 'string') throw new Error('不正なパスです');
		await closeEditSession(tmpPath);
	});

	/**
	 * 現在編集中のファイル一覧を返す
	 */
	ipcMain.handle('editor:list', () => listEditSessions());
}
