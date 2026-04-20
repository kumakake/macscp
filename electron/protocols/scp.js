/**
 * @file scp.js
 * @description ssh2 を使った SCP プロトコルアダプタ
 *
 * すべての操作（list/stat/mkdir/rm/rename/download/upload）に
 * SFTP サブシステムを使用する。exec コマンドは使わないため
 * ForceCommand=internal-sftp 環境でも動作する。
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('ssh2');

import path from 'path';
import { buildConnectOptions } from './connect-options.js';

/**
 * ssh2 Client に接続して Promise を返す
 * @param {Object} client
 * @param {Object} opts
 * @returns {Promise<void>}
 */
function connectClient(client, opts) {
	return new Promise((resolve, reject) => {
		client.on('ready', resolve);
		client.on('error', reject);
		client.connect(opts);
	});
}

/**
 * ssh2 Client から SFTP サブシステムを取得する
 * @param {Object} client
 * @returns {Promise<Object>}
 */
function openSftp(client) {
	return new Promise((resolve, reject) => {
		client.sftp((err, sftp) => {
			if (err) reject(new Error(`SFTP サブシステムのオープンに失敗しました: ${err.message}`));
			else resolve(sftp);
		});
	});
}

/** @param {Object} sftp @param {string} remotePath @returns {Promise<Array>} */
function sftpReaddir(sftp, remotePath) {
	return new Promise((resolve, reject) => {
		sftp.readdir(remotePath, (err, list) => {
			if (err) reject(new Error(`readdir 失敗: ${err.message}`));
			else resolve(list);
		});
	});
}

/** @param {Object} sftp @param {string} remotePath @returns {Promise<Object>} */
function sftpLstat(sftp, remotePath) {
	return new Promise((resolve, reject) => {
		sftp.lstat(remotePath, (err, attrs) => {
			if (err) reject(new Error(`lstat 失敗: ${err.message}`));
			else resolve(attrs);
		});
	});
}

