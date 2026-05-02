/**
 * @file webdav.js
 * @description webdav パッケージを使った WebDAV プロトコルアダプタ
 */

import { createClient } from 'webdav';
import fs from 'fs/promises';
import path from 'path';
import {
	walkLocalDir,
	assertSafeChild,
	joinPosix,
	throttleProgress,
} from './walk-helpers.js';

/**
 * WebDAV サーバー上に中間ディレクトリを含めて再帰的にディレクトリを作成する
 * すでに存在するディレクトリは 409 Conflict などのエラーを無視して続行する
 * @param {import('webdav').WebDAVClient} client - WebDAV クライアント
 * @param {string} remotePath - 作成するリモートディレクトリの絶対パス
 * @returns {Promise<void>}
 */
async function webdavMkdirP(client, remotePath) {
	// "/" を区切りにセグメント分割してルート以外のパスを取得する
	const segments = remotePath.replace(/^\/+/, '').split('/').filter(Boolean);
	let current = '';

	for (const seg of segments) {
		current = current + '/' + seg;
		try {
			await client.createDirectory(current);
		} catch (err) {
			// 409 Conflict（すでに存在）や 405 Method Not Allowed は無視する
			const status = err?.status ?? err?.response?.status;
			if (status === 409 || status === 405 || status === 301) {
				// すでに存在するため続行する
				continue;
			}
			// エラーメッセージに "already exists" を含む場合も無視する
			if (err?.message && /already exist/i.test(err.message)) {
				continue;
			}
			throw new Error(`WebDAV ディレクトリ作成に失敗しました (${current}): ${err.message}`);
		}
	}
}

/**
 * WebDAV アダプタを生成して返す
 * @returns {import('../../shared/protocol-types.js').ProtocolAdapter}
 */
