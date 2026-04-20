import { test, expect } from './fixtures.js';
import path from 'path';
import os from 'os';
import { writeFile, unlink, readFile } from 'fs/promises';

// SFTP テストセッション設定
const SFTP_SESSION = {
	name: 'E2E-Test-SFTP',
	protocol: 'sftp',
	host: 'localhost',
	port: 2222,
	username: 'testuser',
	authType: 'password',
	privateKeyPath: null,
};

test.describe('ファイル転送（docker compose up -d sftp が必要）', () => {
	let sessionId;

	test.beforeAll(async ({ electronApp }) => {
		// テスト用セッションを IPC 経由で作成
		const window = await electronApp.firstWindow();
		const session = await window.evaluate(async (sess) => {
			return window.macscp.sessions.save(sess);
		}, { ...SFTP_SESSION, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

		sessionId = session?.id;

		// Keychain にパスワードを保存
		if (sessionId) {
			await window.evaluate(async (id) => {
				return window.macscp.sessions.saveCredential(id, 'testpass');
			}, sessionId);
		}
	});

	test('SFTP 接続してリモートディレクトリ一覧を取得できる', async ({ window }) => {
		if (!sessionId) test.skip();

		// IPC 経由で接続・一覧取得
		await window.evaluate((id) => window.macscp.files.connect(id), sessionId);
		const entries = await window.evaluate((id) => window.macscp.files.list(id, '/upload'), sessionId);
		expect(Array.isArray(entries)).toBe(true);
		await window.evaluate((id) => window.macscp.files.disconnect(id), sessionId);
	});

	test('ファイルをアップロードしてリモートで確認できる', async ({ window }) => {
		if (!sessionId) test.skip();

		// テスト用ファイルを作成
		const tmpFile = path.join(os.tmpdir(), 'e2e-test-upload.txt');
		await writeFile(tmpFile, 'E2E upload test content');

		await window.evaluate((id) => window.macscp.files.connect(id), sessionId);

		// アップロード
		await window.evaluate(
			([id, local, remote]) => window.macscp.files.upload(id, local, remote),
			[sessionId, tmpFile, '/upload/e2e-test-upload.txt']
		);

		// 確認
		const entries = await window.evaluate((id) => window.macscp.files.list(id, '/upload'), sessionId);
		expect(entries.some(e => e.name === 'e2e-test-upload.txt')).toBe(true);

		// クリーンアップ
		await window.evaluate(
			([id, remote]) => window.macscp.files.rm(id, remote),
			[sessionId, '/upload/e2e-test-upload.txt']
		);
		await window.evaluate((id) => window.macscp.files.disconnect(id), sessionId);
		await unlink(tmpFile);
	});

	test('ファイルをダウンロードして内容を確認できる', async ({ window }) => {
		if (!sessionId) test.skip();

		// まずアップロード
		const tmpUpload = path.join(os.tmpdir(), 'e2e-test-dl-src.txt');
		const tmpDownload = path.join(os.tmpdir(), 'e2e-test-dl-dest.txt');
		await writeFile(tmpUpload, 'E2E download test content');

		await window.evaluate((id) => window.macscp.files.connect(id), sessionId);
		await window.evaluate(
			([id, local, remote]) => window.macscp.files.upload(id, local, remote),
			[sessionId, tmpUpload, '/upload/e2e-dl-test.txt']
		);

		// ダウンロード
		await window.evaluate(
			([id, remote, local]) => window.macscp.files.download(id, remote, local),
			[sessionId, '/upload/e2e-dl-test.txt', tmpDownload]
		);

		// 内容確認
		const content = await readFile(tmpDownload, 'utf-8');
		expect(content).toBe('E2E download test content');

		// クリーンアップ
		await window.evaluate(
			([id, remote]) => window.macscp.files.rm(id, remote),
			[sessionId, '/upload/e2e-dl-test.txt']
		);
		await window.evaluate((id) => window.macscp.files.disconnect(id), sessionId);
		await unlink(tmpUpload).catch(() => {});
		await unlink(tmpDownload).catch(() => {});
	});
});
