import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useConnection } from './hooks/useMacscpApi.js';
import LocalPane from './panes/LocalPane.jsx';
import RemotePane from './panes/RemotePane.jsx';
import TransferQueue from './transfer/TransferQueue.jsx';
import { runWithConcurrency } from './transfer/run-with-concurrency.js';

const TRANSFER_CONCURRENCY = 3;

const styles = {
	root: {
		display: 'flex',
		flexDirection: 'column',
		height: '100%',
		width: '100%',
		background: '#f0f0f0',
		fontFamily: '-apple-system, BlinkMacSystemFont, \'Helvetica Neue\', sans-serif',
		overflow: 'hidden',
	},
	toolbar: {
		display: 'flex',
		alignItems: 'center',
		padding: '6px 14px',
		background: '#e0e0e0',
		borderBottom: '1px solid #b8b8b8',
		gap: '12px',
		flexShrink: 0,
	},
	toolbarTitle: {
		fontSize: '14px',
		fontWeight: '700',
		color: '#222',
		margin: 0,
	},
	toolbarStatus: {
		fontSize: '12px',
		color: '#666',
	},
	panesRow: {
		flex: 1,
		display: 'flex',
		flexDirection: 'row',
		overflow: 'hidden',
		minHeight: 0,
		width: '100%',
	},
	divider: {
		width: '4px',
		background: '#c0c0c0',
		cursor: 'col-resize',
		flexShrink: 0,
		transition: 'background 0.15s',
	},
};

/**
 * アプリケーションルートコンポーネント
 * デュアルペイン（LocalPane + RemotePane）と TransferQueue を管理する
 * @returns {JSX.Element}
 */
