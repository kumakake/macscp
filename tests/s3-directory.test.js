/**
 * @file s3-directory.test.js
 * @description S3 アダプタのディレクトリ転送（putDirectory / getDirectory）統合テスト
 *
 * 事前準備:
 *   docker compose up -d minio
 *
 * テスト実行:
 *   npm test -- --testPathPattern=s3-directory
 */

import { createS3Adapter } from '../electron/protocols/s3.js';
import {
	S3Client,
	CreateBucketCommand,
	HeadBucketCommand,
	DeleteObjectCommand,
	ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** テスト用一時ディレクトリのベースパス */
const TMP_BASE = path.join(__dirname, '..', 'tmp');

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

/**
 * 指定プレフィックス配下のオブジェクトを全て削除する後始末ヘルパ
 * @param {S3Client} s3Client - S3Client インスタンス
 * @param {string} prefix - 削除対象のプレフィックス
 * @returns {Promise<void>}
 */
async function cleanupRemotePrefix(s3Client, prefix) {
	try {
		let continuationToken = undefined;
		do {
			const cmd = new ListObjectsV2Command({
				Bucket: BUCKET,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			});
			const res = await s3Client.send(cmd);

			for (const obj of (res.Contents ?? [])) {
				await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
			}

			continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
		} while (continuationToken);
	} catch {
		// クリーンアップ失敗は無視する
	}
}

describe('S3 ディレクトリ転送', () => {
	/** @type {ReturnType<typeof createS3Adapter>} */
	let adapter;
	/** @type {S3Client} */
	let s3Client;

	beforeAll(async () => {
		// テスト用バケットを事前に作成する
		await ensureBucket();

		// 後始末用に S3Client を直接保持する
		s3Client = new S3Client({
			region: 'us-east-1',
			endpoint: MINIO_ENDPOINT,
			forcePathStyle: true,
			credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
		});

		adapter = createS3Adapter();
		await adapter.connect(SESSION, PASSWORD);

		// tmp ベースディレクトリを作成する
		await fs.mkdir(TMP_BASE, { recursive: true });
	});

	afterAll(async () => {
		// tmp/ ディレクトリを後始末する
		try {
			await fs.rm(TMP_BASE, { recursive: true, force: true });
		} catch {
			// クリーンアップ失敗は無視する
		}
		await adapter.disconnect();
	});

	describe('Round-trip: putDirectory → getDirectory', () => {
		const uploadLocalDir = path.join(TMP_BASE, 'macscp-s3-dir');
		const downloadLocalDir = path.join(TMP_BASE, 'macscp-s3-dir-downloaded');
		const remotePrefix = 's3-dir-test';

		beforeAll(async () => {
			// テスト用ローカルディレクトリを構築する
			await fs.mkdir(path.join(uploadLocalDir, 'sub'), { recursive: true });
			await fs.writeFile(path.join(uploadLocalDir, 'a.txt'), 'hello from a.txt');
			await fs.writeFile(path.join(uploadLocalDir, 'sub', 'b.txt'), 'hello from sub/b.txt');
		});

		afterAll(async () => {
			// リモートオブジェクトを後始末する
			await cleanupRemotePrefix(s3Client, `${remotePrefix}/`);
		});

		test('putDirectory でリモートにオブジェクトがアップロードされる', async () => {
			await adapter.putDirectory(uploadLocalDir, remotePrefix);

			// アップロード後のオブジェクト一覧を確認する
			const cmd = new ListObjectsV2Command({
				Bucket: BUCKET,
				Prefix: `${remotePrefix}/`,
			});
			const res = await s3Client.send(cmd);
			const keys = (res.Contents ?? []).map((o) => o.Key);

			expect(keys).toContain(`${remotePrefix}/a.txt`);
			expect(keys).toContain(`${remotePrefix}/sub/b.txt`);
		});

		test('getDirectory でローカルにファイルが復元され内容が一致する', async () => {
			await adapter.getDirectory(remotePrefix, downloadLocalDir);

			// ファイルが存在することを確認する
			const aTxt = await fs.readFile(path.join(downloadLocalDir, 'a.txt'), 'utf8');
			expect(aTxt).toBe('hello from a.txt');

			const bTxt = await fs.readFile(path.join(downloadLocalDir, 'sub', 'b.txt'), 'utf8');
			expect(bTxt).toBe('hello from sub/b.txt');
		});
	});

	describe('進捗コールバック', () => {
		const progressLocalDir = path.join(TMP_BASE, 'macscp-s3-progress-dir');
		const progressDownloadDir = path.join(TMP_BASE, 'macscp-s3-progress-dir-downloaded');
		const remoteProgressPrefix = 's3-progress-test';

		beforeAll(async () => {
			// テスト用ファイルを複数作成する
			await fs.mkdir(path.join(progressLocalDir, 'sub'), { recursive: true });
			await fs.writeFile(path.join(progressLocalDir, 'file1.txt'), 'content of file1');
			await fs.writeFile(path.join(progressLocalDir, 'file2.txt'), 'content of file2');
			await fs.writeFile(path.join(progressLocalDir, 'sub', 'file3.txt'), 'content of file3');
		});

		afterAll(async () => {
			// リモートオブジェクトを後始末する
			await cleanupRemotePrefix(s3Client, `${remoteProgressPrefix}/`);
		});

		test('putDirectory の onProgress が呼ばれ file-done が totalFiles 回以上発火する', async () => {
			const events = [];

			await adapter.putDirectory(progressLocalDir, remoteProgressPrefix, (progress) => {
				events.push({ ...progress });
			});

			// overall が最低 1 回呼ばれることを確認する
			const overallEvents = events.filter((e) => e.kind === 'overall');
			expect(overallEvents.length).toBeGreaterThanOrEqual(1);

			// file-done がファイル数（3 個）以上呼ばれることを確認する
			const doneEvents = events.filter((e) => e.kind === 'file-done');
			expect(doneEvents.length).toBeGreaterThanOrEqual(3);

			// processedFiles が単調増加することを確認する
			let prevProcessedFiles = -1;
			for (const e of doneEvents) {
				expect(e.processedFiles).toBeGreaterThan(prevProcessedFiles);
				prevProcessedFiles = e.processedFiles;
			}
		});

		test('getDirectory の onProgress が呼ばれ file-done が totalFiles 回以上発火する', async () => {
			const events = [];

			await adapter.getDirectory(remoteProgressPrefix, progressDownloadDir, (progress) => {
				events.push({ ...progress });
			});

			// overall が最低 1 回呼ばれることを確認する
			const overallEvents = events.filter((e) => e.kind === 'overall');
			expect(overallEvents.length).toBeGreaterThanOrEqual(1);

			// file-done がファイル数（3 個）以上呼ばれることを確認する
			const doneEvents = events.filter((e) => e.kind === 'file-done');
			expect(doneEvents.length).toBeGreaterThanOrEqual(3);

			// processedFiles が単調増加することを確認する
			let prevProcessedFiles = -1;
			for (const e of doneEvents) {
				expect(e.processedFiles).toBeGreaterThan(prevProcessedFiles);
				prevProcessedFiles = e.processedFiles;
			}
		});
	});
});
