/**
 * @file ftp.js
 * @description basic-ftp を使った FTP / FTPS プロトコルアダプタ
 */

import { Client as FtpClient } from 'basic-ftp';
import fs from 'fs/promises';
import path from 'path';
import {
	walkLocalDir,
	walkRemoteDir,
	assertSafeChild,
	joinPosix,
	throttleProgress,
} from './walk-helpers.js';

/**
 * FTP / FTPS アダプタを生成して返す
 * @param {Object} [options] - アダプタオプション
 * @param {boolean} [options.secure=false] - FTPS（TLS）を使用する場合 true
 * @returns {import('../../shared/protocol-types.js').ProtocolAdapter}
 */
export function createFtpAdapter({ secure = false } = {}) {
	const client = new FtpClient();

	return {
		/**
		 * FTP / FTPS サーバーへ接続する
		 * @param {Object} session - セッション情報
		 * @param {string} session.host - ホスト名
		 * @param {number} [session.port] - ポート番号（省略時: FTPS=990, FTP=21）
		 * @param {string} session.username - ユーザー名
		 * @param {string} [password] - パスワード
		 * @returns {Promise<void>}
		 */
		async connect(session, password) {
			try {
				await client.access({
					host: session.host,
					port: session.port ?? (secure ? 990 : 21),
					user: session.username,
					password: password ?? '',
					secure,
				});
			} catch (err) {
				throw new Error(`FTP${secure ? 'S' : ''} 接続に失敗しました: ${err.message}`);
			}
		},

		/**
		 * FTP / FTPS 接続を切断する
		 * @returns {Promise<void>}
		 */
		async disconnect() {
			client.close();
		},

		/**
		 * リモートディレクトリの一覧を取得する
		 * @param {string} remotePath - リモートディレクトリパス
		 * @returns {Promise<import('../../shared/protocol-types.js').FileEntry[]>}
		 */
		async list(remotePath) {
			try {
				const items = await client.list(remotePath);
				return items.map((item) => ({
					name: item.name,
					path: `${remotePath}/${item.name}`.replace(/\/+/g, '/'),
					isDirectory: item.isDirectory,
					size: item.size ?? 0,
					modifiedAt: item.modifiedAt ?? null,
					permissions: '',
					owner: '',
					group: '',
				}));
			} catch (err) {
				throw new Error(`ディレクトリ一覧の取得に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートファイル/ディレクトリの情報を取得する
		 * FTP には stat コマンドがないため、親ディレクトリを list して検索する
		 * @param {string} remotePath - リモートパス
		 * @returns {Promise<import('../../shared/protocol-types.js').FileEntry>}
		 */
		async stat(remotePath) {
			try {
				const dir = path.posix.dirname(remotePath);
				const name = path.posix.basename(remotePath);
				const items = await client.list(dir);
				const entry = items.find((e) => e.name === name);
				if (!entry) {
					throw new Error(`${remotePath} が見つかりません`);
				}
				return {
					name: entry.name,
					path: remotePath,
					isDirectory: entry.isDirectory,
					size: entry.size ?? 0,
					modifiedAt: entry.modifiedAt ?? null,
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
				await client.downloadTo(localPath, remotePath);
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
				await client.uploadFrom(localPath, remotePath);
			} catch (err) {
				throw new Error(`アップロードに失敗しました (${localPath}): ${err.message}`);
			}
		},

		/**
		 * リモートにディレクトリを作成する
		 * ensureDir で中間ディレクトリも含めて作成し、CWD を元に戻す
		 * @param {string} remotePath - 作成するディレクトリのパス
		 * @returns {Promise<void>}
		 */
		async mkdir(remotePath) {
			try {
				const before = await client.pwd();
				await client.ensureDir(remotePath);
				await client.cd(before);
			} catch (err) {
				throw new Error(`ディレクトリ作成に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートのファイルまたはディレクトリを削除する
		 * ディレクトリ削除を試み、失敗した場合はファイルとして削除する
		 * @param {string} remotePath - 削除するパス
		 * @returns {Promise<void>}
		 */
		async rm(remotePath) {
			try {
				try {
					await client.removeDir(remotePath);
				} catch {
					await client.remove(remotePath);
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

			// CWD を保持してリモートにルートディレクトリを作成する
			const beforeRoot = await client.pwd();
			await client.ensureDir(remoteDir);
			await client.cd(beforeRoot);

			// リモートにサブディレクトリ構造を先に作成する
			for (const relDir of dirs) {
				const remotePath = joinPosix(remoteDir, relDir);
				try {
					const before = await client.pwd();
					await client.ensureDir(remotePath);
					await client.cd(before);
				} catch (err) {
					throw new Error(`リモートディレクトリ作成に失敗しました (${remotePath}): ${err.message}`);
				}
			}

			// ファイルを順次アップロードする
			for (const { relPath, absPath, size } of files) {
				const remotePath = joinPosix(remoteDir, relPath);
				const currentFile = relPath;
				const fileStartBytes = processedBytes;

				// trackProgress で FTP レベルの転送進捗を取得して throttle 発火する
				const throttledProgress = onProgress
					? throttleProgress((info) => {
						onProgress({
							kind: 'file-progress',
							currentFile,
							transferred: info.bytes,
							total: size,
							processedFiles,
							processedBytes: fileStartBytes + info.bytes,
							totalFiles,
							totalBytes,
						});
					})
					: null;

				if (throttledProgress) {
					client.trackProgress((info) => throttledProgress(info));
				}

				try {
					await client.uploadFrom(absPath, remotePath);
				} catch (err) {
					// トラッキングを解除してからエラーを再スローする
					client.trackProgress();
					throw new Error(`ファイルのアップロードに失敗しました (${absPath} → ${remotePath}): ${err.message}`);
				}

				// トラッキングを解除する
				client.trackProgress();

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
			// walkRemoteDir に渡す list アダプタ（adapter.list が FileEntry を返すためラップする）
			const listAdapter = {
				list: async (remotePath) => {
					const items = await client.list(remotePath);
					return items.map((item) => ({
						name: item.name,
						type: item.type === 2 ? 'd' : 'f', // basic-ftp の FileType.Directory === 2
						isDirectory: item.isDirectory,
						size: item.size ?? 0,
					}));
				},
			};

			// リモートディレクトリを事前スキャンして転送量を把握する
			const { files, dirs, totalBytes } = await walkRemoteDir(listAdapter, remoteDir);
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

				// trackProgress で FTP レベルの転送進捗を取得して throttle 発火する
				const throttledProgress = onProgress
					? throttleProgress((info) => {
						onProgress({
							kind: 'file-progress',
							currentFile,
							transferred: info.bytes,
							total: size,
							processedFiles,
							processedBytes: fileStartBytes + info.bytes,
							totalFiles,
							totalBytes,
						});
					})
					: null;

				if (throttledProgress) {
					client.trackProgress((info) => throttledProgress(info));
				}

				try {
					await client.downloadTo(localAbsPath, remotePath);
				} catch (err) {
					// トラッキングを解除してからエラーを再スローする
					client.trackProgress();
					throw new Error(`ファイルのダウンロードに失敗しました (${remotePath} → ${localAbsPath}): ${err.message}`);
				}

				// トラッキングを解除する
				client.trackProgress();

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
