import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFileList } from '../hooks/useMacscpApi.js';
import { formatSize, formatDate } from '../utils/format.js';
import SessionEditor from '../sessions/SessionEditor.jsx';

/**
 * トースト通知のスタイル（右下固定）
 */
const toastStyle = {
	position: 'fixed',
	bottom: '1rem',
	right: '1rem',
	background: '#333',
	color: '#fff',
	padding: '0.5rem 1rem',
	borderRadius: '4px',
	fontSize: '13px',
	zIndex: 9999,
};

const styles = {
	pane: {
		flex: 1,
		display: 'flex',
		flexDirection: 'column',
		background: '#f0f0f0',
		minWidth: 0,
		fontFamily: '-apple-system, BlinkMacSystemFont, \'Helvetica Neue\', sans-serif',
	},
	sessionBar: {
		display: 'flex',
		alignItems: 'center',
		gap: '8px',
		padding: '6px 10px',
		background: '#e0e0e0',
		borderBottom: '1px solid #c0c0c0',
	},
	sessionLabel: {
		fontSize: '11px',
		fontWeight: '600',
		color: '#555',
		flexShrink: 0,
	},
	sessionSelect: {
		flex: 1,
		border: '1px solid #aaa',
		borderRadius: '4px',
		padding: '3px 6px',
		fontSize: '12px',
		background: '#fff',
		color: '#222',
		cursor: 'pointer',
		outline: 'none',
	},
	connectButton: (connected) => ({
		background: connected ? '#d0f0d0' : '#0064d2',
		color: connected ? '#006000' : '#fff',
		border: connected ? '1px solid #80c080' : 'none',
		borderRadius: '4px',
		padding: '3px 12px',
		fontSize: '12px',
		fontWeight: '600',
		cursor: 'pointer',
		flexShrink: 0,
	}),
	connectedDot: {
		width: '8px',
		height: '8px',
		borderRadius: '50%',
		background: '#00a000',
		display: 'inline-block',
		marginRight: '4px',
	},
	pathBar: {
		display: 'flex',
		alignItems: 'center',
		gap: '6px',
		padding: '6px 10px',
		background: '#e8e8e8',
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
	permCell: (isSelected) => ({
		flex: 1,
		fontSize: '11px',
		padding: '2px 8px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		color: isSelected ? '#dde' : '#aaa',
		fontFamily: 'monospace',
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
	notConnected: {
		flex: 1,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		color: '#999',
		gap: '8px',
		fontSize: '13px',
	},
	contextMenu: {
		position: 'fixed',
		background: '#fff',
		border: '1px solid #ccc',
		borderRadius: '4px',
		boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
		zIndex: 8888,
		minWidth: '120px',
		padding: '4px 0',
	},
	contextMenuItem: {
		padding: '6px 14px',
		fontSize: '13px',
		cursor: 'pointer',
		color: '#222',
		userSelect: 'none',
	},
};

/**
 * リモートファイルシステムブラウザペインコンポーネント
 * @param {Object} props
 * @param {Array<Object>} props.sessions - 保存済みセッション一覧
 * @param {Object|null} props.clipboard - 内部クリップボード { entries, sourcePath, source }
 * @param {function} props.onClipboardChange - クリップボード更新ハンドラ
 * @param {function} props.onDragStart - ドラッグ開始時のハンドラ (entries) => void
 * @param {function} props.onDropFromLocal - ローカルからドロップ受け付け時のハンドラ (localEntries, remotePath, sessionId) => void
 * @param {string|null} props.dragSource - 現在ドラッグ中のソース ('local'|'remote'|null)
 * @param {string|null} props.activeSessionId - 現在接続中のセッション ID（外部から制御）
 * @param {Object} props.connectedSessions - 接続済みセッションマップ
 * @param {function} props.onConnect - 接続ハンドラ
 * @param {function} props.onDisconnect - 切断ハンドラ
 * @param {Object|null} props.lastTransferBatch - 最後に完了した転送バッチ { id, direction, destPath, sessionId, names }
 */
export default function RemotePane({
	sessions,
	onSessionsChange,
	clipboard,
	onClipboardChange,
	onDragStart,
	onDropFromLocal,
	dragSource,
	connectedSessions,
	onConnect,
	onDisconnect,
	lastTransferBatch,
	onDeleteRemote,
}) {
	const { entries, currentPath, loading, error, loadRemote } = useFileList();
	const [selectedSessionId, setSelectedSessionId] = useState('');
	const [selected, setSelected] = useState([]);
	const [pathInput, setPathInput] = useState('');
	const [connecting, setConnecting] = useState(false);
	const [connectError, setConnectError] = useState(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const paneRef = useRef(null);

	const [sortKey, setSortKey] = useState(null);
	const [sortOrder, setSortOrder] = useState('asc');
	const [showMkdirModal, setShowMkdirModal] = useState(false);
	const [mkdirName, setMkdirName] = useState('');
	const [mkdirError, setMkdirError] = useState('');

	const [showRenameModal, setShowRenameModal] = useState(false);
	const [renameOldName, setRenameOldName] = useState('');
	const [renameNewName, setRenameNewName] = useState('');
	const [renameError, setRenameError] = useState('');

	/** セッションエディタモーダル */
	const [showEditor, setShowEditor] = useState(false);
	const [editingSession, setEditingSession] = useState(null);

	/** 新規セッション作成モーダルを開く */
	const openNewSession = useCallback(() => {
		setEditingSession(null);
		setShowEditor(true);
	}, []);

	/** 選択中のセッションを編集するモーダルを開く */
	const openEditSession = useCallback(() => {
		if (!selectedSessionId) return;
		const target = sessions.find(s => s.id === selectedSessionId);
		if (!target) return;
		setEditingSession(target);
		setShowEditor(true);
	}, [selectedSessionId, sessions]);

	/** 選択中のセッションを削除する */
	const deleteSelectedSession = useCallback(async () => {
		if (!selectedSessionId) return;
		const target = sessions.find(s => s.id === selectedSessionId);
		if (!target) return;
		const label = target.name || target.host || selectedSessionId;
		if (!window.confirm(`セッション「${label}」を削除しますか？`)) return;
		try {
			await window.macscp.sessions.delete(selectedSessionId);
			// 先に一覧を再取得 → useEffect が selectedSessionId を整合させる
			if (onSessionsChange) await onSessionsChange();
		} catch (err) {
			alert(`セッションの削除に失敗しました: ${err.message}`);
		}
	}, [selectedSessionId, sessions, onSessionsChange]);

	/** セッション保存後の処理 */
	const handleEditorSave = useCallback(async () => {
		setShowEditor(false);
		if (onSessionsChange) await onSessionsChange();
	}, [onSessionsChange]);

	/** 編集中のファイルマップ: remotePath → tmpPath */
	const [editingFiles, setEditingFiles] = useState({});

	/** トースト通知メッセージ */
	const [toast, setToast] = useState(null);
	const toastTimerRef = useRef(null);

	/** コンテキストメニューの表示位置とターゲットエントリ */
	const [contextMenu, setContextMenu] = useState(null);

	const isConnected = !!(selectedSessionId && connectedSessions[selectedSessionId]);

	/** editor:event の購読（saved / error イベントを受け取る） */
	useEffect(() => {
		if (!window.macscp?.editor) return;
		window.macscp.editor.onEvent((data) => {
			if (data.event === 'saved') {
				showToast(`保存・アップロード済み: ${data.data.remotePath}`);
			} else if (data.event === 'error') {
				showToast(`アップロードエラー: ${data.data.message}`);
			}
		});
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/**
	 * トーストメッセージを 3 秒間表示する
	 * @param {string} message
	 */
	function showToast(message) {
		setToast(message);
		if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
		toastTimerRef.current = setTimeout(() => setToast(null), 3000);
	}

	/**
	 * リモートファイルを外部エディタで開く
	 * @param {Object} entry - ファイルエントリ
	 */
	const handleOpenInEditor = useCallback(async (entry) => {
		if (entry.isDirectory) return;
		const rp = entry.path ?? `${currentPath}/${entry.name}`;
		try {
			const tmpPath = await window.macscp.editor.open(selectedSessionId, rp, 'default');
			setEditingFiles(prev => ({ ...prev, [rp]: tmpPath }));
		} catch (e) {
			showToast(`エディタを開けませんでした: ${e.message}`);
		}
	}, [currentPath, selectedSessionId]);

	/** セッション一覧変更時に selectedSessionId を整合させる */
	useEffect(() => {
		if (sessions.length === 0) {
			if (selectedSessionId !== '') setSelectedSessionId('');
			return;
		}
		// 削除などで現在の selectedSessionId が無効になった場合は先頭へ
		if (!sessions.some(s => s.id === selectedSessionId)) {
			setSelectedSessionId(sessions[0].id);
		}
	}, [sessions, selectedSessionId]);

	/** currentPath が変わったらパス入力欄も更新 */
	useEffect(() => {
		setPathInput(currentPath);
		setSelected([]);
	}, [currentPath]);

	/** アップロード完了時: 現在のパスが転送先かつセッションが一致なら自動リロード */
	useEffect(() => {
		if (!lastTransferBatch) return;
		if (lastTransferBatch.direction !== 'upload') return;
		if (lastTransferBatch.sessionId !== selectedSessionId) return;
		if (lastTransferBatch.destPath !== currentPath) return;
		loadRemote(selectedSessionId, currentPath);
	// currentPath, loadRemote, selectedSessionId は意図的に依存から除外（バッチ変化時のみ発火）
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lastTransferBatch]);

	/** アップロード完了後 entries 更新時: 転送ファイルを選択状態にする */
	useEffect(() => {
		if (!lastTransferBatch) return;
		if (lastTransferBatch.direction !== 'upload') return;
		if (lastTransferBatch.sessionId !== selectedSessionId) return;
		if (lastTransferBatch.destPath !== currentPath) return;
		const picked = entries.filter(e => lastTransferBatch.names.includes(e.name));
		if (picked.length > 0) setSelected(picked);
	}, [entries, lastTransferBatch, currentPath, selectedSessionId]);

	/**
	 * 指定パスへ移動する
	 * @param {string} dir
	 */
	const navigateTo = useCallback(async (dir) => {
		if (!selectedSessionId || !isConnected) return;
		await loadRemote(selectedSessionId, dir);
	}, [selectedSessionId, isConnected, loadRemote]);

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
	 * セッション接続/切断を切り替える
	 */
	const handleToggleConnect = async () => {
		if (!selectedSessionId) return;
		setConnectError(null);
		setConnecting(true);
		try {
			if (isConnected) {
				await onDisconnect(selectedSessionId);
				setSelected([]);
				setPathInput('');
			} else {
				await onConnect(selectedSessionId);
				// 接続後にルートへ移動
				await loadRemote(selectedSessionId, '/');
			}
		} catch (e) {
			setConnectError(`接続エラー: ${e.message}`);
		} finally {
			setConnecting(false);
		}
	};

	/**
	 * セッション選択変更
	 * @param {string} id
	 */
	const handleSessionChange = (id) => {
		setSelectedSessionId(id);
		setSelected([]);
		setPathInput('');
	};

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
			await navigateTo(entry.path ?? `${currentPath}/${entry.name}`);
		}
	};

	/**
	 * ドラッグ開始ハンドラ
	 * @param {React.DragEvent} e
	 * @param {Object} entry
	 */
	const handleDragStart = (e, entry) => {
		const targets = selected.some(s => s.name === entry.name) ? selected : [entry];
		const enriched = targets.map(t => ({
			...t,
			sessionId: selectedSessionId,
			remotePath: t.path ?? `${currentPath}/${t.name}`,
		}));
		e.dataTransfer.setData('application/x-macscp-remote', JSON.stringify(enriched));
		e.dataTransfer.effectAllowed = 'copy';
		if (onDragStart) onDragStart(targets);
	};

	/** ローカルからのドラッグオーバー処理 */
	const handleDragOver = (e) => {
		if (dragSource === 'local') {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
			setIsDragOver(true);
		}
	};

	const handleDragLeave = () => {
		setIsDragOver(false);
	};

	/**
	 * ローカルからのドロップ処理
	 * @param {React.DragEvent} e
	 */
	const handleDrop = (e) => {
		e.preventDefault();
		setIsDragOver(false);
		const raw = e.dataTransfer.getData('application/x-macscp-local');
		if (!raw) return;
		try {
			const localEntries = JSON.parse(raw);
			if (onDropFromLocal) {
				onDropFromLocal(localEntries, currentPath, selectedSessionId);
			}
		} catch {
			console.error('ドロップデータの解析に失敗しました');
		}
	};

	/**
	 * コンテキストメニューを閉じる
	 */
	const closeContextMenu = useCallback(() => {
		setContextMenu(null);
	}, []);

	/**
	 * 右クリックでコンテキストメニューを表示する
	 * @param {React.MouseEvent} e
	 * @param {Object} entry
	 */
	const handleContextMenu = useCallback((e, entry) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY, entry });
	}, []);

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
	 * リモートにディレクトリを作成する
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
			await window.macscp.files.mkdir(selectedSessionId, newPath);
			setShowMkdirModal(false);
			await loadRemote(selectedSessionId, currentPath);
		} catch (err) {
			setMkdirError(`作成に失敗しました: ${err.message}`);
		}
	}, [mkdirName, currentPath, selectedSessionId, loadRemote]);

	/**
	 * 選択中のリモートファイル/ディレクトリを削除する
	 */
	const deleteSelected = useCallback(async () => {
		if (selected.length === 0) return;
		const names = selected.map(s => s.name).join(', ');
		if (!window.confirm(`以下のファイルをリモートから削除しますか？\n${names}`)) return;
		if (onDeleteRemote) {
			const entries = selected.map(e => ({
				...e,
				path: e.path ?? `${currentPath}/${e.name}`,
			}));
			await onDeleteRemote(selectedSessionId, entries);
		} else {
			for (const entry of selected) {
				const rp = entry.path ?? `${currentPath}/${entry.name}`;
				try {
					await window.macscp.files.rm(selectedSessionId, rp);
				} catch (err) {
					alert(`削除に失敗しました: ${entry.name}\n${err.message}`);
				}
			}
		}
		await navigateTo(currentPath);
	}, [selected, currentPath, selectedSessionId, navigateTo, onDeleteRemote]);

	/**
	 * リネームモーダルを開く
	 * @param {Object} entry
	 */
	const openRenameModal = useCallback((entry) => {
		setRenameOldName(entry.name);
		setRenameNewName(entry.name);
		setRenameError('');
		setShowRenameModal(true);
		setContextMenu(null);
	}, []);

	/**
	 * リモートファイル/ディレクトリの名前を変更する
	 */
	const handleRename = useCallback(async () => {
		const trimmed = renameNewName.trim();
		if (!trimmed || trimmed === renameOldName) { setShowRenameModal(false); return; }
		const base = currentPath.endsWith('/') ? currentPath : currentPath + '/';
		const oldPath = base + renameOldName;
		const newPath = base + trimmed;
		try {
			await window.macscp.files.rename(selectedSessionId, oldPath, newPath);
			setShowRenameModal(false);
			setRenameError('');
			await loadRemote(selectedSessionId, currentPath);
		} catch (err) {
			setRenameError(err.message);
		}
	}, [renameNewName, renameOldName, currentPath, selectedSessionId, loadRemote]);

	/**
	 * キーボードショートカット処理（フォーカス時のみ）
	 * @param {React.KeyboardEvent} e
	 */
	const handleKeyDown = useCallback((e) => {
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
		// ⌘C または F5: 選択ファイルをコピー
		if ((e.metaKey && e.key === 'c') || e.key === 'F5') {
			if (selected.length > 0) {
				onClipboardChange({
					entries: selected.map(t => ({
						...t,
						sessionId: selectedSessionId,
						remotePath: t.path ?? `${currentPath}/${t.name}`,
					})),
					sourcePath: currentPath,
					source: 'remote',
					sessionId: selectedSessionId,
				});
			}
			return;
		}
		// ⌘R: 更新
		if (e.metaKey && e.key === 'r') {
			e.preventDefault();
			if (isConnected) navigateTo(currentPath);
			return;
		}
		// Delete: リモート削除
		if (e.key === 'Delete' || e.key === 'Backspace') {
			deleteSelected();
		}
	}, [selected, currentPath, selectedSessionId, isConnected, onClipboardChange, navigateTo, deleteSelected]);

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
			onClick={closeContextMenu}
		>
			{/* トースト通知 */}
			{toast && <div style={toastStyle}>{toast}</div>}

			{/* コンテキストメニュー */}
			{contextMenu && (
				<div
					style={{ ...styles.contextMenu, left: contextMenu.x, top: contextMenu.y }}
					onClick={e => e.stopPropagation()}
				>
					{!contextMenu.entry.isDirectory && (
						<div
							style={styles.contextMenuItem}
							onMouseEnter={e => { e.currentTarget.style.background = '#e8f0ff'; }}
							onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
							onClick={() => {
								handleOpenInEditor(contextMenu.entry);
								closeContextMenu();
							}}
						>
							✎ エディタで編集
						</div>
					)}
					<div
						style={styles.contextMenuItem}
						onMouseEnter={e => { e.currentTarget.style.background = '#e8f0ff'; }}
						onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
						onClick={() => openRenameModal(contextMenu.entry)}
					>
						✎ 名前変更
					</div>
					<div
						style={{ ...styles.contextMenuItem, color: '#c62828' }}
						onMouseEnter={e => { e.currentTarget.style.background = '#fff0f0'; }}
						onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
						onClick={() => { closeContextMenu(); deleteSelected(); }}
					>
						✕ 削除
					</div>
				</div>
			)}
			{/* セッション新規作成モーダル */}
			{showEditor && (
				<div style={{
					position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
					display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
				}}>
					<div style={{ background: '#1e1e2e', borderRadius: '8px', width: '520px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
						<SessionEditor
							session={editingSession}
							onSave={handleEditorSave}
							onCancel={() => setShowEditor(false)}
						/>
					</div>
				</div>
			)}

			{/* セッション選択バー */}
			<div style={{ ...styles.sessionBar, flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<span style={styles.sessionLabel}>セッション:</span>
					<select
						style={styles.sessionSelect}
						value={selectedSessionId}
						onChange={e => handleSessionChange(e.target.value)}
						disabled={isConnected}
					>
						{sessions.length === 0 ? (
							<option value=''>（セッションなし）</option>
						) : (
							sessions.map(s => (
								<option key={s.id} value={s.id}>
									{s.name || '(名前なし)'} — {s.host}
								</option>
							))
						)}
					</select>
					{isConnected && <span style={styles.connectedDot} />}
					<button
						style={styles.connectButton(isConnected)}
						onClick={handleToggleConnect}
						disabled={!selectedSessionId || connecting}
					>
						{connecting ? '...' : isConnected ? '切断' : '接続'}
					</button>
				</div>
				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
					<button
						style={{
							background: '#f0f0f0',
							color: '#333',
							border: '1px solid #b8b8b8',
							borderRadius: '4px',
							padding: '3px 12px',
							fontSize: '12px',
							fontWeight: '600',
							cursor: (!selectedSessionId || isConnected) ? 'not-allowed' : 'pointer',
							opacity: (!selectedSessionId || isConnected) ? 0.5 : 1,
						}}
						onClick={openEditSession}
						disabled={!selectedSessionId || isConnected}
					>
						編集
					</button>
					<button
						style={{
							background: '#f0f0f0',
							color: '#c62828',
							border: '1px solid #b8b8b8',
							borderRadius: '4px',
							padding: '3px 12px',
							fontSize: '12px',
							fontWeight: '600',
							cursor: (!selectedSessionId || isConnected) ? 'not-allowed' : 'pointer',
							opacity: (!selectedSessionId || isConnected) ? 0.5 : 1,
						}}
						onClick={deleteSelectedSession}
						disabled={!selectedSessionId || isConnected}
					>
						削除
					</button>
					<button
						style={{
							background: '#4a9eff',
							color: '#fff',
							border: 'none',
							borderRadius: '4px',
							padding: '3px 12px',
							fontSize: '12px',
							fontWeight: '600',
							cursor: 'pointer',
						}}
						onClick={openNewSession}
					>
						＋ 新規セッション
					</button>
				</div>
			</div>

			{/* 接続エラー */}
			{connectError && <div style={styles.errorBar}>{connectError}</div>}

			{/* 未接続の場合 */}
			{!isConnected ? (
				<div style={styles.notConnected}>
					<span>セッションを選択して「接続」ボタンを押してください</span>
				</div>
			) : (
				<>
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
						<button
							style={{
								...styles.refreshButton,
								opacity: selected.length !== 1 ? 0.4 : 1,
								cursor: selected.length !== 1 ? 'not-allowed' : 'pointer',
							}}
							disabled={selected.length !== 1}
							onClick={() => selected.length === 1 && openRenameModal(selected[0])}
							title='名前変更'
						>
							✎
						</button>
						<button
							style={{
								...styles.refreshButton,
								opacity: selected.length === 0 ? 0.4 : 1,
								cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
							}}
							disabled={selected.length === 0}
							onClick={deleteSelected}
							title='削除'
						>
							✕
						</button>
					</div>

					{/* 名前変更モーダル */}
					{showRenameModal && (
						<div style={{
							position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
							display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
						}} onClick={() => setShowRenameModal(false)}>
							<div style={{
								background: '#1e1e2e', borderRadius: '8px', width: '360px',
								padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
							}} onClick={e => e.stopPropagation()}>
								<div style={{ color: '#cdd6f4', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
									名前変更
								</div>
								<input
									style={{
										width: '100%', boxSizing: 'border-box',
										background: '#313244', border: '1px solid #45475a',
										borderRadius: '4px', padding: '6px 10px',
										color: '#cdd6f4', fontSize: '13px', outline: 'none', marginBottom: '8px',
									}}
									value={renameNewName}
									onChange={e => { setRenameNewName(e.target.value); setRenameError(''); }}
									onKeyDown={e => {
										if (e.key === 'Enter') handleRename();
										if (e.key === 'Escape') setShowRenameModal(false);
									}}
									autoFocus
								/>
								{renameError && (
									<div style={{ color: '#f38ba8', fontSize: '12px', marginBottom: '8px' }}>
										{renameError}
									</div>
								)}
								<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
									<button
										style={{
											background: '#45475a', color: '#cdd6f4', border: 'none',
											borderRadius: '4px', padding: '6px 16px', fontSize: '13px', cursor: 'pointer',
										}}
										onClick={() => setShowRenameModal(false)}
									>
										キャンセル
									</button>
									<button
										style={{
											background: '#89b4fa', color: '#1e1e2e', border: 'none',
											borderRadius: '4px', padding: '6px 16px', fontSize: '13px',
											fontWeight: '600', cursor: 'pointer',
										}}
										onClick={handleRename}
									>
										変更
									</button>
								</div>
							</div>
						</div>
					)}

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
						<div style={styles.headerCell(1)}>パーミッション</div>
					</div>

					{/* ファイル一覧 */}
					<div style={styles.tableBody}>
						{sortedEntries.map((entry) => {
							const isSelected = selected.some(s => s.name === entry.name);
							const rp = entry.path ?? `${currentPath}/${entry.name}`;
							const isEditing = !entry.isDirectory && !!editingFiles[rp];
							return (
								<div
									key={entry.name}
									style={styles.row(isSelected, false)}
									onClick={e => handleRowClick(e, entry)}
									onDoubleClick={() => handleDoubleClick(entry)}
									onContextMenu={e => handleContextMenu(e, { ...entry, path: rp })}
									draggable={true}
									onDragStart={e => handleDragStart(e, { ...entry, path: rp })}
								>
									<div style={styles.nameCell(isSelected)}>
										<span>{entry.isDirectory ? '📁' : '📄'}</span>
										<span>{entry.name}</span>
										{isEditing && (
											<span
												title='編集中（自動アップロード有効）'
												style={{ fontSize: '11px', color: isSelected ? '#ffe' : '#f90', marginLeft: '2px' }}
											>
												✎
											</span>
										)}
									</div>
									<div style={styles.sizeCell(isSelected)}>
										{entry.isDirectory ? '—' : formatSize(entry.size)}
									</div>
									<div style={styles.dateCell(isSelected)}>
										{formatDate(entry.modifiedAt)}
									</div>
									<div style={styles.permCell(isSelected)}>
										{entry.permissions || '—'}
									</div>
								</div>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}
