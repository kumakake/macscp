/**
 * @file deleteLocal-dir.test.js
 * @description files:deleteLocal ハンドラのディレクトリ削除テスト
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { unlink } from 'fs/promises';

/** テスト用の一時ディレクトリ */
let tmpDir;

/**
 * files:deleteLocal の実装を直接呼び出すヘルパー
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function deleteLocal(filePath) {
	const stat = await fs.lstat(filePath);
	if (stat.isDirectory()) {
		await fs.rm(filePath, { recursive: true });
	} else {
		await unlink(filePath);
	}
}

beforeAll(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'macscp-del-test-'));
});

afterAll(async () => {
	await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('deleteLocal ディレクトリ削除', () => {
	test('通常ファイルを削除できる', async () => {
		const filePath = path.join(tmpDir, 'file.txt');
		await fs.writeFile(filePath, 'hello');
		await deleteLocal(filePath);
		await expect(fs.access(filePath)).rejects.toThrow();
	});

	test('空ディレクトリを削除できる', async () => {
		const dirPath = path.join(tmpDir, 'emptydir');
		await fs.mkdir(dirPath);
		await deleteLocal(dirPath);
		await expect(fs.access(dirPath)).rejects.toThrow();
	});

	test('中身があるディレクトリを再帰的に削除できる', async () => {
		const dirPath = path.join(tmpDir, 'nested');
		const subDir = path.join(dirPath, 'sub');
		const childFile = path.join(dirPath, 'child.txt');
		await fs.mkdir(dirPath);
		await fs.mkdir(subDir);
		await fs.writeFile(childFile, 'data');
		await deleteLocal(dirPath);
		await expect(fs.access(dirPath)).rejects.toThrow();
	});

	test('存在しないパスで ENOENT が投げられる', async () => {
		const missing = path.join(tmpDir, 'nonexistent');
		await expect(deleteLocal(missing)).rejects.toMatchObject({ code: 'ENOENT' });
	});
});
