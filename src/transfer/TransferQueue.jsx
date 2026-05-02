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
	fileInfo: {
		flex: 1,
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'center',
		minWidth: 0,
		overflow: 'hidden',
	},
	fileName: {
		fontSize: '12px',
		color: '#222',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	fileCount: {
		fontSize: '11px',
		color: '#555',
		flexShrink: 0,
		marginLeft: '4px',
	},
	currentFile: {
		fontSize: '10px',
		color: '#888',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		marginTop: '1px',
	},
	progressWrap: {
		width: '120px',
		height: '6px',
		background: '#ccc',
		borderRadius: '3px',
		overflow: 'hidden',
		flexShrink: 0,
	},
	progressBar: (pct, status, isIndeterminate) => ({
		height: '100%',
		width: isIndeterminate ? '100%' : `${pct}%`,
		background: status === 'error' ? '#e03030' : status === 'done' ? '#888' : isIndeterminate ? '#e07820' : '#0064d2',
		borderRadius: '3px',
		transition: isIndeterminate ? 'none' : 'width 0.2s',
		opacity: isIndeterminate ? 0.7 : 1,
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

/** ステータスの日本語ラベル（direction ごとに上書き可能） */
const STATUS_LABELS = {
	pending: '待機中',
	transferring: '転送中',
	done: '完了',
	error: 'エラー',
};

/** direction=delete 時のステータス日本語ラベル */
const DELETE_STATUS_LABELS = {
	pending: '待機中',
	transferring: '削除中...',
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
						const isDelete = item.direction === 'delete';
						const isIndeterminate = isDelete && item.status === 'transferring';
						const pct = item.total > 0
							? Math.min(100, Math.round((item.transferred / item.total) * 100))
							: (item.status === 'done' ? 100 : 0);
						const labels = isDelete ? DELETE_STATUS_LABELS : STATUS_LABELS;
						const directionTitle = isDelete ? '削除' : item.direction === 'upload' ? 'アップロード' : 'ダウンロード';
						const directionIcon = isDelete ? '🗑' : item.direction === 'upload' ? '↑' : '↓';

						return (
							<div key={item.id} style={styles.item(isDone)}>
								{/* 方向アイコン */}
								<span style={styles.direction} title={directionTitle}>
									{directionIcon}
								</span>

								{/* ファイル名（ディレクトリ転送の場合は追加情報あり） */}
								<div style={styles.fileInfo}>
									<div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
										{item.isDirectory && (
											<span style={{ marginRight: '4px', fontSize: '12px' }}>📁</span>
										)}
										<span style={styles.fileName} title={item.name}>
											{item.name}
										</span>
										{item.isDirectory && item.totalFiles > 0 && (
											<span style={styles.fileCount}>
												({item.processedFiles ?? 0}/{item.totalFiles} ファイル)
											</span>
										)}
									</div>
									{item.isDirectory && item.currentFile && (
										<div style={styles.currentFile} title={item.currentFile}>
											処理中: {item.currentFile}
										</div>
									)}
								</div>

								{/* プログレスバー */}
								<div style={styles.progressWrap}>
									<div style={styles.progressBar(pct, item.status, isIndeterminate)} />
								</div>

								{/* サイズ表示（削除中は非表示） */}
								{!isDelete ? (
									<span style={styles.sizeText}>
										{formatSize(item.transferred)} / {formatSize(item.total)}
									</span>
								) : (
									<span style={{ ...styles.sizeText, color: '#aaa' }}>—</span>
								)}

								{/* ステータスバッジ */}
								<span style={styles.statusBadge(item.status)}>
									{labels[item.status] ?? item.status}
								</span>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}
