/**
 * @file listLocal-stat.test.js
 * @description listLocal IPC ハンドラの stat 取得テスト
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/** テスト用の一時ディレクトリ */
let tmpDir;

/**
 * files:listLocal の実装を直接呼び出すヘルパー
 * IPC ハンドラの実体ロジックを再現する
 * @param {string} dirPath
 * @returns {Promise<Array>}
 */
async function listLocal(dirPath) {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	return Promise.all(entries.map(async (e) => {
		const fullPath = path.join(dirPath, e.name);
		let size = 0;
		let modifiedAt = null;
		let permissions = '';
		try {
			const stat = await fs.stat(fullPath);
			size = stat.size;
			modifiedAt = stat.mtime;
			const m = stat.mode;
			permissions = [
				m & 0o400 ? 'r' : '-', m & 0o200 ? 'w' : '-', m & 0o100 ? 'x' : '-',
				m & 0o040 ? 'r' : '-', m & 0o020 ? 'w' : '-', m & 0o010 ? 'x' : '-',
				m & 0o004 ? 'r' : '-', m & 0o002 ? 'w' : '-', m & 0o001 ? 'x' : '-',
			].join('');
		} catch { /* フォールバック */ }
		return {
			name: e.name,
			path: fullPath,
			isDirectory: e.isDirectory(),
			size,
			modifiedAt,
			permissions,
		};
	}));
}

beforeAll(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'macscp-test-'));
	// テスト用ファイルとディレクトリを作成
	await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello world');
	await fs.mkdir(path.join(tmpDir, 'subdir'));
});

afterAll(async () => {
	await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('listLocal stat 取得', () => {
	test('ファイルのサイズが 0 より大きい値で返る', async () => {
		const result = await listLocal(tmpDir);
		const file = result.find(e => e.name === 'hello.txt');
		expect(file).toBeDefined();
		expect(file.size).toBeGreaterThan(0);
	});

	test('ファイルの modifiedAt が日付として有効な値で返る', async () => {
		const result = await listLocal(tmpDir);
		const file = result.find(e => e.name === 'hello.txt');
		expect(file.modifiedAt).not.toBeNull();
		expect(typeof file.modifiedAt.getTime).toBe('function');
		expect(file.modifiedAt.getTime()).toBeGreaterThan(0);
	});

	test('ディレクトリの isDirectory が true で返る', async () => {
		const result = await listLocal(tmpDir);
		const dir = result.find(e => e.name === 'subdir');
		expect(dir).toBeDefined();
		expect(dir.isDirectory).toBe(true);
	});

	test('permissions が 9 文字の rwx 文字列で返る', async () => {
		const result = await listLocal(tmpDir);
		const file = result.find(e => e.name === 'hello.txt');
		expect(file.permissions).toMatch(/^[r-][w-][x-][r-][w-][x-][r-][w-][x-]$/);
	});

	test('エントリの path がフルパスで返る', async () => {
		const result = await listLocal(tmpDir);
		const file = result.find(e => e.name === 'hello.txt');
		expect(file.path).toBe(path.join(tmpDir, 'hello.txt'));
	});
});
