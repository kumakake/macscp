/**
 * @file files.js
 * @description ファイル操作に関する IPC ハンドラ
 */

import { ipcMain } from 'electron';
import { connect, disconnect, getAdapter, isConnected } from '../protocols/protocol-manager.js';
import { getSession } from '../sessions/store.js';
import { getCredential } from '../credentials/keytar.js';
import fs from 'fs/promises';
import { unlink } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

/** uid → username のキャッシュ（起動後初回 listLocal 時に構築） */
let uidMap = null;
/** gid → groupname のキャッシュ */
let gidMap = null;

/**
 * UID/GID → 名前のマップを構築する。macOS は dscl、Linux は /etc/passwd を使用。
 * 一度構築したらキャッシュを返す。
 */
async function ensureIdMaps() {
	if (uidMap) return;
	uidMap = new Map();
	gidMap = new Map();
	try {
		// macOS: dscl . -list /Users UniqueID → "username\t<uid>" 形式
		const { stdout: usersOut } = await execFileAsync('dscl', ['.', '-list', '/Users', 'UniqueID']);
		for (const line of usersOut.split('\n')) {
			const parts = line.trim().split(/\s+/);
			if (parts.length === 2) uidMap.set(parts[1], parts[0]);
		}
		const { stdout: groupsOut } = await execFileAsync('dscl', ['.', '-list', '/Groups', 'PrimaryGroupID']);
		for (const line of groupsOut.split('\n')) {
			const parts = line.trim().split(/\s+/);
			if (parts.length === 2) gidMap.set(parts[1], parts[0]);
		}
	} catch {
		// dscl が使えない環境（Linux 等）では /etc/passwd にフォールバック
		try {
			const passwd = await fs.readFile('/etc/passwd', 'utf8');
			for (const line of passwd.split('\n')) {
				const p = line.split(':');
				if (p.length >= 3 && p[0] && p[2]) uidMap.set(p[2], p[0]);
			}
			const group = await fs.readFile('/etc/group', 'utf8');
			for (const line of group.split('\n')) {
				const p = line.split(':');
				if (p.length >= 3 && p[0] && p[2]) gidMap.set(p[2], p[0]);
			}
		} catch { /* フォールバックも失敗した場合はマップを空のまま維持（UID 数値表示） */ }
	}
}

/**
 * パスが許可されたルート配下にあることを検証する
 * ディレクトリトラバーサル攻撃を防ぐ
 * @param {string} inputPath - 検証するパス
 * @param {string[]} allowedRoots - 許可するルートディレクトリの配列
 * @throws {Error} パスが許可範囲外の場合
 */
function assertSafePath(inputPath, allowedRoots) {
	const normalized = path.resolve(inputPath);
	const allowed = allowedRoots.some(root => normalized.startsWith(path.resolve(root)));
	if (!allowed) {
		throw new Error(`アクセスが拒否されました: ${inputPath}`);
	}
}

/**
 * ファイル操作に関する IPC ハンドラを登録する
 * @returns {void}
 */
