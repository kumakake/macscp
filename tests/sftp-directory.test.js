/**
 * @file sftp-directory.test.js
 * @description SFTP アダプタのディレクトリ転送（putDirectory / getDirectory）統合テスト
 *
 * 事前準備:
 *   docker compose up -d sftp
 *
 * テスト実行:
 *   npm test -- --testPathPattern=sftp-directory
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSftpAdapter } from '../electron/protocols/sftp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** テスト用一時ディレクトリのベースパス（プロジェクトルート以下）*/
const TMP_BASE = path.join(__dirname, '..', 'tmp');

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

/**
 * リモートディレクトリを再帰的に削除するヘルパ
 * @param {ReturnType<typeof createSftpAdapter>} adapter
 * @param {string} remotePath
 */
async function cleanupRemote(adapter, remotePath) {
	try {
		await adapter.rm(remotePath);
	} catch {
		// 存在しない場合はスキップする
	}
}

describe('SFTP ディレクトリ転送', () => {
	/** @type {ReturnType<typeof createSftpAdapter>} */
	let adapter;

	beforeAll(async () => {
		adapter = createSftpAdapter();
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
		const uploadLocalDir = path.join(TMP_BASE, 'macscp-sftp-dir');
		const downloadLocalDir = path.join(TMP_BASE, 'macscp-sftp-dir-downloaded');
		const remoteDir = '/upload/sftp-dir-test';

		beforeAll(async () => {
			// テスト用ローカルディレクトリを構築する
			await fs.mkdir(path.join(uploadLocalDir, 'sub', 'empty'), { recursive: true });
			await fs.writeFile(path.join(uploadLocalDir, 'a.txt'), 'hello from a.txt');
			await fs.writeFile(path.join(uploadLocalDir, 'sub', 'b.txt'), 'hello from sub/b.txt');
		});

		afterAll(async () => {
			// リモートを後始末する
			await cleanupRemote(adapter, remoteDir);
		});

		test('putDirectory でリモートにファイル・ディレクトリが作成される', async () => {
			await adapter.putDirectory(uploadLocalDir, remoteDir);

			// リモートルートの一覧確認
			const rootEntries = await adapter.list(remoteDir);
			const names = rootEntries.map((e) => e.name);
			expect(names).toContain('a.txt');
			expect(names).toContain('sub');

			// sub/ 配下の確認
			const subEntries = await adapter.list(remoteDir + '/sub');
			const subNames = subEntries.map((e) => e.name);
			expect(subNames).toContain('b.txt');
			expect(subNames).toContain('empty');
		});

		test('getDirectory でローカルにファイルが復元され内容が一致する', async () => {
			await adapter.getDirectory(remoteDir, downloadLocalDir);

			// ファイルが存在することを確認する
			const aTxt = await fs.readFile(path.join(downloadLocalDir, 'a.txt'), 'utf8');
			expect(aTxt).toBe('hello from a.txt');

			const bTxt = await fs.readFile(path.join(downloadLocalDir, 'sub', 'b.txt'), 'utf8');
			expect(bTxt).toBe('hello from sub/b.txt');

			// empty ディレクトリが存在することを確認する
			const emptyStat = await fs.stat(path.join(downloadLocalDir, 'sub', 'empty'));
			expect(emptyStat.isDirectory()).toBe(true);
		});
	});

	describe('空ディレクトリのアップロード', () => {
		const emptyLocalDir = path.join(TMP_BASE, 'empty-dir');
		const remoteEmptyDir = '/upload/sftp-empty-test';

		beforeAll(async () => {
			// 空のディレクトリを作成する
			await fs.mkdir(emptyLocalDir, { recursive: true });
		});

		afterAll(async () => {
			await cleanupRemote(adapter, remoteEmptyDir);
		});

		test('空ディレクトリをアップロードするとリモートにディレクトリが作成される', async () => {
			await adapter.putDirectory(emptyLocalDir, remoteEmptyDir);

			// リモートディレクトリが存在することを stat で確認する
			const statResult = await adapter.stat(remoteEmptyDir);
			expect(statResult.isDirectory).toBe(true);
		});
	});

	describe('進捗コールバック', () => {
		const progressLocalDir = path.join(TMP_BASE, 'progress-dir');
		const remoteProgressDir = '/upload/sftp-progress-test';
		const downloadProgressDir = path.join(TMP_BASE, 'progress-dir-downloaded');

		beforeAll(async () => {
			// テスト用ファイルを複数作成する
			await fs.mkdir(path.join(progressLocalDir, 'sub'), { recursive: true });
			await fs.writeFile(path.join(progressLocalDir, 'file1.txt'), 'content of file1');
			await fs.writeFile(path.join(progressLocalDir, 'file2.txt'), 'content of file2');
			await fs.writeFile(path.join(progressLocalDir, 'sub', 'file3.txt'), 'content of file3');
		});

		afterAll(async () => {
			await cleanupRemote(adapter, remoteProgressDir);
		});

		test('putDirectory の onProgress が呼ばれ file-done が totalFiles 回以上発火する', async () => {
			const events = [];

			await adapter.putDirectory(progressLocalDir, remoteProgressDir, (progress) => {
				events.push({ ...progress });
			});

			// overall が最低 1 回呼ばれることを確認する
			const overallEvents = events.filter((e) => e.kind === 'overall');
			expect(overallEvents.length).toBeGreaterThanOrEqual(1);

			// file-done がファイル数（3 個）以上呼ばれることを確認する
			const donEvents = events.filter((e) => e.kind === 'file-done');
			expect(donEvents.length).toBeGreaterThanOrEqual(3);

			// processedFiles が単調増加することを確認する
			let prevProcessedFiles = -1;
			for (const e of donEvents) {
				expect(e.processedFiles).toBeGreaterThan(prevProcessedFiles);
				prevProcessedFiles = e.processedFiles;
			}
		});

		test('getDirectory の onProgress が呼ばれ file-done が totalFiles 回以上発火する', async () => {
			const events = [];

			await adapter.getDirectory(remoteProgressDir, downloadProgressDir, (progress) => {
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
