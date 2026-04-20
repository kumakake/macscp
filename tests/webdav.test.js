/**
 * @file webdav.test.js
 * @description WebDAV アダプタの統合テスト
 * docker compose up -d webdav してから実行する
 */

import { createWebdavAdapter } from '../electron/protocols/webdav.js';

const SESSION = {
	host: 'localhost',
	port: 8080,
	username: 'testuser',
	authType: 'password',
};

describe('WebDAV アダプタ', () => {
	let adapter;

	beforeAll(async () => {
		adapter = createWebdavAdapter();
		await adapter.connect(SESSION, 'testpass');
	}, 10000);

	afterAll(async () => {
		await adapter.disconnect();
	});

	test('list() でルートディレクトリ一覧を取得できる', async () => {
		const entries = await adapter.list('/');
		expect(Array.isArray(entries)).toBe(true);
	});

	test('mkdir() → list() → rm() の一連の操作', async () => {
		await adapter.mkdir('/webdav-test-dir');
		const entries = await adapter.list('/');
		expect(entries.some(e => e.name === 'webdav-test-dir')).toBe(true);
		await adapter.rm('/webdav-test-dir');
	}, 10000);
});