export function createWebdavAdapter() {
	/** @type {Object|null} WebDAV クライアントインスタンス */
	let client = null;

	return {
		/**
		 * WebDAV サーバーへ接続する
		 * @param {Object} session - セッション情報
		 * @param {string} session.host - ホスト名
		 * @param {number} [session.port] - ポート番号（省略時 80）
		 * @param {string} [session.protocol] - スキーム（省略時 'http'）
		 * @param {string} session.username - ユーザー名
		 * @param {string} [password] - パスワード
		 * @returns {Promise<void>}
		 */
		async connect(session, password) {
			try {
				const scheme = session.protocol === 'webdavs' ? 'https' : 'http';
				const url = `${scheme}://${session.host}:${session.port ?? 80}`;
				client = createClient(url, {
					username: session.username,
					password: password ?? '',
				});
			} catch (err) {
				client = null;
				throw new Error(`WebDAV 接続に失敗しました: ${err.message}`);
			}
		},

		/**
		 * WebDAV 接続を切断する（クライアントを null にリセットする）
		 * @returns {Promise<void>}
		 */
		async disconnect() {
			client = null;
		},

		/**
		 * リモートディレクトリの一覧を取得する
		 * @param {string} remotePath - リモートディレクトリパス
		 * @returns {Promise<import('../../shared/protocol-types.js').FileEntry[]>}
		 */
		async list(remotePath) {
			try {
				const items = await client.getDirectoryContents(remotePath);
				return items.map((item) => ({
					name: item.basename,
					path: item.filename,
					isDirectory: item.type === 'directory',
					size: item.size ?? 0,
					modifiedAt: item.lastmod ? new Date(item.lastmod) : null,
					permissions: '',
				}));
			} catch (err) {
				throw new Error(`ディレクトリ一覧の取得に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートファイル/ディレクトリの情報を取得する
		 * @param {string} remotePath - リモートパス
		 * @returns {Promise<import('../../shared/protocol-types.js').FileEntry>}
		 */
		async stat(remotePath) {
			try {
				const item = await client.stat(remotePath);
				return {
					name: item.basename,
					path: item.filename,
					isDirectory: item.type === 'directory',
					size: item.size ?? 0,
					modifiedAt: item.lastmod ? new Date(item.lastmod) : null,
					permissions: '',
				};
			} catch (err) {
				throw new Error(`ファイル情報の取得に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートからローカルへファイルをダウンロードする
		 * @param {string} remotePath - リモートファイルパス
		 * @param {string} localPath - ローカル保存先パス
		 * @param {(transferred: number, total: number) => void} [onProgress] - 進捗コールバック（未使用）
		 * @returns {Promise<void>}
		 */
		async download(remotePath, localPath, onProgress) {
			try {
				const buf = await client.getFileContents(remotePath);
				await fs.writeFile(localPath, buf);
			} catch (err) {
				throw new Error(`ダウンロードに失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * ローカルからリモートへファイルをアップロードする
		 * @param {string} localPath - ローカルファイルパス
		 * @param {string} remotePath - リモート保存先パス
		 * @param {(transferred: number, total: number) => void} [onProgress] - 進捗コールバック（未使用）
		 * @returns {Promise<void>}
		 */
		async upload(localPath, remotePath, onProgress) {
			try {
				const buf = await fs.readFile(localPath);
				await client.putFileContents(remotePath, buf);
			} catch (err) {
				throw new Error(`アップロードに失敗しました (${localPath}): ${err.message}`);
			}
		},

		/**
		 * リモートにディレクトリを作成する
		 * @param {string} remotePath - 作成するディレクトリのパス
		 * @returns {Promise<void>}
		 */
		async mkdir(remotePath) {
			try {
				await client.createDirectory(remotePath);
			} catch (err) {
				throw new Error(`ディレクトリ作成に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートのファイルまたはディレクトリを削除する
		 * @param {string} remotePath - 削除するパス
		 * @returns {Promise<void>}
		 */
		async rm(remotePath) {
			try {
				await client.deleteFile(remotePath);
			} catch (err) {
				throw new Error(`削除に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートのファイルまたはディレクトリをリネームする
		 * @param {string} oldPath - 変更前のパス
		 * @param {string} newPath - 変更後のパス
		 * @returns {Promise<void>}
		 */
		async rename(oldPath, newPath) {
			try {
				await client.moveFile(oldPath, newPath);
			} catch (err) {
				throw new Error(`リネームに失敗しました (${oldPath} → ${newPath}): ${err.message}`);
			}
		},

		/**
		 * ローカルディレクトリをリモートへ再帰的にアップロードする
		 * @param {string} localDir - アップロード元ローカルディレクトリの絶対パス
		 * @param {string} remoteDir - アップロード先リモートディレクトリのパス
		 * @param {(progress: Object) => void} [onProgress] - 進捗コールバック
		 * @returns {Promise<void>}
		 */
		async putDirectory(localDir, remoteDir, onProgress) {
			// ローカルディレクトリを事前スキャンして転送量を把握する
			const { files, dirs, totalBytes } = await walkLocalDir(localDir);
			const totalFiles = files.length;
			let processedFiles = 0;
			let processedBytes = 0;

			// 開始通知
			if (onProgress) {
				onProgress({
					kind: 'overall',
					processedFiles: 0,
					totalFiles,
					processedBytes: 0,
					totalBytes,
				});
			}

			// リモートにルートディレクトリおよびサブディレクトリ構造を先に作成する
			await webdavMkdirP(client, remoteDir);
			for (const relDir of dirs) {
				const remotePath = joinPosix(remoteDir, relDir);
				await webdavMkdirP(client, remotePath);
			}

			// ファイルを順次アップロードする
			for (const { relPath, absPath, size } of files) {
				const remotePath = joinPosix(remoteDir, relPath);
				const currentFile = relPath;
				const fileStartBytes = processedBytes;

				// 進捗コールバックを throttle して高頻度の呼び出しを間引く
				const throttledProgress = onProgress
					? throttleProgress(({ loaded, total }) => {
						onProgress({
							kind: 'file-progress',
							currentFile,
							transferred: loaded,
							total: total > 0 ? total : size,
							processedFiles,
							processedBytes: fileStartBytes + loaded,
							totalFiles,
							totalBytes,
						});
					})
					: null;

				try {
					const buf = await fs.readFile(absPath);
					await client.putFileContents(remotePath, buf, {
						overwrite: true,
						onUploadProgress: throttledProgress ?? undefined,
					});
				} catch (err) {
					throw new Error(`ファイルのアップロードに失敗しました (${absPath} → ${remotePath}): ${err.message}`);
				}

				// 1 ファイル完了後に進捗を通知する
				processedFiles += 1;
				processedBytes += size;

				if (onProgress) {
					onProgress({
						kind: 'file-done',
						currentFile,
						processedFiles,
						totalFiles,
						processedBytes,
						totalBytes,
					});
				}
			}
		},

		/**
		 * リモートディレクトリをローカルへ再帰的にダウンロードする
		 * WebDAV の getDirectoryContents({ deep: true }) で全エントリを一括取得する
		 * @param {string} remoteDir - ダウンロード元リモートディレクトリのパス
		 * @param {string} localDir - ダウンロード先ローカルディレクトリの絶対パス
		 * @param {(progress: Object) => void} [onProgress] - 進捗コールバック
		 * @returns {Promise<void>}
		 */
		async getDirectory(remoteDir, localDir, onProgress) {
			const remoteBase = remoteDir.replace(/\/$/, '');

			// 1 階層ずつ再帰的にスキャンする（{ deep: true } はサーバーによって非対応）
			const dirs = [];
			const files = [];
			let totalBytes = 0;

			/**
			 * ディレクトリを再帰スキャンする内部ヘルパ
			 * @param {string} currentRemote - 現在スキャン中のリモートパス
			 */
			async function scanDir(currentRemote) {
				let items;
				try {
					items = await client.getDirectoryContents(currentRemote);
				} catch (err) {
					throw new Error(`リモートディレクトリのスキャンに失敗しました (${currentRemote}): ${err.message}`);
				}
				for (const item of items) {
					const relPath = item.filename.slice(remoteBase.length).replace(/^\//, '');
					if (!relPath) continue;
					if (item.type === 'directory') {
						dirs.push(relPath);
						await scanDir(item.filename);
					} else {
						files.push({ relPath, size: item.size ?? 0 });
						totalBytes += item.size ?? 0;
					}
				}
			}

			await scanDir(remoteBase);

			const totalFiles = files.length;
			let processedFiles = 0;
			let processedBytes = 0;

			// 開始通知
			if (onProgress) {
				onProgress({
					kind: 'overall',
					processedFiles: 0,
					totalFiles,
					processedBytes: 0,
					totalBytes,
				});
			}

			// ローカルにルートディレクトリおよびサブディレクトリ構造を先に作成する
			await fs.mkdir(localDir, { recursive: true });
			for (const relDir of dirs) {
				const localAbsPath = path.join(localDir, relDir);
				// パストラバーサル攻撃を防止する
				assertSafeChild(localDir, localAbsPath);
				try {
					await fs.mkdir(localAbsPath, { recursive: true });
				} catch (err) {
					throw new Error(`ローカルディレクトリ作成に失敗しました (${localAbsPath}): ${err.message}`);
				}
			}

			// ファイルを順次ダウンロードしてローカルに書き出す
			for (const { relPath, size } of files) {
				const remotePath = joinPosix(remoteBase, relPath);
				const localAbsPath = path.join(localDir, relPath);
				const currentFile = relPath;

				// パストラバーサル攻撃を防止する
				assertSafeChild(localDir, localAbsPath);

				let buf;
				try {
					buf = await client.getFileContents(remotePath);
				} catch (err) {
					throw new Error(`ファイルのダウンロードに失敗しました (${remotePath}): ${err.message}`);
				}

				try {
					await fs.writeFile(localAbsPath, Buffer.from(buf));
				} catch (err) {
					throw new Error(`ローカルへの書き出しに失敗しました (${localAbsPath}): ${err.message}`);
				}

				// 1 ファイル完了後に進捗を通知する
				processedFiles += 1;
				processedBytes += size;

				if (onProgress) {
					onProgress({
						kind: 'file-done',
						currentFile,
						processedFiles,
						totalFiles,
						processedBytes,
						totalBytes,
					});
				}
			}
		},
	};
}
