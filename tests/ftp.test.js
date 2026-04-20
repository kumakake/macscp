/**
 * @file ftp.test.js
 * @description FTP アダプタの統合テスト
 *
 * 事前準備:
 *   docker compose up -d ftp
 *
 * テスト実行:
 *   npm test -- tests/ftp.test.js
 */

import { createFtpAdapter } from '../electron/protocols/ftp.js';
import { writeFile, unlink, readFile } from 'fs/promises';

/** テスト用セッション情報（docker-compose の delfer/alpine-ftp-server コンテナに接続） */
const SESSION = {
	host: 'localhost',
	port: 21,
	username: 'testuser',
};

/** テスト用パスワード */
const PASSWORD = 'testpass';

describe('FTP アダプタ', () => {
	/** @type {ReturnType<typeof createFtpAdapter>} */
	let adapter;

	beforeAll(async () => {
		adapter = createFtpAdapter({ secure: false });
		await adapter.connect(SESSION, PASSWORD);
	});

	afterAll(async () => {
		await adapter.disconnect();
	});

	test('list() でディレクトリ一覧を取得できる', async () => {
		const entries = await adapter.list('/home/testuser');
		expect(Array.isArray(entries)).toBe(true);
	});

	test('list() の各エントリが FileEntry の形式を持つ', async () => {
		const entries = await adapter.list('/home/testuser');
		for (const entry of entries) {
			expect(typeof entry.name).toBe('string');
			expect(typeof entry.path).toBe('string');
			expect(typeof entry.isDirectory).toBe('boolean');
			expect(typeof entry.size).toBe('number');
		}
	});

	test('mkdir() でディレクトリを作成できる', async () => {
		await adapter.mkdir('ftp-test-dir');
		const entries = await adapter.list('/home/testuser');
		expect(entries.some((e) => e.name === 'ftp-test-dir')).toBe(true);
	});

	test('upload() → list() → rm() の一連の操作', async () => {
		const tmpPath = '/tmp/macscp-ftp-test.txt';
		const remotePath = 'ftp-test-file.txt';

		// テスト用ローカルファイルを作成する
		await writeFile(tmpPath, 'ftp test content');

		// アップロードする
		await adapter.upload(tmpPath, remotePath);

		// アップロード後の一覧確認
		const entriesAfterUpload = await adapter.list('/home/testuser');
		expect(entriesAfterUpload.some((e) => e.name === 'ftp-test-file.txt')).toBe(true);

		// リモートファイルを削除する
		await adapter.rm(remotePath);

		// 削除後の一覧確認
		const entriesAfterRm = await adapter.list('/home/testuser');
		expect(entriesAfterRm.some((e) => e.name === 'ftp-test-file.txt')).toBe(false);

		// 作成したディレクトリを削除する
		await adapter.rm('ftp-test-dir');

		// ローカルの一時ファイルを削除する
		await unlink(tmpPath);
	});

	test('download() でリモートファイルをローカルへ取得できる', async () => {
		const tmpUploadPath = '/tmp/macscp-ftp-dl-upload.txt';
		const tmpDownloadPath = '/tmp/macscp-ftp-dl-download.txt';
		const remotePath = 'ftp-dl-test.txt';
		const content = 'ftp download test content';

		await writeFile(tmpUploadPath, content);
		await adapter.upload(tmpUploadPath, remotePath);

		await adapter.download(remotePath, tmpDownloadPath);

		const downloaded = await readFile(tmpDownloadPath, 'utf8');
		expect(downloaded).toBe(content);

		// クリーンアップ
		await adapter.rm(remotePath);
		await unlink(tmpUploadPath);
		await unlink(tmpDownloadPath);
	});

	test('rename() でファイルをリネームできる', async () => {
		const tmpPath = '/tmp/macscp-ftp-rename-test.txt';
		const remoteSrc = 'ftp-rename-src.txt';
		const remoteDst = 'ftp-rename-dst.txt';

		await writeFile(tmpPath, 'ftp rename test');
		await adapter.upload(tmpPath, remoteSrc);

		await adapter.rename(remoteSrc, remoteDst);

		const entries = await adapter.list('/home/testuser');
		expect(entries.some((e) => e.name === 'ftp-rename-src.txt')).toBe(false);
		expect(entries.some((e) => e.name === 'ftp-rename-dst.txt')).toBe(true);

		// クリーンアップ
		await adapter.rm(remoteDst);
		await unlink(tmpPath);
	});

	test('stat() でファイル情報を取得できる', async () => {
		const tmpPath = '/tmp/macscp-ftp-stat-test.txt';
		const remotePath = 'ftp-stat-test.txt';

		await writeFile(tmpPath, 'ftp stat test content');
		await adapter.upload(tmpPath, remotePath);

		const statResult = await adapter.stat(remotePath);
		expect(statResult.name).toBe('ftp-stat-test.txt');
		expect(statResult.isDirectory).toBe(false);
		expect(statResult.size).toBeGreaterThan(0);

		// クリーンアップ
		await adapter.rm(remotePath);
		await unlink(tmpPath);
	});
});
