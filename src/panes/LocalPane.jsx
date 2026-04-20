import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFileList } from '../hooks/useMacscpApi.js';
import { formatSize, formatDate } from '../utils/format.js';

const styles = {
	pane: {
		flex: 1,
		display: 'flex',
		flexDirection: 'column',
		background: '#f0f0f0',
		borderRight: '1px solid #c0c0c0',
		minWidth: 0,
		fontFamily: '-apple-system, BlinkMacSystemFont, \'Helvetica Neue\', sans-serif',
	},
	pathBar: {
		display: 'flex',
		alignItems: 'center',
		gap: '6px',
		padding: '6px 10px',
		background: '#e0e0e0',
		borderBottom: '1px solid #c0c0c0',
	},
	upButton: {
		background: '#d0d0d0',
		border: '1px solid #aaa',
		borderRadius: '4px',
		padding: '3px 10px',
		fontSize: '13px',
		cursor: 'pointer',
		flexShrink: 0,
		color: '#333',
	},
	pathInput: {
		flex: 1,
		border: '1px solid #aaa',
		borderRadius: '4px',
		padding: '3px 8px',
		fontSize: '12px',
		background: '#fff',
		color: '#222',
		outline: 'none',
	},
	refreshButton: {
		background: '#d0d0d0',
		border: '1px solid #aaa',
		borderRadius: '4px',
		padding: '3px 8px',
		fontSize: '12px',
		cursor: 'pointer',
		flexShrink: 0,
		color: '#333',
	},
	headerRow: {
		display: 'flex',
		background: '#e0e0e0',
		borderBottom: '1px solid #bbb',
		padding: '3px 0',
	},
	headerCell: (flex) => ({
		flex,
		fontSize: '11px',
		fontWeight: '600',
		color: '#555',
		padding: '0 8px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	}),
	tableBody: {
		flex: 1,
		overflowY: 'auto',
		minHeight: 0,
	},
	row: (isSelected, isOver) => ({
		display: 'flex',
		alignItems: 'center',
		padding: '2px 0',
		background: isOver ? '#cce0ff' : isSelected ? '#0064d2' : 'transparent',
		cursor: 'default',
		borderBottom: '1px solid #e8e8e8',
	}),
	cell: (flex) => ({
		flex,
		fontSize: '12px',
		padding: '2px 8px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	}),
	nameCell: (isSelected) => ({
		flex: 3,
		fontSize: '12px',
		padding: '2px 8px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		color: isSelected ? '#fff' : '#222',
		display: 'flex',
		alignItems: 'center',
		gap: '5px',
	}),
	sizeCell: (isSelected) => ({
		flex: 1,
		fontSize: '12px',
		padding: '2px 8px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		color: isSelected ? '#dde' : '#666',
		textAlign: 'right',
	}),
	dateCell: (isSelected) => ({
		flex: 2,
		fontSize: '11px',
		padding: '2px 8px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		color: isSelected ? '#dde' : '#888',
	}),
	errorBar: {
		background: '#fdd',
		color: '#c00',
		fontSize: '12px',
		padding: '6px 12px',
		borderBottom: '1px solid #f99',
	},
	loadingBar: {
		background: '#e8f0ff',
		color: '#0064d2',
		fontSize: '12px',
		padding: '6px 12px',
		borderBottom: '1px solid #c0d8ff',
	},
};

/**
 * ローカルファイルシステムブラウザペインコンポーネント
 * @param {Object} props
 * @param {Object|null} props.clipboard - 内部クリップボード { entries, sourcePath }
 * @param {function} props.onClipboardChange - クリップボード更新ハンドラ
 * @param {function} props.onDragStart - ドラッグ開始時のハンドラ (entries) => void
 * @param {function} props.onDropFromRemote - リモートからドロップ受け付け時のハンドラ (remoteEntries, localDir) => void
 * @param {string|null} props.dragSource - 現在ドラッグ中のソース ('local'|'remote'|null)
 * @param {Object|null} props.lastTransferBatch - 最後に完了した転送バッチ { id, direction, destPath, names }
 */
export default function LocalPane({ clipboard, onClipboardChange, onDragStart, onDropFromRemote, dragSource, lastTransferBatch }) {
	const { entries, currentPath, loading, error, loadLocal } = useFileList();
	const [selected, setSelected] = useState([]);
	const [pathInput, setPathInput] = useState('');
	const [isDragOver, setIsDragOver] = useState(false);
	const paneRef = useRef(null);

	const [sortKey, setSortKey] = useState(null);
	const [sortOrder, setSortOrder] = useState('asc');
	const [showMkdirModal, setShowMkdirModal] = useState(false);
	const [mkdirName, setMkdirName] = useState('');
	const [mkdirError, setMkdirError] = useState('');

	/** ホームディレクトリで初期化 */
	useEffect(() => {
		(async () => {
			try {
				const home = await window.macscp.files.homeDir();
				await loadLocal(home);
				setPathInput(home);
			} catch (e) {
				console.error('ホームディレクトリの取得に失敗しました:', e);
			}
		})();
	}, [loadLocal]);

	/** currentPath が変わったらパス入力欄も更新 */
	useEffect(() => {
		setPathInput(currentPath);
		setSelected([]);
	}, [currentPath]);

	/** ダウンロード完了時: 現在のパスが転送先なら自動リロード */
	useEffect(() => {
		if (!lastTransferBatch) return;
		if (lastTransferBatch.direction !== 'download') return;
		if (lastTransferBatch.destPath !== currentPath) return;
		loadLocal(currentPath);
	// currentPath, loadLocal は意図的に依存から除外（バッチ変化時のみ発火）
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lastTransferBatch]);

	/** ダウンロード完了後 entries 更新時: 転送ファイルを選択状態にする */
	useEffect(() => {
		if (!lastTransferBatch) return;
		if (lastTransferBatch.direction !== 'download') return;
		if (lastTransferBatch.destPath !== currentPath) return;
		const picked = entries.filter(e => lastTransferBatch.names.includes(e.name));
		if (picked.length > 0) setSelected(picked);
	}, [entries, lastTransferBatch, currentPath]);

	/**
	 * 指定パスへ移動する
	 * @param {string} dir
	 */
	const navigateTo = useCallback(async (dir) => {
		await loadLocal(dir);
	}, [loadLocal]);

	/**
	 * 1つ上のディレクトリへ移動する
	 */
	const goUp = useCallback(async () => {
		if (!currentPath) return;
		const parts = currentPath.split('/').filter(Boolean);
		if (parts.length === 0) return;
		const parent = '/' + parts.slice(0, -1).join('/');
		await navigateTo(parent || '/');
	}, [currentPath, navigateTo]);

	/**
	 * パスバーの Enter キー処理
	 * @param {React.KeyboardEvent} e
	 */
	const handlePathEnter = (e) => {
		if (e.key === 'Enter') {
			navigateTo(pathInput);
		}
	};

	/**
	 * 行クリック時の選択処理（⌘クリックで複数選択）
	 * @param {React.MouseEvent} e
	 * @param {Object} entry
	 */
	const handleRowClick = (e, entry) => {
		if (e.metaKey || e.ctrlKey) {
			setSelected(prev =>
				prev.some(s => s.name === entry.name)
					? prev.filter(s => s.name !== entry.name)
					: [...prev, entry]
			);
		} else {
			setSelected([entry]);
		}
	};

	/**
	 * ダブルクリックでディレクトリ移動
	 * @param {Object} entry
	 */
	const handleDoubleClick = async (entry) => {
		if (entry.isDirectory) {
			await navigateTo(entry.path);
		}
	};

	/**
	 * ドラッグ開始ハンドラ
	 * @param {React.DragEvent} e
	 * @param {Object} entry - ドラッグ対象エントリ
	 */
	const handleDragStart = (e, entry) => {
		let targets = selected.some(s => s.name === entry.name) ? selected : [entry];
		e.dataTransfer.setData('application/x-macscp-local', JSON.stringify(targets));
		e.dataTransfer.effectAllowed = 'copy';
		if (onDragStart) onDragStart(targets);
	};

	/** ドロップゾーンのドラッグオーバー処理 */
	const handleDragOver = (e) => {
		if (dragSource === 'remote') {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
			setIsDragOver(true);
		}
	};

	const handleDragLeave = () => {
		setIsDragOver(false);
	};

	/**
	 * リモートからのドロップ処理
	 * @param {React.DragEvent} e
	 */
	const handleDrop = (e) => {
		e.preventDefault();
		setIsDragOver(false);
		const raw = e.dataTransfer.getData('application/x-macscp-remote');
		if (!raw) return;
		try {
			const remoteEntries = JSON.parse(raw);
			if (onDropFromRemote) {
				onDropFromRemote(remoteEntries, currentPath);
			}
		} catch {
			console.error('ドロップデータの解析に失敗しました');
		}
	};

	/**
	 * 選択中のローカルファイル/ディレクトリを削除する
	 */
	const deleteSelected = useCallback(async () => {
		if (selected.length === 0) return;
		const names = selected.map(s => s.name).join(', ');
		if (!window.confirm(`削除しますか？\n${names}`)) return;
		for (const entry of selected) {
			try {
				await window.macscp.files.deleteLocal(entry.path);
			} catch (err) {
				alert(`削除に失敗しました: ${entry.name}\n${err.message}`);
			}
		}
		setSelected([]);
		await loadLocal(currentPath);
	}, [selected, currentPath, loadLocal]);

	/**
	 * ヘッダクリック時のソートトグル（null→asc→desc→null）
	 * @param {'name'|'size'|'modifiedAt'} key
	 */
	const toggleSort = useCallback((key) => {
		if (sortKey !== key) {
			setSortKey(key);
			setSortOrder('asc');
		} else if (sortOrder === 'asc') {
			setSortOrder('desc');
		} else {
			setSortKey(null);
			setSortOrder('asc');
		}
	}, [sortKey, sortOrder]);

	/** ソート適用済みエントリ（ディレクトリ優先） */
	const sortedEntries = useMemo(() => {
		if (!sortKey) return entries;
		return [...entries].sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
			let cmp = 0;
			if (sortKey === 'name') {
				cmp = a.name.localeCompare(b.name, 'ja');
			} else if (sortKey === 'size') {
				cmp = (a.size || 0) - (b.size || 0);
			} else if (sortKey === 'modifiedAt') {
				const at = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
				const bt = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
				cmp = at - bt;
			}
			return sortOrder === 'asc' ? cmp : -cmp;
		});
	}, [entries, sortKey, sortOrder]);

	/**
	 * ローカルにディレクトリを作成する
	 */
	const handleMkdirCreate = useCallback(async () => {
		const name = mkdirName.trim();
		if (!name) {
			setMkdirError('フォルダ名を入力してください');
			return;
		}
		const newPath = currentPath.endsWith('/')
			? `${currentPath}${name}`
			: `${currentPath}/${name}`;
		try {
			await window.macscp.files.mkdirLocal(newPath);
			setShowMkdirModal(false);
			await loadLocal(currentPath);
		} catch (err) {
			setMkdirError(`作成に失敗しました: ${err.message}`);
		}
	}, [mkdirName, currentPath, loadLocal]);

	/**
	 * キーボードショートカット処理
	 * @param {React.KeyboardEvent} e
	 */
	const handleKeyDown = useCallback((e) => {
		// ⌘C または F5: 選択ファイルをコピー
		if ((e.metaKey && e.key === 'c') || e.key === 'F5') {
			if (selected.length > 0) {
				onClipboardChange({ entries: selected, sourcePath: currentPath, source: 'local', type: 'copy' });
			}
			return;
		}
		// ⌘X: 選択ファイルを切り取り（移動）
		if (e.metaKey && e.key === 'x') {
			if (selected.length > 0) {
				onClipboardChange({ entries: selected, sourcePath: currentPath, source: 'local', type: 'move' });
			}
			return;
		}
		// ⌘R: 更新
		if (e.metaKey && e.key === 'r') {
			e.preventDefault();
			navigateTo(currentPath);
			return;
		}
		// Delete: ローカル削除
		if (e.key === 'Delete' || e.key === 'Backspace') {
			deleteSelected();
		}
	}, [selected, currentPath, onClipboardChange, navigateTo, deleteSelected]);

	return (
		<div
			ref={paneRef}
			style={{
				...styles.pane,
				outline: isDragOver ? '2px solid #0064d2' : 'none',
			}}
			tabIndex={0}
			onKeyDown={handleKeyDown}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			{/* パスバー */}
			<div style={styles.pathBar}>
				<button style={styles.upButton} onClick={goUp} title='上のディレクトリへ'>
					↑
				</button>
				<input
					style={styles.pathInput}
					value={pathInput}
					onChange={e => setPathInput(e.target.value)}
					onKeyDown={handlePathEnter}
					spellCheck={false}
				/>
				<button style={styles.refreshButton} onClick={() => navigateTo(currentPath)} title='更新 (⌘R)'>
					↺
				</button>
				<button
					style={styles.refreshButton}
					onClick={() => { setMkdirName(''); setMkdirError(''); setShowMkdirModal(true); }}
					title='新規フォルダ作成'
				>
					＋
				</button>
			</div>

			{/* 新規フォルダ作成モーダル */}
			{showMkdirModal && (
				<div style={{
					position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
					display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
				}} onClick={() => setShowMkdirModal(false)}>
					<div style={{
						background: '#1e1e2e', borderRadius: '8px', width: '360px',
						padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
					}} onClick={e => e.stopPropagation()}>
						<div style={{ color: '#cdd6f4', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
							新規フォルダ作成
						</div>
						<input
							style={{
								width: '100%', boxSizing: 'border-box',
								background: '#313244', border: '1px solid #45475a',
								borderRadius: '4px', padding: '6px 10px',
								color: '#cdd6f4', fontSize: '13px', outline: 'none', marginBottom: '8px',
							}}
							placeholder='フォルダ名を入力'
							value={mkdirName}
							onChange={e => { setMkdirName(e.target.value); setMkdirError(''); }}
							onKeyDown={e => {
								if (e.key === 'Enter') handleMkdirCreate();
								if (e.key === 'Escape') setShowMkdirModal(false);
							}}
							autoFocus
						/>
						{mkdirError && (
							<div style={{ color: '#f38ba8', fontSize: '12px', marginBottom: '8px' }}>
								{mkdirError}
							</div>
						)}
						<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
							<button
								style={{
									background: '#45475a', color: '#cdd6f4', border: 'none',
									borderRadius: '4px', padding: '6px 16px', fontSize: '13px', cursor: 'pointer',
								}}
								onClick={() => setShowMkdirModal(false)}
							>
								キャンセル
							</button>
							<button
								style={{
									background: '#89b4fa', color: '#1e1e2e', border: 'none',
									borderRadius: '4px', padding: '6px 16px', fontSize: '13px',
									fontWeight: '600', cursor: 'pointer',
								}}
								onClick={handleMkdirCreate}
							>
								作成
							</button>
						</div>
					</div>
				</div>
			)}

			{/* エラー/ローディング表示 */}
			{error && <div style={styles.errorBar}>{error}</div>}
			{loading && <div style={styles.loadingBar}>読み込み中...</div>}

			{/* テーブルヘッダ */}
			<div style={styles.headerRow}>
				<div
					style={{ ...styles.headerCell(3), cursor: 'pointer', userSelect: 'none' }}
					onClick={() => toggleSort('name')}
				>
					名前{sortKey === 'name' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
				</div>
				<div
					style={{ ...styles.headerCell(1), cursor: 'pointer', userSelect: 'none' }}
					onClick={() => toggleSort('size')}
				>
					サイズ{sortKey === 'size' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
				</div>
				<div
					style={{ ...styles.headerCell(2), cursor: 'pointer', userSelect: 'none' }}
					onClick={() => toggleSort('modifiedAt')}
				>
					更新日時{sortKey === 'modifiedAt' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
				</div>
			</div>

			{/* ファイル一覧 */}
			<div style={styles.tableBody}>
				{sortedEntries.map((entry) => {
					const isSelected = selected.some(s => s.name === entry.name);
					return (
						<div
							key={entry.name}
							style={styles.row(isSelected, false)}
							onClick={e => handleRowClick(e, entry)}
							onDoubleClick={() => handleDoubleClick(entry)}
							draggable={!entry.isDirectory}
							onDragStart={e => handleDragStart(e, entry)}
						>
							<div style={styles.nameCell(isSelected)}>
								<span>{entry.isDirectory ? '📁' : '📄'}</span>
								<span>{entry.name}</span>
							</div>
							<div style={styles.sizeCell(isSelected)}>
								{entry.isDirectory ? '—' : formatSize(entry.size)}
							</div>
							<div style={styles.dateCell(isSelected)}>
								{formatDate(entry.modifiedAt)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
