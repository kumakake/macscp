/**
 * @file sessions-ipc.spec.js
 * @description セッション IPC ハンドラの E2E テスト
 *
 * Electron プロセス経由で window.macscp.sessions.* を呼び出し、
 * セッションの CRUD と Keychain 連携を検証する。
 *
 * テスト実行:
 *   npm run test:e2e
 */

import { test, expect } from './fixtures.js';

/** テスト中に作成したセッション ID を追跡する */
const createdIds = [];

test.afterAll(async ({ window }) => {
	for (const id of createdIds) {
		await window.evaluate((sid) => window.macscp.sessions.delete(sid), id).catch(() => {});
	}
});

test.describe('sessions IPC ハンドラ', () => {
	test('sessions:list — 配列を返す', async ({ window }) => {
		const list = await window.evaluate(() => window.macscp.sessions.list());
		expect(Array.isArray(list)).toBe(true);
	});

	test('sessions:save (新規) — セッションを作成して ID が返る', async ({ window }) => {
		const saved = await window.evaluate(() =>
			window.macscp.sessions.save({
				name: 'IPC-テスト-新規',
				protocol: 'sftp',
				host: 'ipc.example.com',
				port: 22,
				username: 'testuser',
				authType: 'password',
				privateKeyPath: null,
			})
		);
		createdIds.push(saved.id);

		expect(typeof saved.id).toBe('string');
		expect(saved.name).toBe('IPC-テスト-新規');
		expect(saved.host).toBe('ipc.example.com');
	});

	test('sessions:get — 保存したセッションを ID で取得できる', async ({ window }) => {
		const saved = await window.evaluate(() =>
			window.macscp.sessions.save({
				name: 'IPC-テスト-get',
				protocol: 'sftp',
				host: 'get.example.com',
				port: 22,
				username: 'u',
				authType: 'password',
				privateKeyPath: null,
			})
		);
		createdIds.push(saved.id);

		const found = await window.evaluate((id) => window.macscp.sessions.get(id), saved.id);
		expect(found).not.toBeNull();
		expect(found.id).toBe(saved.id);
	});

	test('sessions:save (更新) — 既存セッションを上書きできる', async ({ window }) => {
		const saved = await window.evaluate(() =>
			window.macscp.sessions.save({
				name: 'IPC-テスト-更新前',
				protocol: 'sftp',
				host: 'before.example.com',
				port: 22,
				username: 'u',
				authType: 'password',
				privateKeyPath: null,
			})
		);
		createdIds.push(saved.id);

		const updated = await window.evaluate((s) =>
			window.macscp.sessions.save({ ...s, name: 'IPC-テスト-更新後', host: 'after.example.com' }),
			saved
		);

		expect(updated.id).toBe(saved.id);
		expect(updated.name).toBe('IPC-テスト-更新後');
		expect(updated.host).toBe('after.example.com');
	});

	test('sessions:delete — セッションを削除すると list に含まれなくなる', async ({ window }) => {
		const saved = await window.evaluate(() =>
			window.macscp.sessions.save({
				name: 'IPC-テスト-削除',
				protocol: 'sftp',
				host: 'del.example.com',
				port: 22,
				username: 'u',
				authType: 'password',
				privateKeyPath: null,
			})
		);

		await window.evaluate((id) => window.macscp.sessions.delete(id), saved.id);

		const list = await window.evaluate(() => window.macscp.sessions.list());
		expect(list.find(s => s.id === saved.id)).toBeUndefined();
	});

	test('sessions:saveCredential + getCredential — Keychain に保存・取得できる', async ({ window }) => {
		const saved = await window.evaluate(() =>
			window.macscp.sessions.save({
				name: 'IPC-テスト-Keychain',
				protocol: 'sftp',
				host: 'keychain.example.com',
				port: 22,
				username: 'u',
				authType: 'password',
				privateKeyPath: null,
			})
		);
		createdIds.push(saved.id);

		await window.evaluate((id) => window.macscp.sessions.saveCredential(id, 'test-secret-pw'), saved.id);

		const cred = await window.evaluate((id) => window.macscp.sessions.getCredential(id), saved.id);
		expect(cred).toBe('test-secret-pw');
	});

	test('sessions:delete — 削除時に Keychain のシークレットも連動削除される', async ({ window }) => {
		const saved = await window.evaluate(() =>
			window.macscp.sessions.save({
				name: 'IPC-テスト-Keychain削除',
				protocol: 'sftp',
				host: 'del-cred.example.com',
				port: 22,
				username: 'u',
				authType: 'password',
				privateKeyPath: null,
			})
		);

		await window.evaluate((id) => window.macscp.sessions.saveCredential(id, 'will-be-deleted'), saved.id);
		await window.evaluate((id) => window.macscp.sessions.delete(id), saved.id);

		// 削除後は getCredential が null を返す
		const cred = await window.evaluate((id) => window.macscp.sessions.getCredential(id), saved.id);
		expect(cred).toBeNull();
	});

	test('ssh:privateKeys — 配列を返す（~/.ssh/id_* が 0 件でも動く）', async ({ window }) => {
		const keys = await window.evaluate(() => window.macscp.ssh.privateKeys());
		expect(Array.isArray(keys)).toBe(true);
	});
});
