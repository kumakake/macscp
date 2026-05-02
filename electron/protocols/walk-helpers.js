/**
 * @file walk-helpers.js
 * @description ディレクトリ転送で共通利用する純粋関数群
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * ローカルディレクトリを再帰的にスキャンする
 * @param {string} localDir - スキャン対象のローカルディレクトリ絶対パス
 * @returns {Promise<{files: Array<{relPath: string, absPath: string, size: number}>, dirs: string[], totalBytes: number}>}
 */
export async function walkLocalDir(localDir) {
	const files = [];
	const dirs = [];
	let totalBytes = 0;

	/**
	 * ディレクトリを再帰的に処理する内部関数
	 * @param {string} absDir - 現在処理中のディレクトリ絶対パス
	 * @param {string} relBase - ルートからの相対パスプレフィックス
	 */
	async function walk(absDir, relBase) {
		let entries;
		try {
			entries = await fs.readdir(absDir, { withFileTypes: true });
		} catch (err) {
			if (err.code === 'EACCES' || err.code === 'EPERM') {
				// TCC や権限エラーはスキップする
				console.warn(`ディレクトリの読み取りをスキップしました (権限不足): ${absDir}`);
				return;
			}
			throw err;
		}

		for (const dirent of entries) {
			// シンボリックリンクは除外する
			if (dirent.isSymbolicLink()) {
				continue;
			}

			const absPath = path.join(absDir, dirent.name);
			const relPath = relBase ? relBase + '/' + dirent.name : dirent.name;

			if (dirent.isDirectory()) {
				dirs.push(relPath);
				await walk(absPath, relPath);
			} else if (dirent.isFile()) {
				let size = 0;
				try {
					const stat = await fs.lstat(absPath);
					// lstat で再確認してシンボリックリンクを除外する
					if (stat.isSymbolicLink()) {
						continue;
					}
					size = stat.size;
				} catch (err) {
					if (err.code === 'EACCES' || err.code === 'EPERM') {
						console.warn(`ファイルの stat をスキップしました (権限不足): ${absPath}`);
						continue;
					}
					throw err;
				}
				files.push({ relPath, absPath, size });
				totalBytes += size;
			}
		}
	}

	await walk(localDir, '');
	return { files, dirs, totalBytes };
}

/**
 * リモートディレクトリを再帰的にスキャンする（adapter.list を利用）
 * @param {{list: (path: string) => Promise<Array<{name: string, type: string, size: number}>>}} adapter - プロトコルアダプタ
 * @param {string} remoteDir - スキャン対象のリモートディレクトリパス
 * @returns {Promise<{files: Array<{relPath: string, size: number}>, dirs: string[], totalBytes: number}>}
 */
export async function walkRemoteDir(adapter, remoteDir) {
	const files = [];
	const dirs = [];
	let totalBytes = 0;

	/**
	 * リモートディレクトリを再帰的に処理する内部関数
	 * @param {string} absRemote - 現在処理中のリモートディレクトリ絶対パス
	 * @param {string} relBase - ルートからの相対パスプレフィックス
	 */
	async function walk(absRemote, relBase) {
		const items = await adapter.list(absRemote);

		for (const item of items) {
			const relPath = relBase ? relBase + '/' + item.name : item.name;
			const absPath = absRemote.replace(/\/$/, '') + '/' + item.name;

			// type === 'd' をディレクトリと判定する
			if (item.type === 'd' || item.isDirectory) {
				dirs.push(relPath);
				await walk(absPath, relPath);
			} else {
				const size = item.size ?? 0;
				files.push({ relPath, size });
				totalBytes += size;
			}
		}
	}

	await walk(remoteDir, '');
	return { files, dirs, totalBytes };
}

/**
 * パストラバーサル防止チェック
 * resolved(fullAbs) が resolved(rootAbs) の配下にあることを検証する
 * @param {string} rootAbs - 許可するルートディレクトリの絶対パス
 * @param {string} fullAbs - 検証対象の絶対パス
 * @throws {Error} パストラバーサルが検出された場合
 */
export function assertSafeChild(rootAbs, fullAbs) {
	const resolvedRoot = path.resolve(rootAbs);
	const resolvedFull = path.resolve(fullAbs);

	// ルート自身か、ルート配下（セパレータ付き）で始まることを確認する
	const isRoot = resolvedFull === resolvedRoot;
	const isChild = resolvedFull.startsWith(resolvedRoot + path.sep);

	if (!isRoot && !isChild) {
		throw new Error(`パストラバーサルが検出されました: ${fullAbs} は ${rootAbs} の外側です`);
	}
}

/**
 * POSIX パス結合（path.posix.join のラッパ）
 * リモートパス操作に使用する
 * @param {...string} parts - 結合するパスパーツ
 * @returns {string} 結合された POSIX パス
 */
export function joinPosix(...parts) {
	return path.posix.join(...parts);
}

/**
 * 高頻度呼び出しを間引く throttle 関数（leading + trailing）
 * 最後の呼び出しから interval ms 経過するまで間引く
 * @param {Function} fn - 間引き対象の関数
 * @param {number} [interval=100] - 間引き間隔（ミリ秒）
 * @returns {Function} throttle された関数
 */
export function throttleProgress(fn, interval = 100) {
	let lastCall = 0;
	let timer = null;
	let lastArgs = null;

	/**
	 * throttle されたラッパ関数
	 * @param {...any} args - 元の関数に渡す引数
	 */
	return function throttled(...args) {
		const now = Date.now();
		lastArgs = args;

		if (now - lastCall >= interval) {
			// interval 経過済みなら即座に実行する（leading）
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
			lastCall = now;
			fn(...args);
		} else {
			// interval 未経過なら trailing 実行をスケジュールする
			if (timer !== null) {
				clearTimeout(timer);
			}
			timer = setTimeout(() => {
				timer = null;
				lastCall = Date.now();
				fn(...lastArgs);
			}, interval - (now - lastCall));
		}
	};
}
