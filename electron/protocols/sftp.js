/**
 * @file sftp.js
 * @description ssh2-sftp-client を使った SFTP プロトコルアダプタ
 */

import SftpClient from 'ssh2-sftp-client';
import { statSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { buildConnectOptions } from './connect-options.js';
import {
	walkLocalDir,
	walkRemoteDir,
	assertSafeChild,
	joinPosix,
	throttleProgress,
} from './walk-helpers.js';

/**
 * ssh2-sftp-client の stat オブジェクトを FileEntry に変換する
 * @param {string} dirPath - 親ディレクトリパス
 * @param {Object} item - ssh2-sftp-client のリスト項目
 * @returns {import('../../shared/protocol-types.js').FileEntry}
 */
function toFileEntry(dirPath, item) {
	const isDirectory = item.type === 'd';
	const remotePath = dirPath.replace(/\/$/, '') + '/' + item.name;

	return {
		name: item.name,
		path: remotePath,
		isDirectory,
		size: item.size ?? 0,
		modifiedAt: item.modifyTime ? new Date(item.modifyTime) : null,
		permissions: item.longname ? item.longname.slice(0, 10) : '',
	};
}

/**
 * stat オブジェクト単体を FileEntry に変換する
 * @param {string} remotePath - リモートパス
 * @param {Object} statObj - ssh2-sftp-client の stat オブジェクト
 * @returns {import('../../shared/protocol-types.js').FileEntry}
 */
function statToFileEntry(remotePath, statObj) {
	const name = remotePath.split('/').pop();
	return {
		name,
		path: remotePath,
		isDirectory: statObj.isDirectory,
		size: statObj.size ?? 0,
		modifiedAt: statObj.mtime ? new Date(statObj.mtime * 1000) : null,
		permissions: statObj.mode ? statObj.mode.toString(8) : '',
	};
}

/**
 * SFTP アダプタを生成して返す
 * @returns {import('../../shared/protocol-types.js').ProtocolAdapter}
 */
export function createSftpAdapter() {
	const client = new SftpClient();
	let connected = false;

	return {
		/**
		 * SFTP サーバーへ接続する
		 * @param {Object} session - セッション情報
		 * @param {string} [password] - パスワード or パスフレーズ
		 * @returns {Promise<void>}
		 */
		async connect(session, password) {
			try {
				const opts = await buildConnectOptions(session, password);
				await client.connect(opts);
				connected = true;
			} catch (err) {
				connected = false;
				throw new Error(`SFTP 接続に失敗しました: ${err.message}`);
			}
		},

		/**
		 * SFTP 接続を切断する
		 * @returns {Promise<void>}
		 */
		async disconnect() {
			try {
				if (connected) {
					await client.end();
					connected = false;
				}
			} catch (err) {
				connected = false;
				throw new Error(`SFTP 切断に失敗しました: ${err.message}`);
			}
		},

		/**
		 * リモートディレクトリの一覧を取得する
		 * @param {string} remotePath - リモートディレクトリパス
		 * @returns {Promise<import('../../shared/protocol-types.js').FileEntry[]>}
		 */
		async list(remotePath) {
			try {
				const items = await client.list(remotePath);
				return items.map((item) => toFileEntry(remotePath, item));
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
				const statObj = await client.stat(remotePath);
				return statToFileEntry(remotePath, statObj);
			} catch (err) {
				throw new Error(`ファイル情報の取得に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートからローカルへファイルをダウンロードする
		 * @param {string} remotePath - リモートファイルパス
		 * @param {string} localPath - ローカル保存先パス
		 * @param {(transferred: number, total: number) => void} [onProgress] - 進捗コールバック
		 * @returns {Promise<void>}
		 */
		async download(remotePath, localPath, onProgress) {
			try {
				// ファイルサイズを事前取得して進捗計算に使用する
				let total = 0;
				try {
					const statObj = await client.stat(remotePath);
					total = statObj.size ?? 0;
				} catch {
					// stat が失敗しても続行する
				}

				let transferred = 0;

				await client.fastGet(remotePath, localPath, {
					chunkSize: 32768,
					concurrency: 1,
					step: (totalTransferred, _chunk, totalSize) => {
						transferred = totalTransferred;
						const t = totalSize > 0 ? totalSize : total;
						if (onProgress) {
							onProgress(transferred, t);
						}
					},
				});
			} catch (err) {
				throw new Error(`ダウンロードに失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * ローカルからリモートへファイルをアップロードする
		 * @param {string} localPath - ローカルファイルパス
		 * @param {string} remotePath - リモート保存先パス
		 * @param {(transferred: number, total: number) => void} [onProgress] - 進捗コールバック
		 * @returns {Promise<void>}
		 */
		async upload(localPath, remotePath, onProgress) {
			try {
				// ローカルファイルサイズを取得して進捗計算に使用する
				let total = 0;
				try {
					const stat = statSync(localPath);
					total = stat.size;
				} catch {
					// stat が失敗しても続行する
				}

				await client.fastPut(localPath, remotePath, {
					chunkSize: 32768,
					concurrency: 1,
					step: (totalTransferred, _chunk, totalSize) => {
						const t = totalSize > 0 ? totalSize : total;
						if (onProgress) {
							onProgress(totalTransferred, t);
						}
					},
				});
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
				await client.mkdir(remotePath, true);
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
				// ディレクトリかどうかを確認してから適切な削除方法を選択する
				const statObj = await client.stat(remotePath);
				if (statObj.isDirectory) {
					await client.rmdir(remotePath, true);
				} else {
					await client.delete(remotePath);
				}
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
				await client.rename(oldPath, newPath);
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

			// リモートにディレクトリ構造を先に作成する
			await client.mkdir(remoteDir, true);
			for (const relDir of dirs) {
				const remotePath = joinPosix(remoteDir, relDir);
				try {
					await client.mkdir(remotePath, true);
				} catch (err) {
					throw new Error(`リモートディレクトリ作成に失敗しました (${remotePath}): ${err.message}`);
				}
			}

			// ファイルを順次アップロードする
			for (const { relPath, absPath, size } of files) {
				const remotePath = joinPosix(remoteDir, relPath);
				const currentFile = relPath;
				const fileStartBytes = processedBytes;

				// 進捗コールバックを throttle して高頻度の呼び出しを間引く
				const throttledProgress = onProgress
					? throttleProgress((transferred, total) => {
						onProgress({
							kind: 'file-progress',
							currentFile,
							transferred,
							total,
							processedFiles,
							processedBytes: fileStartBytes + transferred,
							totalFiles,
							totalBytes,
						});
					})
					: null;

				try {
					await client.fastPut(absPath, remotePath, {
						chunkSize: 32768,
						concurrency: 1,
						step: (totalTransferred, _chunk, totalSize) => {
							if (throttledProgress) {
								throttledProgress(totalTransferred, totalSize > 0 ? totalSize : size);
							}
						},
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
		 * @param {string} remoteDir - ダウンロード元リモートディレクトリのパス
		 * @param {string} localDir - ダウンロード先ローカルディレクトリの絶対パス
		 * @param {(progress: Object) => void} [onProgress] - 進捗コールバック
		 * @returns {Promise<void>}
		 */
		async getDirectory(remoteDir, localDir, onProgress) {
			// adapter オブジェクト（this の代わりに自身への参照）
			const adapterRef = {
				list: async (remotePath) => {
					const items = await client.list(remotePath);
					return items.map((item) => ({
						name: item.name,
						type: item.type,
						size: item.size ?? 0,
					}));
				},
			};

			// リモートディレクトリを事前スキャンして転送量を把握する
			const { files, dirs, totalBytes } = await walkRemoteDir(adapterRef, remoteDir);
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

			// ローカルにディレクトリ構造を先に作成する
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

			// ファイルを順次ダウンロードする
			for (const { relPath, size } of files) {
				const remotePath = joinPosix(remoteDir, relPath);
				const localAbsPath = path.join(localDir, relPath);
				const currentFile = relPath;
				const fileStartBytes = processedBytes;

				// パストラバーサル攻撃を防止する
				assertSafeChild(localDir, localAbsPath);

				// 進捗コールバックを throttle して高頻度の呼び出しを間引く
				const throttledProgress = onProgress
					? throttleProgress((transferred, total) => {
						onProgress({
							kind: 'file-progress',
							currentFile,
							transferred,
							total,
							processedFiles,
							processedBytes: fileStartBytes + transferred,
							totalFiles,
							totalBytes,
						});
					})
					: null;

				try {
					await client.fastGet(remotePath, localAbsPath, {
						chunkSize: 32768,
						concurrency: 1,
						step: (totalTransferred, _chunk, totalSize) => {
							if (throttledProgress) {
								throttledProgress(totalTransferred, totalSize > 0 ? totalSize : size);
							}
						},
					});
				} catch (err) {
					throw new Error(`ファイルのダウンロードに失敗しました (${remotePath} → ${localAbsPath}): ${err.message}`);
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
