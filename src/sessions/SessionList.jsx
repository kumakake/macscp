import React from 'react';

/** プロトコルに対応するポート番号 */
const DEFAULT_PORTS = {
	sftp: 22,
	scp: 22,
	ftp: 21,
	ftps: 990,
	webdav: 80,
	s3: 443,
};

const styles = {
	sidebar: {
		width: '240px',
		minWidth: '200px',
		background: '#1e1e2e',
		borderRight: '1px solid #313244',
		display: 'flex',
		flexDirection: 'column',
		height: '100%',
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: '12px 14px',
		borderBottom: '1px solid #313244',
	},
	title: {
		color: '#cdd6f4',
		fontSize: '13px',
		fontWeight: '600',
		margin: 0,
	},
	newButton: {
		background: '#89b4fa',
		color: '#1e1e2e',
		border: 'none',
		borderRadius: '4px',
		padding: '4px 10px',
		fontSize: '12px',
		fontWeight: '600',
		cursor: 'pointer',
	},
	list: {
		flex: 1,
		overflowY: 'auto',
		padding: '6px 0',
	},
	emptyText: {
		color: '#6c7086',
		fontSize: '12px',
		textAlign: 'center',
		padding: '24px 14px',
	},
	item: (isSelected) => ({
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		padding: '8px 14px',
		cursor: 'pointer',
		background: isSelected ? '#313244' : 'transparent',
		borderLeft: isSelected ? '2px solid #89b4fa' : '2px solid transparent',
	}),
	itemInfo: {
		flex: 1,
		minWidth: 0,
	},
	itemName: (isSelected) => ({
		color: isSelected ? '#cdd6f4' : '#a6adc8',
		fontSize: '13px',
		fontWeight: isSelected ? '600' : '400',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
	}),
	itemMeta: {
		color: '#6c7086',
		fontSize: '11px',
		marginTop: '2px',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
	},
	deleteButton: {
		background: 'transparent',
		border: 'none',
		color: '#6c7086',
		cursor: 'pointer',
		padding: '2px 4px',
		fontSize: '14px',
		lineHeight: 1,
		borderRadius: '3px',
		marginLeft: '6px',
		flexShrink: 0,
	},
};

/**
 * セッション一覧サイドバーコンポーネント
 * @param {Object} props
 * @param {Array<Object>} props.sessions - セッション配列
 * @param {string|null} props.selectedId - 選択中のセッション ID
 * @param {function} props.onSelect - セッション選択ハンドラ
 * @param {function} props.onNew - 新規ボタンクリックハンドラ
 * @param {function} props.onDelete - 削除ボタンクリックハンドラ
 */
export default function SessionList({ sessions, selectedId, onSelect, onNew, onDelete }) {
	/**
	 * 削除ボタンのクリックイベントを処理する（親への選択イベントを止める）
	 * @param {React.MouseEvent} e
	 * @param {string} id
	 */
	const handleDelete = (e, id) => {
		e.stopPropagation();
		if (window.confirm('このセッションを削除しますか？')) {
			onDelete(id);
		}
	};

	return (
		<div style={styles.sidebar}>
			<div style={styles.header}>
				<p style={styles.title}>セッション</p>
				<button style={styles.newButton} onClick={onNew}>
					+ 新規
				</button>
			</div>
			<div style={styles.list}>
				{sessions.length === 0 ? (
					<p style={styles.emptyText}>セッションがありません</p>
				) : (
					sessions.map((s) => (
						<div
							key={s.id}
							style={styles.item(s.id === selectedId)}
							onClick={() => onSelect(s)}
						>
							<div style={styles.itemInfo}>
								<div style={styles.itemName(s.id === selectedId)}>
									{s.name || '(名前なし)'}
								</div>
								<div style={styles.itemMeta}>
									{s.protocol?.toUpperCase()} · {s.host || '—'}
								</div>
							</div>
							<button
								style={styles.deleteButton}
								onClick={(e) => handleDelete(e, s.id)}
								title='削除'
							>
								✕
							</button>
						</div>
					))
				)}
			</div>
		</div>
	);
}
