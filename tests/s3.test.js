/**
 * @file s3.test.js
 * @description S3 アダプタ（MinIO）の統合テスト
 *
 * 事前準備:
 *   docker compose up -d minio
 *
 * テスト実行:
 *   npm test -- tests/s3.test.js
 */

import { createS3Adapter } from '../electron/protocols/s3.js';
import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { writeFile, unlink, readFile } from 'fs/promises';

/** MinIO 接続情報 */
const MINIO_ENDPOINT = 'http://localhost:9000';
const ACCESS_KEY_ID = 'minioadmin';
const SECRET_ACCESS_KEY = 'minioadmin';
const BUCKET = 'test-bucket';

/** テスト用セッション情報 */
const SESSION = {
	host: 'localhost',
	port: 9000,
	username: ACCESS_KEY_ID,
	bucket: BUCKET,
	region: 'us-east-1',
	endpoint: MINIO_ENDPOINT,
};

/** テスト用パスワード（"accessKeyId:secretAccessKey" 形式） */
const PASSWORD = `${ACCESS_KEY_ID}:${SECRET_ACCESS_KEY}`;

/**
 * テスト用バケットを作成する（存在しない場合のみ）
 * @returns {Promise<void>}
 */
async function ensureBucket() {
	const s3 = new S3Client({
		region: 'us-east-1',
		endpoint: MINIO_ENDPOINT,
		forcePathStyle: true,
		credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
	});

	try {
		await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
	} catch (err) {
		// バケットが存在しない場合は作成する
		if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
			await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
		} else {
			throw err;
		}
	}
}

describe('S3 アダプタ（MinIO）', () => {
	/** @type {ReturnType<typeof createS3Adapter>} */
	let adapter;

	beforeAll(async () => {
		// テスト用バケットを事前に作成する
		await ensureBucket();

		adapter = createS3Adapter();
		await adapter.connect(SESSION, PASSWORD);
	});

	afterAll(async () => {
		await adapter.disconnect();
	});

	test('list() でルートの一覧を取得できる', async () => {
		const entries = await adapter.list('/');
		expect(Array.isArray(entries)).toBe(true);
	});

	test('list() の各エントリが FileEntry の形式を持つ', async () => {
		// テスト用ファイルをアップロードしてから確認する
		const tmpPath = '/tmp/macscp-s3-list-test.txt';
		await writeFile(tmpPath, 's3 list test');
		await adapter.upload(tmpPath, '/s3-list-check.txt');

		const entries = await adapter.list('/');
		expect(Array.isArray(entries)).toBe(true);

		for (const entry of entries) {
			expect(typeof entry.name).toBe('string');
			expect(typeof entry.path).toBe('string');
			expect(typeof entry.isDirectory).toBe('boolean');
			expect(typeof entry.size).toBe('number');
		}

		// クリーンアップ
		await adapter.rm('/s3-list-check.txt');
		await unlink(tmpPath);
	});

	test('mkdir() で仮想ディレクトリを作成できる', async () => {
		await adapter.mkdir('/s3-test-dir');
		const entries = await adapter.list('/');
		expect(entries.some((e) => e.name === 's3-test-dir' && e.isDirectory)).toBe(true);
	});

	test('upload() → list() → rm() の一連の操作', async () => {
		const tmpPath = '/tmp/macscp-s3-test.txt';
		const remotePath = '/s3-test-file.txt';

		// テスト用ローカルファイルを作成する
		await writeFile(tmpPath, 's3 test content');

		// アップロードする
		await adapter.upload(tmpPath, remotePath);

		// アップロード後の一覧確認
		const entriesAfterUpload = await adapter.list('/');
		expect(entriesAfterUpload.some((e) => e.name === 's3-test-file.txt')).toBe(true);

		// リモートファイルを削除する
		await adapter.rm(remotePath);

		// 削除後の一覧確認
		const entriesAfterRm = await adapter.list('/');
		expect(entriesAfterRm.some((e) => e.name === 's3-test-file.txt')).toBe(false);

		// 仮想ディレクトリを削除する
		await adapter.rm('/s3-test-dir/');

		// ローカルの一時ファイルを削除する
		await unlink(tmpPath);
	});

	test('download() でリモートファイルをローカルへ取得できる', async () => {
		const tmpUploadPath = '/tmp/macscp-s3-dl-upload.txt';
		const tmpDownloadPath = '/tmp/macscp-s3-dl-download.txt';
		const remotePath = '/s3-dl-test.txt';
		const content = 's3 download test content';

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

	test('rename() でオブジェクトをリネームできる（コピー＋削除）', async () => {
		const tmpPath = '/tmp/macscp-s3-rename-test.txt';
		const remoteSrc = '/s3-rename-src.txt';
		const remoteDst = '/s3-rename-dst.txt';

		await writeFile(tmpPath, 's3 rename test');
		await adapter.upload(tmpPath, remoteSrc);

		await adapter.rename(remoteSrc, remoteDst);

		const entries = await adapter.list('/');
		expect(entries.some((e) => e.name === 's3-rename-src.txt')).toBe(false);
		expect(entries.some((e) => e.name === 's3-rename-dst.txt')).toBe(true);

		// クリーンアップ
		await adapter.rm(remoteDst);
		await unlink(tmpPath);
	});

	test('stat() でファイル情報を取得できる', async () => {
		const tmpPath = '/tmp/macscp-s3-stat-test.txt';
		const remotePath = '/s3-stat-test.txt';

		await writeFile(tmpPath, 's3 stat test content');
		await adapter.upload(tmpPath, remotePath);

		const statResult = await adapter.stat(remotePath);
		expect(statResult.name).toBe('s3-stat-test.txt');
		expect(statResult.isDirectory).toBe(false);
		expect(statResult.size).toBeGreaterThan(0);

		// クリーンアップ
		await adapter.rm(remotePath);
		await unlink(tmpPath);
	});
});