export default function App() {
	const [sessions, setSessions] = useState([]);
	const { connectedSessions, connect, disconnect } = useConnection();

	/** 転送キューのアイテム一覧 */
	const [transferItems, setTransferItems] = useState([]);

	/** 最後に完了した転送バッチ: { id, direction, destPath, sessionId?, names } */
	const [lastTransferBatch, setLastTransferBatch] = useState(null);

	/** 内部クリップボード: { entries, sourcePath, source, sessionId? } */
	const [clipboard, setClipboard] = useState(null);

	/** ドラッグソース: 'local' | 'remote' | null */
	const [dragSource, setDragSource] = useState(null);

	/** ドラッグ終了タイマー */
	const dragEndTimer = useRef(null);

	/** セッション一覧取得 */
	const fetchSessions = useCallback(async () => {
		try {
			const list = await window.macscp.sessions.list();
			setSessions(list);
		} catch (err) {
			console.error('セッション一覧の取得に失敗しました:', err);
		}
	}, []);

	useEffect(() => {
		fetchSessions();
	}, [fetchSessions]);

	/** 転送進捗の受信登録 */
	useEffect(() => {
		window.macscp.files.onProgress((data) => {
			setTransferItems(prev =>
				prev.map(item => {
					if (item.id !== data.transferId || item.status !== 'transferring') return item;
					// ディレクトリ転送の場合（kind フィールドあり）
					if (data.kind !== undefined) {
						return {
							...item,
							currentFile: data.currentFile ?? item.currentFile,
							processedFiles: data.processedFiles ?? item.processedFiles,
							totalFiles: data.totalFiles ?? item.totalFiles,
							transferred: data.processedBytes ?? item.transferred,
							total: data.totalBytes ?? item.total,
						};
					}
					// ファイル単発転送の場合
					return { ...item, transferred: data.transferred, total: data.total };
				})
			);
		});
	}, []);

	/**
	 * 転送キューにアイテムを追加する
	 * @param {string} name - ファイル名
	 * @param {'upload'|'download'} direction
	 * @param {boolean} [isDirectory=false] - ディレクトリ転送かどうか
	 * @returns {string} - 追加アイテムの UUID
	 */
	const addTransferItem = useCallback((name, direction, isDirectory = false) => {
		const id = globalThis.crypto.randomUUID();
		setTransferItems(prev => [...prev, {
			id,
			name,
			direction,
			transferred: 0,
			total: 0,
			status: 'pending',
			isDirectory,
			currentFile: null,
			processedFiles: 0,
			totalFiles: 0,
			error: null,
		}]);
		return id;
	}, []);

	/**
	 * 転送キューのアイテムのステータスを更新する
	 * @param {string} id
	 * @param {string} status
	 * @param {Error|null} [error] - エラー時の例外オブジェクト
	 */
	const updateTransferStatus = useCallback((id, status, error = null) => {
		setTransferItems(prev =>
			prev.map(item => item.id === id
				? { ...item, status, error: error ? { message: error.message, stack: error.stack } : item.error }
				: item)
		);
	}, []);

	/**
	 * ローカル → リモートへアップロードする
	 * @param {Array<Object>} localEntries - ローカルファイルエントリ
	 * @param {string} remotePath - アップロード先リモートパス
	 * @param {string} sessionId
	 */
	const handleUpload = useCallback(async (localEntries, remotePath, sessionId) => {
		if (!sessionId || !connectedSessions[sessionId]) {
			alert('リモートセッションに接続してください。');
			return;
		}
		const successNames = [];
		await runWithConcurrency(localEntries, TRANSFER_CONCURRENCY, async (entry) => {
			const isDir = entry.isDirectory;
			const id = addTransferItem(entry.name, 'upload', isDir);
			updateTransferStatus(id, 'transferring');
			const dest = remotePath
				? `${remotePath.replace(/\/$/, '')}/${entry.name}`
				: `/${entry.name}`;
			try {
				if (isDir) {
					await window.macscp.files.uploadDirectory(sessionId, entry.path, dest, id);
				} else {
					await window.macscp.files.upload(sessionId, entry.path, dest, id);
				}
				updateTransferStatus(id, 'done');
				successNames.push(entry.name);
			} catch (err) {
				updateTransferStatus(id, 'error', err);
				console.error(`アップロード失敗 (${entry.name}):`, err);
			}
		});
		if (successNames.length > 0) {
			setLastTransferBatch({ id: Date.now(), direction: 'upload', destPath: remotePath, sessionId, names: successNames });
		}
	}, [connectedSessions, addTransferItem, updateTransferStatus]);

	/**
	 * リモート → ローカルへダウンロードする
	 * @param {Array<Object>} remoteEntries - リモートファイルエントリ（sessionId, remotePath を含む）
	 * @param {string} localDir - ダウンロード先ローカルディレクトリ
	 */
	const handleDownload = useCallback(async (remoteEntries, localDir) => {
		const successNames = [];
		await runWithConcurrency(remoteEntries, TRANSFER_CONCURRENCY, async (entry) => {
			const isDir = entry.isDirectory;
			const id = addTransferItem(entry.name, 'download', isDir);
			updateTransferStatus(id, 'transferring');
			const dest = `${localDir.replace(/\/$/, '')}/${entry.name}`;
			try {
				if (isDir) {
					await window.macscp.files.downloadDirectory(entry.sessionId, entry.remotePath, dest, id);
				} else {
					await window.macscp.files.download(entry.sessionId, entry.remotePath, dest, id);
				}
				updateTransferStatus(id, 'done');
				successNames.push(entry.name);
			} catch (err) {
				updateTransferStatus(id, 'error', err);
				console.error(`ダウンロード失敗 (${entry.name}):`, err);
			}
		});
		if (successNames.length > 0) {
			setLastTransferBatch({ id: Date.now(), direction: 'download', destPath: localDir, names: successNames });
		}
	}, [addTransferItem, updateTransferStatus]);

	/**
	 * ローカルファイル/ディレクトリを削除し TransferQueue に進捗を通知する
	 * @param {Array<Object>} entries - 削除対象エントリ（path, name を含む）
	 */
	const handleDeleteLocal = useCallback(async (entries) => {
		for (const entry of entries) {
			const id = addTransferItem(entry.name, 'delete');
			updateTransferStatus(id, 'transferring');
			try {
				await window.macscp.files.deleteLocal(entry.path);
				updateTransferStatus(id, 'done');
			} catch (err) {
				updateTransferStatus(id, 'error', err);
				console.error(`ローカル削除に失敗しました (${entry.name}):`, err);
			}
		}
	}, [addTransferItem, updateTransferStatus]);

	/**
	 * リモートファイル/ディレクトリを削除し TransferQueue に進捗を通知する
	 * @param {string} sessionId
	 * @param {Array<Object>} entries - 削除対象エントリ（path または currentPath+name, name を含む）
	 */
	const handleDeleteRemote = useCallback(async (sessionId, entries) => {
		for (const entry of entries) {
			const rp = entry.path ?? `${entry.currentPath}/${entry.name}`;
			const id = addTransferItem(entry.name, 'delete');
			updateTransferStatus(id, 'transferring');
			try {
				await window.macscp.files.rm(sessionId, rp);
				updateTransferStatus(id, 'done');
			} catch (err) {
				updateTransferStatus(id, 'error', err);
				console.error(`リモート削除に失敗しました (${entry.name}):`, err);
			}
		}
	}, [addTransferItem, updateTransferStatus]);

	/**
	 * 完了・エラーアイテムをキューからクリアする
	 */
	const handleClearQueue = useCallback(() => {
		setTransferItems(prev =>
			prev.filter(item => item.status !== 'done' && item.status !== 'error')
		);
	}, []);

	/** ドラッグ開始: ソース記録 */
	const handleLocalDragStart = useCallback(() => {
		setDragSource('local');
	}, []);

	const handleRemoteDragStart = useCallback(() => {
		setDragSource('remote');
	}, []);

	/** ドロップ後にドラッグソースをリセット */
	const resetDragSource = useCallback(() => {
		if (dragEndTimer.current) clearTimeout(dragEndTimer.current);
		dragEndTimer.current = setTimeout(() => setDragSource(null), 300);
	}, []);

	/**
	 * LocalPane → RemotePane へドロップ（アップロード）
	 * @param {Array<Object>} localEntries
	 * @param {string} remotePath
	 * @param {string} sessionId
	 */
	const handleDropToRemote = useCallback(async (localEntries, remotePath, sessionId) => {
		resetDragSource();
		await handleUpload(localEntries, remotePath, sessionId);
	}, [handleUpload, resetDragSource]);

	/**
	 * RemotePane → LocalPane へドロップ（ダウンロード）
	 * @param {Array<Object>} remoteEntries
	 * @param {string} localDir
	 */
	const handleDropToLocal = useCallback(async (remoteEntries, localDir) => {
		resetDragSource();
		await handleDownload(remoteEntries, localDir);
	}, [handleDownload, resetDragSource]);

	/** 接続中セッション数の表示テキスト */
	const connectedCount = Object.keys(connectedSessions).length;
	const statusText = connectedCount > 0
		? `${connectedCount} セッション接続中`
		: '未接続';

	return (
		<div style={styles.root}>
			{/* ツールバー */}
			<div style={styles.toolbar}>
				<span style={styles.toolbarTitle}>MacSCP</span>
				<span style={styles.toolbarStatus}>{statusText}</span>
			</div>

			{/* デュアルペイン */}
			<div style={styles.panesRow}>
				<LocalPane
					clipboard={clipboard}
					onClipboardChange={setClipboard}
					onDragStart={handleLocalDragStart}
					onDropFromRemote={handleDropToLocal}
					dragSource={dragSource}
					lastTransferBatch={lastTransferBatch}
					onDeleteLocal={handleDeleteLocal}
				/>

				<div style={styles.divider} />

				<RemotePane
					sessions={sessions}
					onSessionsChange={fetchSessions}
					clipboard={clipboard}
					onClipboardChange={setClipboard}
					onDragStart={handleRemoteDragStart}
					onDropFromLocal={handleDropToRemote}
					dragSource={dragSource}
					connectedSessions={connectedSessions}
					onConnect={connect}
					onDisconnect={disconnect}
					lastTransferBatch={lastTransferBatch}
					onDeleteRemote={handleDeleteRemote}
				/>
			</div>

			{/* 転送キュー */}
			<TransferQueue items={transferItems} onClear={handleClearQueue} />
		</div>
	);
}
