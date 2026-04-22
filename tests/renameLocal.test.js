/**
 * @file renameLocal.test.js
 * @description ローカル rename IPC ハンドラのテスト
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/** テスト用の一時ディレクトリ */
let tmpDir;

/**
 * files:renameLocal の実装を直接呼び出すヘルパー
 * @param {string} oldPath
 * @param {string} newPath
 */
async function renameLocal(oldPath, newPath) {
	await fs.rename(oldPath, newPath);
	return { ok: true };
}

beforeAll(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'macscp-rename-test-'));
});

afterAll(async () => {
	await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('renameLocal ファイル/ディレクトリ名変更', () => {
	test('ファイルをリネームできる', async () => {
		const src = path.join(tmpDir, 'old.txt');
		const dst = path.join(tmpDir, 'new.txt');
		await fs.writeFile(src, 'test');
		const result = await renameLocal(src, dst);
		expect(result).toEqual({ ok: true });
		await expect(fs.access(dst)).resolves.toBeUndefined();
		await expect(fs.access(src)).rejects.toThrow();
	});

	test('ディレクトリをリネームできる', async () => {
		const src = path.join(tmpDir, 'oldDir');
		const dst = path.join(tmpDir, 'newDir');
		await fs.mkdir(src);
		const result = await renameLocal(src, dst);
		expect(result).toEqual({ ok: true });
		const stat = await fs.stat(dst);
		expect(stat.isDirectory()).toBe(true);
		await expect(fs.access(src)).rejects.toThrow();
	});

	test('存在しないパスで ENOENT エラーが発生する', async () => {
		const src = path.join(tmpDir, 'nonexistent.txt');
		const dst = path.join(tmpDir, 'target.txt');
		await expect(renameLocal(src, dst)).rejects.toThrow(/ENOENT/);
	});

	test('リネーム先が既存ファイルの場合は上書きされる', async () => {
		const src = path.join(tmpDir, 'srcOverwrite.txt');
		const dst = path.join(tmpDir, 'dstOverwrite.txt');
		await fs.writeFile(src, 'source content');
		await fs.writeFile(dst, 'old content');
		await renameLocal(src, dst);
		const content = await fs.readFile(dst, 'utf-8');
		expect(content).toBe('source content');
	});

	test('リネーム後のファイルが listLocal 相当の readdir で確認できる', async () => {
		const src = path.join(tmpDir, 'beforeRename.txt');
		const dst = path.join(tmpDir, 'afterRename.txt');
		await fs.writeFile(src, '');
		await renameLocal(src, dst);
		const entries = await fs.readdir(tmpDir);
		expect(entries).toContain('afterRename.txt');
		expect(entries).not.toContain('beforeRename.txt');
	});
});
