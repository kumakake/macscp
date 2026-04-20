/**
 * @file sessions-store.test.js
 * @description electron/sessions/store.js の単体テスト
 *
 * 実際の sessions.json（electron-store）に対して読み書きを行う統合テスト。
 * テスト前後でストアの既存データを退避・復元する。
 */

import { listSessions, getSession, saveSession, deleteSession } from '../electron/sessions/store.js';

/** テスト中に作成したセッション ID を追跡する */
const createdIds = [];

afterAll(async () => {
	// テストで作成したセッションをすべて削除してクリーンアップ
	for (const id of createdIds) {
		deleteSession(id);
	}
});

describe('listSessions()', () => {
	test('配列を返す', () => {
		const result = listSessions();
		expect(Array.isArray(result)).toBe(true);
	});
});

describe('saveSession() + getSession()', () => {
	test('新規セッションを保存して取得できる', () => {
		const saved = saveSession({
			name: 'テスト-新規',
			protocol: 'sftp',
			host: 'test.example.com',
			port: 22,
			username: 'testuser',
			authType: 'password',
			privateKeyPath: null,
		});
		createdIds.push(saved.id);

		expect(typeof saved.id).toBe('string');
		expect(saved.name).toBe('テスト-新規');
		expect(saved.host).toBe('test.example.com');
		expect(typeof saved.createdAt).toBe('string');
		expect(typeof saved.updatedAt).toBe('string');
	});

	test('getSession() で保存したセッションを ID から取得できる', () => {
		const saved = saveSession({
			name: 'テスト-取得用',
			protocol: 'sftp',
			host: 'get.example.com',
			port: 22,
			username: 'user',
			authType: 'password',
			privateKeyPath: null,
		});
		createdIds.push(saved.id);

		const found = getSession(saved.id);
		expect(found).toBeDefined();
		expect(found.id).toBe(saved.id);
		expect(found.host).toBe('get.example.com');
	});

	test('存在しない ID を getSession() すると undefined を返す', () => {
		const result = getSession('nonexistent-id-12345');
		expect(result).toBeUndefined();
	});

	test('既存セッションを上書き更新できる', () => {
		const saved = saveSession({
			name: 'テスト-更新前',
			protocol: 'sftp',
			host: 'before.example.com',
			port: 22,
			username: 'user',
			authType: 'password',
			privateKeyPath: null,
		});
		createdIds.push(saved.id);

		const updated = saveSession({ ...saved, name: 'テスト-更新後', host: 'after.example.com' });

		expect(updated.id).toBe(saved.id);
		expect(updated.name).toBe('テスト-更新後');
		expect(updated.host).toBe('after.example.com');
		// updatedAt が createdAt 以降であること
		expect(new Date(updated.updatedAt) >= new Date(updated.createdAt)).toBe(true);
	});

	test('listSessions() に保存したセッションが含まれる', () => {
		const saved = saveSession({
			name: 'テスト-一覧確認',
			protocol: 'ftp',
			host: 'list.example.com',
			port: 21,
			username: 'ftpuser',
			authType: 'password',
			privateKeyPath: null,
		});
		createdIds.push(saved.id);

		const list = listSessions();
		const found = list.find(s => s.id === saved.id);
		expect(found).toBeDefined();
		expect(found.protocol).toBe('ftp');
	});

	test('デフォルト値が適用される（port / authType / privateKeyPath）', () => {
		const saved = saveSession({ name: 'テスト-デフォルト', protocol: 'sftp', host: 'x.com', username: 'u' });
		createdIds.push(saved.id);

		expect(saved.port).toBe(22);
		expect(saved.authType).toBe('password');
		expect(saved.privateKeyPath).toBeNull();
	});
});

describe('deleteSession()', () => {
	test('存在するセッションを削除すると true を返す', () => {
		const saved = saveSession({
			name: 'テスト-削除対象',
			protocol: 'sftp',
			host: 'delete.example.com',
			port: 22,
			username: 'user',
			authType: 'password',
			privateKeyPath: null,
		});

		const result = deleteSession(saved.id);
		expect(result).toBe(true);

		// 削除後は取得できない
		expect(getSession(saved.id)).toBeUndefined();
	});

	test('存在しない ID を削除すると false を返す', () => {
		const result = deleteSession('nonexistent-id-99999');
		expect(result).toBe(false);
	});

	test('削除後に listSessions() にそのセッションが含まれない', () => {
		const saved = saveSession({
			name: 'テスト-削除後一覧',
			protocol: 'sftp',
			host: 'gone.example.com',
			port: 22,
			username: 'user',
			authType: 'password',
			privateKeyPath: null,
		});

		deleteSession(saved.id);

		const list = listSessions();
		expect(list.find(s => s.id === saved.id)).toBeUndefined();
	});

	test('削除は対象のセッションのみに影響する（他セッションは残る）', () => {
		const a = saveSession({ name: 'テスト-A', protocol: 'sftp', host: 'a.example.com', port: 22, username: 'u', authType: 'password', privateKeyPath: null });
		const b = saveSession({ name: 'テスト-B', protocol: 'sftp', host: 'b.example.com', port: 22, username: 'u', authType: 'password', privateKeyPath: null });
		createdIds.push(b.id);

		deleteSession(a.id);

		expect(getSession(a.id)).toBeUndefined();
		expect(getSession(b.id)).toBeDefined();
	});
});
