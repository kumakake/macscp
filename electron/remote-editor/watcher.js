/**
 * @file watcher.js
 * @description リモートファイル編集セッションの管理ロジック
 * tmp ファイルを作成してリモートからダウンロードし、外部エディタで開く。
 * chokidar でファイル変更を監視して自動的にリモートへ再アップロードする。
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import chokidar from 'chokidar';
import { getAdapter } from '../protocols/protocol-manager.js';

const execFileAsync = promisify(execFile);

/**
 * 編集中ファイルの管理マップ
 * @type {Map<string, {tmpPath: string, sessionId: string, remotePath: string, watcher: import('chokidar').FSWatcher}>}
 */
const editingSessions = new Map();

/**
 * tmp ディレクトリのパスを返す（アプリ終了時に自動削除）
 * @returns {string}
 */
function getTmpDir() {
	return path.join(os.tmpdir(), 'macscp-edit');
}

/**
 * リモートファイルをダウンロードして外部エディタで開く
 * @param {string} sessionId - セッション ID
 * @param {string} remotePath - リモートファイルパス
 * @param {string} [editorApp] - 'default' | アプリ名（例: 'Visual Studio Code'）
 * @param {(event: 'saved'|'error', data: any) => void} onEvent - イベントコールバック
 * @returns {Promise<string>} tmpPath
 */
export async function openRemoteFile(sessionId, remotePath, editorApp, onEvent) {
	const tmpDir = getTmpDir();
	await fs.mkdir(tmpDir, { recursive: true });

	const fileName = path.basename(remotePath);
	const tmpPath = path.join(tmpDir, `${sessionId}-${Date.now()}-${fileName}`);

	// リモートからローカル tmp ファイルへダウンロード
	const adapter = getAdapter(sessionId);
	await adapter.download(remotePath, tmpPath);

	// 外部エディタで開く
	if (!editorApp || editorApp === 'default') {
		await execFileAsync('open', [tmpPath]);
	} else {
		await execFileAsync('open', ['-a', editorApp, tmpPath]);
	}

	// chokidar でファイル変更を監視し、変更時に自動アップロードする
	const watcher = chokidar.watch(tmpPath, {
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 500 },
	});

	watcher.on('change', async () => {
		try {
			await adapter.upload(tmpPath, remotePath);
			onEvent('saved', { tmpPath, remotePath });
		} catch (e) {
			onEvent('error', { message: e.message });
		}
	});

	editingSessions.set(tmpPath, { tmpPath, sessionId, remotePath, watcher });

	return tmpPath;
}

/**
 * 編集セッションを閉じて tmp ファイルを削除する
 * @param {string} tmpPath - tmp ファイルのパス
 * @returns {Promise<void>}
 */
export async function closeEditSession(tmpPath) {
	// tmp ディレクトリ外のパスは拒否する
	const normalized = path.resolve(tmpPath);
	if (!normalized.startsWith(path.resolve(getTmpDir()))) {
		throw new Error(`不正なパスです: ${tmpPath}`);
	}

	const session = editingSessions.get(tmpPath);
	if (!session) return;
	await session.watcher.close();
	editingSessions.delete(tmpPath);
	try {
		await fs.unlink(tmpPath);
	} catch (_) {
		// 既に削除済みの場合は無視する
	}
}

/**
 * アプリ終了時に全編集セッションをクリーンアップする
 * @returns {Promise<void>}
 */
export async function cleanupAllEditSessions() {
	for (const [tmpPath] of editingSessions) {
		await closeEditSession(tmpPath);
	}
	try {
		await fs.rm(getTmpDir(), { recursive: true, force: true });
	} catch (_) {
		// エラーは無視する
	}
}

/**
 * 現在編集中のファイル一覧を返す
 * @returns {Array<{tmpPath: string, sessionId: string, remotePath: string}>}
 */
export function listEditSessions() {
	return Array.from(editingSessions.values()).map(({ tmpPath, sessionId, remotePath }) => ({
		tmpPath,
		sessionId,
		remotePath,
	}));
}