/** @param {Object} sftp @param {string} remotePath @returns {Promise<void>} */
function sftpMkdirOne(sftp, remotePath) {
	return new Promise((resolve, reject) => {
		sftp.mkdir(remotePath, (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

/** @param {Object} sftp @param {string} remotePath @returns {Promise<void>} */
function sftpUnlink(sftp, remotePath) {
	return new Promise((resolve, reject) => {
		sftp.unlink(remotePath, (err) => {
			if (err) reject(new Error(`unlink 失敗: ${err.message}`));
			else resolve();
		});
	});
}

/** @param {Object} sftp @param {string} remotePath @returns {Promise<void>} */
function sftpRmdir(sftp, remotePath) {
	return new Promise((resolve, reject) => {
		sftp.rmdir(remotePath, (err) => {
			if (err) reject(new Error(`rmdir 失敗: ${err.message}`));
			else resolve();
		});
	});
}

/** @param {Object} sftp @param {string} o @param {string} n @returns {Promise<void>} */
function sftpRenameFile(sftp, o, n) {
	return new Promise((resolve, reject) => {
		sftp.rename(o, n, (err) => {
			if (err) reject(new Error(`rename 失敗: ${err.message}`));
			else resolve();
		});
	});
}

/**
 * SFTP サブシステムでリモートからローカルへダウンロードする
 * @param {Object} sftp
 * @param {string} remotePath
 * @param {string} localPath
 * @param {(transferred: number, total: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
function sftpFastGet(sftp, remotePath, localPath, onProgress) {
	return new Promise((resolve, reject) => {
		sftp.fastGet(remotePath, localPath, {
			chunkSize: 32768,
			concurrency: 1,
			step: (totalTransferred, _chunk, total) => {
				if (onProgress) onProgress(totalTransferred, total);
			},
		}, (err) => {
			if (err) reject(new Error(`ダウンロードに失敗しました: ${err.message}`));
			else resolve();
		});
	});
}

/**
 * SFTP サブシステムでローカルからリモートへアップロードする
 * @param {Object} sftp
 * @param {string} localPath
 * @param {string} remotePath
 * @param {(transferred: number, total: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
function sftpFastPut(sftp, localPath, remotePath, onProgress) {
	return new Promise((resolve, reject) => {
		sftp.fastPut(localPath, remotePath, {
			chunkSize: 32768,
			concurrency: 1,
			step: (totalTransferred, _chunk, total) => {
				if (onProgress) onProgress(totalTransferred, total);
			},
		}, (err) => {
			if (err) reject(new Error(`アップロードに失敗しました: ${err.message}`));
			else resolve();
		});
	});
}

/**
 * ファイルモードビットから権限文字列を生成する（例: drwxr-xr-x）
 * @param {number} mode
 * @returns {string}
 */
function modeToPermStr(mode) {
	const typeBits = mode & 0o170000;
	const typeChar = typeBits === 0o040000 ? 'd' : typeBits === 0o120000 ? 'l' : '-';
	const chars = 'rwxrwxrwx';
	let perms = '';
	for (let i = 0; i < 9; i++) {
		perms += (mode & (0o400 >> i)) ? chars[i] : '-';
	}
	return typeChar + perms;
}

/**
 * @param {number} mode
 * @returns {boolean}
 */
function isDirectory(mode) {
	return (mode & 0o170000) === 0o040000;
}

/**
 * mkdir -p 相当: 中間ディレクトリを含めて再帰的に作成する
 * @param {Object} sftp
 * @param {string} remotePath
 * @returns {Promise<void>}
 */
async function sftpMkdirP(sftp, remotePath) {
	const parts = remotePath.replace(/^\//, '').split('/').filter(Boolean);
	let current = '';
	for (const part of parts) {
		current += '/' + part;
		try {
			await sftpMkdirOne(sftp, current);
		} catch {
			// 既存ディレクトリは無視
		}
	}
}

/**
 * rm -rf 相当: ファイル・ディレクトリを再帰的に削除する
 * @param {Object} sftp
 * @param {string} remotePath
 * @returns {Promise<void>}
 */
async function sftpRmRecursive(sftp, remotePath) {
	const attrs = await sftpLstat(sftp, remotePath);
	if (isDirectory(attrs.mode)) {
		const list = await sftpReaddir(sftp, remotePath);
		const base = remotePath.replace(/\/$/, '');
		for (const item of list) {
			await sftpRmRecursive(sftp, `${base}/${item.filename}`);
		}
		await sftpRmdir(sftp, remotePath);
	} else {
		await sftpUnlink(sftp, remotePath);
	}
}

/**
 * SCP アダプタを生成して返す
 * @returns {import('../../shared/protocol-types.js').ProtocolAdapter}
 */
export function createScpAdapter() {
	let client = null;
	let connectOpts = null;

	async function ensureConnected() {
		if (client) return client;
		const c = new Client();
		await connectClient(c, connectOpts);
		client = c;
		return client;
	}

	return {
		/**
		 * SCP サーバーへ接続する
		 * @param {Object} session
		 * @param {string} [password]
		 * @returns {Promise<void>}
		 */
		async connect(session, password) {
			try {
				connectOpts = await buildConnectOptions(session, password);
				const c = new Client();
				await connectClient(c, connectOpts);
				client = c;
			} catch (err) {
				client = null;
				throw new Error(`SCP 接続に失敗しました: ${err.message}`);
			}
		},

		/**
		 * SCP 接続を切断する
		 * @returns {Promise<void>}
		 */
		async disconnect() {
			if (client) {
				client.end();
				client = null;
			}
			connectOpts = null;
		},

		/**
		 * リモートディレクトリの一覧を取得する
		 * @param {string} remotePath
		 * @returns {Promise<import('../../shared/protocol-types.js').FileEntry[]>}
		 */
		async list(remotePath) {
			try {
				const c = await ensureConnected();
				const sftp = await openSftp(c);
				const items = await sftpReaddir(sftp, remotePath);
				return items.map(({ filename, attrs }) => ({
					name: filename,
					path: remotePath.replace(/\/$/, '') + '/' + filename,
					isDirectory: isDirectory(attrs.mode),
					size: attrs.size,
					modifiedAt: new Date(attrs.mtime * 1000),
					permissions: modeToPermStr(attrs.mode),
				}));
			} catch (err) {
				throw new Error(`ディレクトリ一覧の取得に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートファイル/ディレクトリの情報を取得する
		 * @param {string} remotePath
		 * @returns {Promise<import('../../shared/protocol-types.js').FileEntry>}
		 */
		async stat(remotePath) {
			try {
				const c = await ensureConnected();
				const sftp = await openSftp(c);
				const attrs = await sftpLstat(sftp, remotePath);
				return {
					name: path.posix.basename(remotePath),
					path: remotePath,
					isDirectory: isDirectory(attrs.mode),
					size: attrs.size,
					modifiedAt: new Date(attrs.mtime * 1000),
					permissions: modeToPermStr(attrs.mode),
				};
			} catch (err) {
				throw new Error(`ファイル情報の取得に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートからローカルへファイルをダウンロードする
		 * @param {string} remotePath
		 * @param {string} localPath
		 * @param {(transferred: number, total: number) => void} [onProgress]
		 * @returns {Promise<void>}
		 */
		async download(remotePath, localPath, onProgress) {
			try {
				const c = await ensureConnected();
				const sftp = await openSftp(c);
				await sftpFastGet(sftp, remotePath, localPath, onProgress);
			} catch (err) {
				throw new Error(`ダウンロードに失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * ローカルからリモートへファイルをアップロードする
		 * @param {string} localPath
		 * @param {string} remotePath
		 * @param {(transferred: number, total: number) => void} [onProgress]
		 * @returns {Promise<void>}
		 */
		async upload(localPath, remotePath, onProgress) {
			try {
				const c = await ensureConnected();
				const sftp = await openSftp(c);
				await sftpFastPut(sftp, localPath, remotePath, onProgress);
			} catch (err) {
				throw new Error(`アップロードに失敗しました (${localPath}): ${err.message}`);
			}
		},

		/**
		 * リモートにディレクトリを作成する（中間ディレクトリも含む）
		 * @param {string} remotePath
		 * @returns {Promise<void>}
		 */
		async mkdir(remotePath) {
			try {
				const c = await ensureConnected();
				const sftp = await openSftp(c);
				await sftpMkdirP(sftp, remotePath);
			} catch (err) {
				throw new Error(`ディレクトリ作成に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートのファイルまたはディレクトリを削除する（再帰対応）
		 * @param {string} remotePath
		 * @returns {Promise<void>}
		 */
		async rm(remotePath) {
			try {
				const c = await ensureConnected();
				const sftp = await openSftp(c);
				await sftpRmRecursive(sftp, remotePath);
			} catch (err) {
				throw new Error(`削除に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートのファイルまたはディレクトリをリネームする
		 * @param {string} oldPath
		 * @param {string} newPath
		 * @returns {Promise<void>}
		 */
		async rename(oldPath, newPath) {
			try {
				const c = await ensureConnected();
				const sftp = await openSftp(c);
				await sftpRenameFile(sftp, oldPath, newPath);
			} catch (err) {
				throw new Error(`リネームに失敗しました (${oldPath} → ${newPath}): ${err.message}`);
			}
		},
	};
}
