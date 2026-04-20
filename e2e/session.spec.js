import { test, expect } from './fixtures.js';

test.describe('セッション管理', () => {
	test('新規セッションを作成して保存できる', async ({ window }) => {
		// IPC 経由でセッションを作成・保存する
		const session = await window.evaluate(async () => {
			const id = crypto.randomUUID();
			return window.macscp.sessions.save({
				id,
				name: 'E2E テストセッション',
				protocol: 'sftp',
				host: 'localhost',
				port: 2222,
				username: 'testuser',
				authType: 'password',
				privateKeyPath: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
		});

		// 保存されたセッションにIDが付与されること
		expect(session).toBeTruthy();
		expect(session.id).toBeTruthy();
		expect(session.host).toBe('localhost');

		// 一覧に含まれていること
		const list = await window.evaluate(() => window.macscp.sessions.list());
		expect(list.some(s => s.id === session.id)).toBe(true);

		// クリーンアップ
		await window.evaluate((id) => window.macscp.sessions.delete(id), session.id);
	});

	test('保存済みセッション一覧を取得できる', async ({ window }) => {
		// IPC 経由でセッション一覧を取得
		const sessions = await window.evaluate(() => window.macscp.sessions.list());
		expect(Array.isArray(sessions)).toBe(true);
	});

	test('SSH ホスト一覧を取得できる', async ({ window }) => {
		// ~/.ssh/config 読み込みの確認
		const hosts = await window.evaluate(() => window.macscp.ssh.hosts());
		expect(Array.isArray(hosts)).toBe(true);
	});
});
