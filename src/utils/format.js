/**
 * @file format.js
 * @description ファイルサイズ・日時フォーマット共通ユーティリティ
 */

/**
 * バイト数を人間が読みやすい形式に変換する
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
	if (bytes === 0 || bytes == null) return '-';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/**
 * Date を "YYYY/MM/DD HH:mm" 形式に変換する
 * @param {Date|string|null} date
 * @returns {string}
 */
export function formatDate(date) {
	if (!date) return '-';
	const d = new Date(date);
	if (isNaN(d.getTime())) return '-';
	return d.toLocaleString('ja-JP', {
		year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit',
	});
}
