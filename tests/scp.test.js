/**
 * @file scp.test.js
 * @description SCP アダプタの統合テスト
 * docker compose up -d sftp してから実行する
 */

import { createScpAdapter } from '../electron/protocols/scp.js';

const SESSION = {
	host: 'localhost',
	port: 2222,
	username: 'testuser',
	authType: 'password',
	privateKeyPath: null,
};

describe('SCP アダプタ', () => {
	let adapter;

	beforeAll(async () => {
		adapter = createScpAdapter();
		await adapter.connect(SESSION, 'testpass');
	}, 15000);

	afterAll(async () => {
		await adapter.disconnect();
	});

	test('list() でディレクトリ一覧を取得できる', async () => {
		const entries = await adapter.list('/upload');
		expect(Array.isArray(entries)).toBe(true);
	});

	test('upload() → list() → rm() の一連の操作', async () => {
		const { writeFile, unlink } = await import('fs/promises');
		const tmpPath = '/tmp/macscp-scp-test.txt';
		await writeFile(tmpPath, 'scp test content');
		await adapter.upload(tmpPath, '/upload/scp-test.txt');
		const entries = await adapter.list('/upload');
		expect(entries.some(e => e.name === 'scp-test.txt')).toBe(true);
		await adapter.rm('/upload/scp-test.txt');
		await unlink(tmpPath);
	}, 15000);
});
