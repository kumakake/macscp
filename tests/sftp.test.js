/**
 * @file sftp.test.js
 * @description SFTP アダプタの統合テスト
 *
 * 事前準備:
 *   docker compose up -d sftp
 *
 * テスト実行:
 *   npm test
 */

import { createSftpAdapter } from '../electron/protocols/sftp.js';

/** テスト用セッション情報（docker-compose の atmoz/sftp コンテナに接続） */
const SESSION = {
	host: 'localhost',
	port: 2222,
	username: 'testuser',
	authType: 'password',
	privateKeyPath: null,
};

/** テスト用パスワード */
const PASSWORD = 'testpass';

describe('SFTP アダプタ', () => {
	/** @type {import('../electron/protocols/sftp.js').createSftpAdapter} */
	let adapter;

	beforeAll(async () => {
		adapter = createSftpAdapter();
		await adapter.connect(SESSION, PASSWORD);
	});

	afterAll(async () => {
		await adapter.disconnect();
	});

	test('list() でディレクトリ一覧を取得できる', async () => {
		const entries = await adapter.list('/upload');
		expect(Array.isArray(entries)).toBe(true);
	});

	test('list() の各エントリが FileEntry の形式を持つ', async () => {
		const entries = await adapter.list('/upload');
		for (const entry of entries) {
			expect(typeof entry.name).toBe('string');
			expect(typeof entry.path).toBe('string');
			expect(typeof entry.isDirectory).toBe('boolean');
			expect(typeof entry.size).toBe('number');
		}
	});

	test('mkdir() でディレクトリを作成できる', async () => {
		await adapter.mkdir('/upload/test-dir');
		const entries = await adapter.list('/upload');
		expect(entries.some((e) => e.name === 'test-dir')).toBe(true);
	});

	test('upload() → list() → rm() の一連の操作', async () => {
		const { writeFile, unlink } = await import('fs/promises');
		const tmpPath = '/tmp/macscp-test.txt';
		const remoteFilePath = '/upload/macscp-test.txt';

		// テスト用ローカルファイルを作成する
		await writeFile(tmpPath, 'test content');

		// アップロードする
		await adapter.upload(tmpPath, remoteFilePath);

		// アップロード後の一覧確認
		const entriesAfterUpload = await adapter.list('/upload');
		expect(entriesAfterUpload.some((e) => e.name === 'macscp-test.txt')).toBe(true);

		// リモートファイルを削除する
		await adapter.rm(remoteFilePath);

		// 削除後の一覧確認
		const entriesAfterRm = await adapter.list('/upload');
		expect(entriesAfterRm.some((e) => e.name === 'macscp-test.txt')).toBe(false);

		// テスト用ディレクトリを削除する
		await adapter.rm('/upload/test-dir');

		// ローカルの一時ファイルを削除する
		await unlink(tmpPath);
	});

	test('stat() でファイル情報を取得できる', async () => {
		const { writeFile, unlink } = await import('fs/promises');
		const tmpPath = '/tmp/macscp-stat-test.txt';
		const remoteFilePath = '/upload/macscp-stat-test.txt';

		await writeFile(tmpPath, 'stat test content');
		await adapter.upload(tmpPath, remoteFilePath);

		const statResult = await adapter.stat(remoteFilePath);
		expect(statResult.name).toBe('macscp-stat-test.txt');
		expect(statResult.isDirectory).toBe(false);
		expect(statResult.size).toBeGreaterThan(0);

		// クリーンアップ
		await adapter.rm(remoteFilePath);
		await unlink(tmpPath);
	});

	test('rename() でファイルをリネームできる', async () => {
		const { writeFile, unlink } = await import('fs/promises');
		const tmpPath = '/tmp/macscp-rename-test.txt';
		const remoteSrc = '/upload/rename-src.txt';
		const remoteDst = '/upload/rename-dst.txt';

		await writeFile(tmpPath, 'rename test');
		await adapter.upload(tmpPath, remoteSrc);

		await adapter.rename(remoteSrc, remoteDst);

		const entries = await adapter.list('/upload');
		expect(entries.some((e) => e.name === 'rename-src.txt')).toBe(false);
		expect(entries.some((e) => e.name === 'rename-dst.txt')).toBe(true);

		// クリーンアップ
		await adapter.rm(remoteDst);
		await unlink(tmpPath);
	});

	test('download() でリモートファイルをローカルへ取得できる', async () => {
		const { writeFile, unlink, readFile } = await import('fs/promises');
		const tmpUploadPath = '/tmp/macscp-dl-upload.txt';
		const tmpDownloadPath = '/tmp/macscp-dl-download.txt';
		const remoteFilePath = '/upload/macscp-dl-test.txt';
		const content = 'download test content';

		await writeFile(tmpUploadPath, content);
		await adapter.upload(tmpUploadPath, remoteFilePath);

		await adapter.download(remoteFilePath, tmpDownloadPath);

		const downloaded = await readFile(tmpDownloadPath, 'utf8');
		expect(downloaded).toBe(content);

		// クリーンアップ
		await adapter.rm(remoteFilePath);
		await unlink(tmpUploadPath);
		await unlink(tmpDownloadPath);
	});
});
