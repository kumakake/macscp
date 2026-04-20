import { useState, useCallback } from 'react';

/**
 * セッション接続状態と操作を管理するフック
 * @returns {{ connectedSessions: Object, connect: Function, disconnect: Function }}
 */
export function useConnection() {
	const [connectedSessions, setConnectedSessions] = useState({});

	/**
	 * 指定セッションへ接続する
	 * @param {string} sessionId
	 */
	const connect = useCallback(async (sessionId) => {
		await window.macscp.files.connect(sessionId);
		setConnectedSessions(prev => ({ ...prev, [sessionId]: true }));
	}, []);

	/**
	 * 指定セッションを切断する
	 * @param {string} sessionId
	 */
	const disconnect = useCallback(async (sessionId) => {
		await window.macscp.files.disconnect(sessionId);
		setConnectedSessions(prev => {
			const next = { ...prev };
			delete next[sessionId];
			return next;
		});
	}, []);

	return { connectedSessions, connect, disconnect };
}

/**
 * ファイル一覧取得フック
 * @returns {{ entries: Array, currentPath: string, loading: boolean, error: string|null, loadRemote: Function, loadLocal: Function }}
 */
export function useFileList() {
	const [entries, setEntries] = useState([]);
	const [currentPath, setCurrentPath] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	/**
	 * リモートディレクトリ一覧を取得する
	 * @param {string} sessionId
	 * @param {string} remotePath
	 */
	const loadRemote = useCallback(async (sessionId, remotePath) => {
		setLoading(true);
		setError(null);
		try {
			const list = await window.macscp.files.list(sessionId, remotePath);
			setEntries(list);
			setCurrentPath(remotePath);
		} catch (e) {
			setError(e.message);
		} finally {
			setLoading(false);
		}
	}, []);

	/**
	 * ローカルディレクトリ一覧を取得する
	 * @param {string} dirPath
	 */
	const loadLocal = useCallback(async (dirPath) => {
		setLoading(true);
		setError(null);
		try {
			const list = await window.macscp.files.listLocal(dirPath);
			setEntries(list);
			setCurrentPath(dirPath);
		} catch (e) {
			setError(e.message);
		} finally {
			setLoading(false);
		}
	}, []);

	return { entries, currentPath, loading, error, loadRemote, loadLocal };
}
