/**
 * @file protocol-manager.js
 * @description セッション ID とプロトコルアダプタのキャッシュ管理
 */

import { createSftpAdapter } from './sftp.js';
import { createScpAdapter } from './scp.js';
import { createFtpAdapter } from './ftp.js';
import { createWebdavAdapter } from './webdav.js';
import { createS3Adapter } from './s3.js';

/** @type {Map<string, import('../../shared/protocol-types.js').ProtocolAdapter>} */
const connections = new Map();

/**
 * プロトコル名に対応するアダプタを生成する
 * @param {string} protocol - プロトコル名 ('sftp'|'scp'|'ftp'|'ftps'|'webdav'|'s3')
 * @returns {import('../../shared/protocol-types.js').ProtocolAdapter}
 */
function createAdapter(protocol) {
	switch (protocol) {
		case 'sftp':
			return createSftpAdapter();
		case 'scp':
			return createScpAdapter();
		case 'ftp':
			return createFtpAdapter({ secure: false });
		case 'ftps':
			return createFtpAdapter({ secure: true });
		case 'webdav':
			return createWebdavAdapter();
		case 's3':
			return createS3Adapter();
		default:
			throw new Error(`未対応のプロトコル: ${protocol}`);
	}
}

/**
 * セッションへ接続してアダプタをキャッシュに登録する
 * @param {string} sessionId - セッション ID
 * @param {Object} session - セッション情報
 * @param {string} session.protocol - プロトコル名
 * @param {string} [password] - パスワード or パスフレーズ
 * @returns {Promise<void>}
 */
export async function connect(sessionId, session, password) {
	// すでに接続済みの場合は一度切断してから再接続する
	if (connections.has(sessionId)) {
		try {
			await connections.get(sessionId).disconnect();
		} catch {
			// 切断エラーは無視して続行する
		}
		connections.delete(sessionId);
	}

	const adapter = createAdapter(session.protocol ?? 'sftp');
	await adapter.connect(session, password);
	connections.set(sessionId, adapter);
}

/**
 * セッションを切断してキャッシュから削除する
 * @param {string} sessionId - セッション ID
 * @returns {Promise<void>}
 */
export async function disconnect(sessionId) {
	const adapter = connections.get(sessionId);
	if (!adapter) {
		return;
	}

	try {
		await adapter.disconnect();
	} finally {
		connections.delete(sessionId);
	}
}

/**
 * キャッシュ済みのアダプタを取得する
 * @param {string} sessionId - セッション ID
 * @returns {import('../../shared/protocol-types.js').ProtocolAdapter}
 * @throws {Error} 未接続の場合
 */
export function getAdapter(sessionId) {
	const adapter = connections.get(sessionId);
	if (!adapter) {
		throw new Error(`セッション ${sessionId} は未接続です`);
	}
	return adapter;
}

/**
 * セッションが接続済みかどうかを返す
 * @param {string} sessionId - セッション ID
 * @returns {boolean}
 */
export function isConnected(sessionId) {
	return connections.has(sessionId);
}
