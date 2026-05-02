/**
 * @file directory-transfer.spec.js
 * @description ディレクトリ転送（uploadDirectory / downloadDirectory）の E2E テスト
 *
 * 事前準備:
 *   docker compose up -d sftp
 *
 * テスト実行:
 *   npm run test:e2e -- --grep="ディレクトリ転送"
 */

import { test, expect } from './fixtures.js';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

const SFTP_SESSION = {
	name: 'E2E-Dir-Test-SFTP',
	protocol: 'sftp',
	host: 'localhost',
	port: 2222,
	username: 'testuser',
	authType: 'password',
	privateKeyPath: null,
};

test.describe('ディレクトリ転送（docker compose up -d sftp が必要）', () => {
	let sessionId;

	test.beforeAll(async ({ electronApp }) => {
		const window = await electronApp.firstWindow();
		await window.waitForLoadState('domcontentloaded');
		const session = await window.evaluate(async (sess) => {
			return window.macscp.sessions.save(sess);
		}, { ...SFTP_SESSION, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

		sessionId = session?.id;

		if (sessionId) {
			await window.evaluate(async (id) => {
				return window.macscp.sessions.saveCredential(id, 'testpass');
			}, sessionId);
		}
	});

	test('uploadDirectory でリモートにディレクトリが再帰的に作成される', async ({ window }) => {
		if (!sessionId) test.skip();

		// ローカルにテスト用ディレクトリ構造を作成する
		const localDir = path.join(os.tmpdir(), 'macscp-e2e-upload-dir');
		await fs.mkdir(path.join(localDir, 'sub'), { recursive: true });
		await fs.writeFile(path.join(localDir, 'a.txt'), 'e2e upload test');
		await fs.writeFile(path.join(localDir, 'sub', 'b.txt'), 'e2e upload sub');

		await window.evaluate((id) => window.macscp.files.connect(id), sessionId);

		// ディレクトリをアップロードする
		await window.evaluate(
			([id, local, remote]) => window.macscp.files.uploadDirectory(id, local, remote),
			[sessionId, localDir, '/upload/e2e-dir-test']
		);

		// リモートで構造を確認する
		const rootEntries = await window.evaluate(
			([id, remote]) => window.macscp.files.list(id, remote),
			[sessionId, '/upload/e2e-dir-test']
		);
		const rootNames = rootEntries.map(e => e.name);
		expect(rootNames).toContain('a.txt');
		expect(rootNames).toContain('sub');

		const subEntries = await window.evaluate(
			([id, remote]) => window.macscp.files.list(id, remote),
			[sessionId, '/upload/e2e-dir-test/sub']
		);
		expect(subEntries.map(e => e.name)).toContain('b.txt');

		// 後始末する
		await window.evaluate(
			([id, remote]) => window.macscp.files.rm(id, remote),
			[sessionId, '/upload/e2e-dir-test']
		);
		await window.evaluate((id) => window.macscp.files.disconnect(id), sessionId);
		await fs.rm(localDir, { recursive: true, force: true });
	});

	test('downloadDirectory でリモートディレクトリをローカルに復元できる', async ({ window }) => {
		if (!sessionId) test.skip();

		const uploadLocal = path.join(os.tmpdir(), 'macscp-e2e-dl-src');
		const downloadLocal = path.join(os.tmpdir(), 'macscp-e2e-dl-dest');

		// ローカルにソースを作成してアップロードする
		await fs.mkdir(path.join(uploadLocal, 'sub'), { recursive: true });
		await fs.writeFile(path.join(uploadLocal, 'hello.txt'), 'hello world');
		await fs.writeFile(path.join(uploadLocal, 'sub', 'nested.txt'), 'nested content');

		await window.evaluate((id) => window.macscp.files.connect(id), sessionId);

		await window.evaluate(
			([id, local, remote]) => window.macscp.files.uploadDirectory(id, local, remote),
			[sessionId, uploadLocal, '/upload/e2e-dl-test']
		);

		// ダウンロードする
		await window.evaluate(
			([id, remote, local]) => window.macscp.files.downloadDirectory(id, remote, local),
			[sessionId, '/upload/e2e-dl-test', downloadLocal]
		);

		// 内容を確認する
		const hello = await fs.readFile(path.join(downloadLocal, 'hello.txt'), 'utf8');
		expect(hello).toBe('hello world');

		const nested = await fs.readFile(path.join(downloadLocal, 'sub', 'nested.txt'), 'utf8');
		expect(nested).toBe('nested content');

		// 後始末する
		await window.evaluate(
			([id, remote]) => window.macscp.files.rm(id, remote),
			[sessionId, '/upload/e2e-dl-test']
		);
		await window.evaluate((id) => window.macscp.files.disconnect(id), sessionId);
		await fs.rm(uploadLocal, { recursive: true, force: true });
		await fs.rm(downloadLocal, { recursive: true, force: true });
	});
});
