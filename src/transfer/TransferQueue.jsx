import React from 'react';

/**
 * ファイルサイズを人間が読みやすい形式に変換する
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
	if (bytes === 0 || bytes == null) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const styles = {
	container: {
		background: '#e8e8e8',
		borderTop: '1px solid #c0c0c0',
		display: 'flex',
		flexDirection: 'column',
		minHeight: '120px',
		maxHeight: '200px',
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: '6px 12px',
		borderBottom: '1px solid #c0c0c0',
		background: '#e0e0e0',
	},
	headerTitle: {
		fontSize: '12px',
		fontWeight: '600',
		color: '#333',
		margin: 0,
	},
	clearButton: {
		background: 'none',
		border: '1px solid #aaa',
		borderRadius: '4px',
		padding: '2px 10px',
		fontSize: '11px',
		color: '#555',
		cursor: 'pointer',
	},
	list: {
		flex: 1,
		overflowY: 'auto',
		padding: '4px 0',
	},
	empty: {
		color: '#999',
		fontSize: '12px',
		textAlign: 'center',
		padding: '24px 0',
	},
	item: (isDone) => ({
		display: 'flex',
		alignItems: 'center',
		padding: '4px 12px',
		gap: '8px',
		opacity: isDone ? 0.5 : 1,
		borderBottom: '1px solid #d8d8d8',
	}),
	direction: {
		fontSize: '14px',
		width: '16px',
		textAlign: 'center',
		flexShrink: 0,
	},
	fileName: {
		flex: 1,
		fontSize: '12px',
		color: '#222',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		minWidth: 0,
	},
	progressWrap: {
		width: '120px',
		height: '6px',
		background: '#ccc',
		borderRadius: '3px',
		overflow: 'hidden',
		flexShrink: 0,
	},
	progressBar: (pct, status) => ({
		height: '100%',
		width: `${pct}%`,
		background: status === 'error' ? '#e03030' : status === 'done' ? '#888' : '#0064d2',
		borderRadius: '3px',
		transition: 'width 0.2s',
	}),
	sizeText: {
		fontSize: '11px',
		color: '#666',
		width: '100px',
		textAlign: 'right',
		flexShrink: 0,
	},
	statusBadge: (status) => ({
		fontSize: '10px',
		padding: '1px 6px',
		borderRadius: '3px',
		flexShrink: 0,
		background:
			status === 'done' ? '#ddd'
				: status === 'error' ? '#fdd'
					: status === 'transferring' ? '#d0e8ff'
						: '#f0f0f0',
		color:
			status === 'done' ? '#666'
				: status === 'error' ? '#c00'
					: status === 'transferring' ? '#0064d2'
						: '#888',
	}),
};

/** ステータスの日本語ラベル */
const STATUS_LABELS = {
	pending: '待機中',
	transferring: '転送中',
	done: '完了',
	error: 'エラー',
};

/**
 * 転送キュー表示コンポーネント
 * @param {Object} props
 * @param {Array<{id: string, name: string, direction: string, transferred: number, total: number, status: string}>} props.items
 * @param {function} props.onClear - 完了・エラーアイテムを削除するハンドラ
 */
export default function TransferQueue({ items, onClear }) {
	return (
		<div style={styles.container}>
			<div style={styles.header}>
				<span style={styles.headerTitle}>転送キュー ({items.length})</span>
				<button style={styles.clearButton} onClick={onClear}>
					完了をクリア
				</button>
			</div>
			<div style={styles.list}>
				{items.length === 0 ? (
					<div style={styles.empty}>転送中のファイルはありません</div>
				) : (
					items.map((item) => {
						const isDone = item.status === 'done' || item.status === 'error';
						const pct = item.total > 0
							? Math.min(100, Math.round((item.transferred / item.total) * 100))
							: (item.status === 'done' ? 100 : 0);

						return (
							<div key={item.id} style={styles.item(isDone)}>
								{/* 方向アイコン */}
								<span style={styles.direction} title={item.direction === 'upload' ? 'アップロード' : 'ダウンロード'}>
									{item.direction === 'upload' ? '↑' : '↓'}
								</span>

								{/* ファイル名 */}
								<span style={styles.fileName} title={item.name}>
									{item.name}
								</span>

								{/* プログレスバー */}
								<div style={styles.progressWrap}>
									<div style={styles.progressBar(pct, item.status)} />
								</div>

								{/* サイズ表示 */}
								<span style={styles.sizeText}>
									{formatSize(item.transferred)} / {formatSize(item.total)}
								</span>

								{/* ステータスバッジ */}
								<span style={styles.statusBadge(item.status)}>
									{STATUS_LABELS[item.status] ?? item.status}
								</span>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}
