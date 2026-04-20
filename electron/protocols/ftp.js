/**
 * @file ftp.js
 * @description basic-ftp を使った FTP / FTPS プロトコルアダプタ
 */

import { Client as FtpClient } from 'basic-ftp';
import path from 'path';

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
	};
}
