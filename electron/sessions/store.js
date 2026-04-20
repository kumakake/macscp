import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Store = require('electron-store');

const store = new Store({ name: 'sessions' });

/**
 * セッション一覧を返す
 * @returns {Array<Object>} セッションオブジェクトの配列
 */
export function listSessions() {
	return store.get('sessions', []);
}

/**
 * 指定 ID のセッションを返す
 * @param {string} id - セッション ID
 * @returns {Object|undefined} セッションオブジェクト、存在しない場合は undefined
 */
export function getSession(id) {
	const sessions = listSessions();
	return sessions.find((s) => s.id === id);
}

/**
 * セッションを保存する（新規・更新両方対応）
 * @param {Object} session - セッションオブジェクト
 * @param {string} session.name - 表示名
 * @param {string} session.protocol - プロトコル ('sftp'|'scp'|'ftp'|'ftps'|'webdav'|'s3')
 * @param {string} session.host - ホスト名
 * @param {number} session.port - ポート番号
 * @param {string} session.username - ユーザー名
 * @param {string} session.authType - 認証方式 ('password'|'key'|'agent')
 * @param {string|null} session.privateKeyPath - 秘密鍵パス
 * @returns {Object} 保存したセッションオブジェクト
 */
export function saveSession(session) {
	const sessions = listSessions();
	const now = new Date().toISOString();

	if (session.id) {
		// 既存セッションの更新
		const idx = sessions.findIndex((s) => s.id === session.id);
		if (idx >= 0) {
			sessions[idx] = { ...sessions[idx], ...session, updatedAt: now };
			store.set('sessions', sessions);
			return sessions[idx];
		}
	}

	// 新規セッションの作成
	const newSession = {
		id: crypto.randomUUID(),
		name: session.name ?? '',
		protocol: session.protocol ?? 'sftp',
		host: session.host ?? '',
		port: session.port ?? 22,
		username: session.username ?? '',
		authType: session.authType ?? 'password',
		privateKeyPath: session.privateKeyPath ?? null,
		createdAt: now,
		updatedAt: now,
	};

	sessions.push(newSession);
	store.set('sessions', sessions);
	return newSession;
}

/**
 * 指定 ID のセッションを削除する
 * @param {string} id - セッション ID
 * @returns {boolean} 削除できた場合 true
 */
export function deleteSession(id) {
	const sessions = listSessions();
	const filtered = sessions.filter((s) => s.id !== id);
	if (filtered.length === sessions.length) {
		return false;
	}
	store.set('sessions', filtered);
	return true;
}
