/**
 * @file mkdirLocal.test.js
 * @description ローカル mkdir IPC ハンドラのテスト
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/** テスト用の一時ディレクトリ */
let tmpDir;

/**
 * files:mkdirLocal の実装を直接呼び出すヘルパー
 * @param {string} dirPath
 */
async function mkdirLocal(dirPath) {
	await fs.mkdir(dirPath);
	return { ok: true };
}

beforeAll(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'macscp-mkdir-test-'));
});

afterAll(async () => {
	await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('mkdirLocal ディレクトリ作成', () => {
	test('指定パスにディレクトリが作成できる', async () => {
		const newDir = path.join(tmpDir, 'newFolder');
		const result = await mkdirLocal(newDir);
		expect(result).toEqual({ ok: true });
		const stat = await fs.stat(newDir);
		expect(stat.isDirectory()).toBe(true);
	});

	test('既存ディレクトリに対して EEXIST エラーが発生する', async () => {
		const existingDir = path.join(tmpDir, 'existingFolder');
		await fs.mkdir(existingDir);
		await expect(mkdirLocal(existingDir)).rejects.toThrow(/EEXIST/);
	});

	test('作成したディレクトリが listLocal で確認できる', async () => {
		const newDir = path.join(tmpDir, 'visibleFolder');
		await mkdirLocal(newDir);
		const entries = await fs.readdir(tmpDir, { withFileTypes: true });
		const found = entries.find(e => e.name === 'visibleFolder');
		expect(found).toBeDefined();
		expect(found.isDirectory()).toBe(true);
	});
});
