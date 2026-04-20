import { ipcMain, dialog } from 'electron';
import path from 'path';
import os from 'os';
import { listSessions, getSession, saveSession, deleteSession } from '../sessions/store.js';
import { saveCredential, getCredential, deleteCredential } from '../credentials/keytar.js';
import { readSshHosts, listPrivateKeys } from '../ssh-config/reader.js';

/**
 * セッション管理に関する IPC ハンドラを登録する
 * @param {BrowserWindow} mainWindow - 親ウィンドウ（ダイアログのモーダル化に使用）
 * @returns {void}
 */
export function registerSessionIpc(mainWindow) {
	/** セッション一覧を返す */
	ipcMain.handle('sessions:list', () => {
		return listSessions();
	});

	/** 指定 ID のセッションを返す */
	ipcMain.handle('sessions:get', (_, id) => {
		return getSession(id);
	});

	/** セッションを保存する（新規・更新） */
	ipcMain.handle('sessions:save', (_, session) => {
		return saveSession(session);
	});

	/** セッションを削除する（Keychain からも削除） */
	ipcMain.handle('sessions:delete', async (_, id) => {
		try {
			await deleteCredential(id);
		} catch (err) {
			// Keychain に存在しない場合は無視
			console.warn(`Keychain 削除スキップ: ${err.message}`);
		}
		return deleteSession(id);
	});

	/** Keychain にパスワード/パスフレーズを保存する */
	ipcMain.handle('sessions:saveCredential', (_, id, secret) => {
		return saveCredential(id, secret);
	});

	/** Keychain からパスワード/パスフレーズを取得する */
	ipcMain.handle('sessions:getCredential', (_, id) => {
		return getCredential(id);
	});

	/** ~/.ssh/config のホスト一覧を返す */
	ipcMain.handle('ssh:hosts', () => {
		return readSshHosts();
	});

	/** ~/.ssh/id_* の秘密鍵候補一覧を返す */
	ipcMain.handle('ssh:privateKeys', () => {
		return listPrivateKeys();
	});

	/** 秘密鍵ファイルをダイアログで選択する */
	ipcMain.handle('ssh:pickPrivateKey', async () => {
		const result = await dialog.showOpenDialog(mainWindow, {
			title: '秘密鍵ファイルを選択',
			defaultPath: path.join(os.homedir(), '.ssh'),
			properties: ['openFile', 'showHiddenFiles'],
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	});
}
