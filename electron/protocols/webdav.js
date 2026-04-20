/**
 * @file webdav.js
 * @description webdav パッケージを使った WebDAV プロトコルアダプタ
 */

import { createClient } from 'webdav';
import fs from 'fs/promises';
import path from 'path';

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
	};
}
