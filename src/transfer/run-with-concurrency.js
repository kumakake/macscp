/**
 * items を最大 limit 件まで並列実行する。各タスクは独立に成否が決まり、
 * 1 件の失敗は他のタスクをブロックしない（Promise.allSettled 相当）。
 * @template T, R
 * @param {T[]} items
 * @param {number} limit  同時実行上限（1 以上）
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<Array<{status: 'fulfilled'|'rejected', value?: R, reason?: any, item: T}>>}
 */
export async function runWithConcurrency(items, limit, worker) {
	const results = new Array(items.length);
	let cursor = 0;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (true) {
			const i = cursor++;
			if (i >= items.length) return;
			try {
				const value = await worker(items[i], i);
				results[i] = { status: 'fulfilled', value, item: items[i] };
			} catch (reason) {
				results[i] = { status: 'rejected', reason, item: items[i] };
			}
		}
	});
	await Promise.all(runners);
	return results;
}