export function registerFilesIpc() {
	/**
	 * リモートサーバーへ接続する
	 * セッション情報と Keychain のパスワードを使って接続を確立する
	 */
	ipcMain.handle('files:connect', async (_, sessionId) => {
		const session = getSession(sessionId);
		if (!session) {
			throw new Error('セッションが見つかりません');
		}
		const password = await getCredential(sessionId);
		await connect(sessionId, session, password);
	});

	/**
	 * リモートサーバーから切断する
	 */
	ipcMain.handle('files:disconnect', async (_, sessionId) => {
		await disconnect(sessionId);
	});

	/**
	 * セッションの接続状態を返す
	 */
	ipcMain.handle('files:isConnected', (_, sessionId) => {
		return isConnected(sessionId);
	});

	/**
	 * リモートディレクトリの一覧を取得する
	 */
	ipcMain.handle('files:list', async (_, sessionId, remotePath) => {
		return getAdapter(sessionId).list(remotePath);
	});

	/**
	 * ローカルディレクトリの一覧を取得する
	 */
	ipcMain.handle('files:listLocal', async (_, dirPath) => {
		assertSafePath(dirPath, [os.homedir(), '/Volumes', os.tmpdir(), '/']);
		try {
			await ensureIdMaps();
			const entries = await fs.readdir(dirPath, { withFileTypes: true });
			return Promise.all(entries.map(async (e) => {
				const fullPath = path.join(dirPath, e.name);
				let size = 0;
				let modifiedAt = null;
				let permissions = '';
				let owner = '';
				let group = '';
				try {
					const stat = await fs.stat(fullPath);
					size = stat.size;
					modifiedAt = stat.mtime;
					const m = stat.mode;
					permissions = [
						m & 0o400 ? 'r' : '-', m & 0o200 ? 'w' : '-', m & 0o100 ? 'x' : '-',
						m & 0o040 ? 'r' : '-', m & 0o020 ? 'w' : '-', m & 0o010 ? 'x' : '-',
						m & 0o004 ? 'r' : '-', m & 0o002 ? 'w' : '-', m & 0o001 ? 'x' : '-',
					].join('');
					owner = uidMap.get(String(stat.uid)) ?? String(stat.uid);
					group = gidMap.get(String(stat.gid)) ?? String(stat.gid);
				} catch { /* アクセス不可の場合はフォールバック値を維持 */ }
				return {
					name: e.name,
					path: fullPath,
					isDirectory: e.isDirectory(),
					size,
					modifiedAt,
					permissions,
					owner,
					group,
				};
			}));
		} catch (err) {
			throw new Error(`ローカルディレクトリの読み込みに失敗しました (${dirPath}): ${err.message}`);
		}
	});

	/**
	 * ローカルのホームディレクトリパスを返す
	 */
	ipcMain.handle('files:homeDir', () => {
		return os.homedir();
	});

	/**
	 * リモートからローカルへファイルをダウンロードする
	 * 進捗は 'files:progress' IPC イベントで通知する
	 * @param {Electron.IpcMainInvokeEvent} event
	 * @param {string} sessionId - セッション ID
	 * @param {string} remotePath - リモートファイルパス
	 * @param {string} localPath - 保存先ローカルパス
	 * @param {string} [transferId] - 転送識別子（進捗通知に含める）
	 */
	ipcMain.handle('files:download', async (event, sessionId, remotePath, localPath, transferId) => {
		assertSafePath(localPath, [os.homedir(), os.tmpdir()]);
		await getAdapter(sessionId).download(remotePath, localPath, (transferred, total) => {
			event.sender.send('files:progress', {
				transferId,
				name: path.basename(remotePath),
				transferred,
				total,
			});
		});
	});

	/**
	 * ローカルからリモートへファイルをアップロードする
	 * 進捗は 'files:progress' IPC イベントで通知する
	 * @param {Electron.IpcMainInvokeEvent} event
	 * @param {string} sessionId - セッション ID
	 * @param {string} localPath - アップロード元ローカルパス
	 * @param {string} remotePath - 保存先リモートパス
	 * @param {string} [transferId] - 転送識別子（進捗通知に含める）
	 */
	ipcMain.handle('files:upload', async (event, sessionId, localPath, remotePath, transferId) => {
		assertSafePath(localPath, [os.homedir(), os.tmpdir()]);
		await getAdapter(sessionId).upload(localPath, remotePath, (transferred, total) => {
			event.sender.send('files:progress', {
				transferId,
				name: path.basename(localPath),
				transferred,
				total,
			});
		});
	});

	/**
	 * ローカルディレクトリをリモートへ再帰的にアップロードする
	 * 進捗は 'files:progress' IPC イベントで通知する（DirectoryProgress 型）
	 * @param {Electron.IpcMainInvokeEvent} event
	 * @param {string} sessionId - セッション ID
	 * @param {string} localDir - アップロード元ローカルディレクトリパス
	 * @param {string} remoteDir - 保存先リモートディレクトリパス
	 * @param {string} [transferId] - 転送識別子（進捗通知に含める）
	 */
	ipcMain.handle('files:uploadDirectory', async (event, sessionId, localDir, remoteDir, transferId) => {
		assertSafePath(localDir, [os.homedir(), os.tmpdir()]);
		await getAdapter(sessionId).putDirectory(localDir, remoteDir, (/** @type {import('../../shared/protocol-types.js').DirectoryProgress} */ progress) => {
			event.sender.send('files:progress', {
				transferId,
				...progress,
			});
		});
	});

	/**
	 * リモートディレクトリをローカルへ再帰的にダウンロードする
	 * 進捗は 'files:progress' IPC イベントで通知する（DirectoryProgress 型）
	 * @param {Electron.IpcMainInvokeEvent} event
	 * @param {string} sessionId - セッション ID
	 * @param {string} remoteDir - ダウンロード元リモートディレクトリパス
	 * @param {string} localDir - 保存先ローカルディレクトリパス
	 * @param {string} [transferId] - 転送識別子（進捗通知に含める）
	 */
	ipcMain.handle('files:downloadDirectory', async (event, sessionId, remoteDir, localDir, transferId) => {
		assertSafePath(localDir, [os.homedir(), os.tmpdir()]);
		await getAdapter(sessionId).getDirectory(remoteDir, localDir, (/** @type {import('../../shared/protocol-types.js').DirectoryProgress} */ progress) => {
			event.sender.send('files:progress', {
				transferId,
				...progress,
			});
		});
	});

	/**
	 * リモートにディレクトリを作成する
	 */
	ipcMain.handle('files:mkdir', async (_, sessionId, remotePath) => {
		await getAdapter(sessionId).mkdir(remotePath);
	});

	/**
	 * リモートのファイル/ディレクトリを削除する
	 */
	ipcMain.handle('files:rm', async (_, sessionId, remotePath) => {
		await getAdapter(sessionId).rm(remotePath);
	});

	/**
	 * リモートのファイル/ディレクトリをリネームする
	 */
	ipcMain.handle('files:rename', async (_, sessionId, oldPath, newPath) => {
		await getAdapter(sessionId).rename(oldPath, newPath);
	});

	/**
	 * ローカルにディレクトリを作成する
	 */
	ipcMain.handle('files:mkdirLocal', async (_, dirPath) => {
		assertSafePath(dirPath, [os.homedir(), '/Volumes', os.tmpdir(), '/']);
		await fs.mkdir(dirPath);
		return { ok: true };
	});

	/**
	 * ローカルのファイル/ディレクトリを削除する
	 */
	ipcMain.handle('files:deleteLocal', async (_, filePath) => {
		assertSafePath(filePath, [os.homedir(), os.tmpdir()]);
		const stat = await fs.lstat(filePath);
		if (stat.isDirectory()) {
			await fs.rm(filePath, { recursive: true });
		} else {
			await unlink(filePath);
		}
	});

	/**
	 * ローカルのファイル/ディレクトリ名を変更する
	 */
	ipcMain.handle('files:renameLocal', async (_, oldPath, newPath) => {
		assertSafePath(oldPath, [os.homedir(), os.tmpdir()]);
		assertSafePath(newPath, [os.homedir(), os.tmpdir()]);
		await fs.rename(oldPath, newPath);
		return { ok: true };
	});
}
