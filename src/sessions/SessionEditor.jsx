import React, { useState, useEffect } from 'react';

/** プロトコルに対応するデフォルトポート番号 */
const DEFAULT_PORTS = {
	sftp: 22,
	scp: 22,
	ftp: 21,
	ftps: 990,
	webdav: 80,
	s3: 443,
};

/** 利用可能なプロトコル一覧 */
const PROTOCOLS = ['sftp', 'scp', 'ftp', 'ftps', 'webdav', 's3'];

/** 認証方式一覧 */
const AUTH_TYPES = [
	{ value: 'password', label: 'パスワード' },
	{ value: 'key', label: '秘密鍵' },
	{ value: 'agent', label: 'SSH エージェント' },
];

const styles = {
	container: {
		flex: 1,
		background: '#181825',
		display: 'flex',
		flexDirection: 'column',
		height: '100%',
		overflow: 'auto',
	},
	placeholder: {
		flex: 1,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		color: '#6c7086',
		fontSize: '14px',
	},
	header: {
		padding: '16px 24px',
		borderBottom: '1px solid #313244',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	headerTitle: {
		color: '#cdd6f4',
		fontSize: '16px',
		fontWeight: '600',
		margin: 0,
	},
	form: {
		padding: '24px',
		display: 'flex',
		flexDirection: 'column',
		gap: '18px',
		maxWidth: '560px',
	},
	fieldGroup: {
		display: 'flex',
		flexDirection: 'column',
		gap: '6px',
	},
	label: {
		color: '#a6adc8',
		fontSize: '12px',
		fontWeight: '600',
		letterSpacing: '0.5px',
	},
	input: {
		background: '#313244',
		border: '1px solid #45475a',
		borderRadius: '6px',
		color: '#cdd6f4',
		fontSize: '13px',
		padding: '8px 10px',
		outline: 'none',
		width: '100%',
		boxSizing: 'border-box',
	},
	select: {
		background: '#313244',
		border: '1px solid #45475a',
		borderRadius: '6px',
		color: '#cdd6f4',
		fontSize: '13px',
		padding: '8px 10px',
		outline: 'none',
		width: '100%',
		boxSizing: 'border-box',
		cursor: 'pointer',
	},
	row: {
		display: 'flex',
		gap: '12px',
	},
	autoFillButton: {
		background: '#45475a',
		border: 'none',
		borderRadius: '6px',
		color: '#cdd6f4',
		fontSize: '12px',
		padding: '6px 12px',
		cursor: 'pointer',
		marginTop: '4px',
		alignSelf: 'flex-start',
	},
	buttonRow: {
		display: 'flex',
		gap: '10px',
		marginTop: '8px',
	},
	saveButton: {
		background: '#89b4fa',
		color: '#1e1e2e',
		border: 'none',
		borderRadius: '6px',
		padding: '9px 24px',
		fontSize: '13px',
		fontWeight: '600',
		cursor: 'pointer',
	},
	cancelButton: {
		background: '#45475a',
		color: '#cdd6f4',
		border: 'none',
		borderRadius: '6px',
		padding: '9px 24px',
		fontSize: '13px',
		cursor: 'pointer',
	},
	sshHostModal: {
		position: 'fixed',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		background: 'rgba(0,0,0,0.5)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 1000,
	},
	sshHostBox: {
		background: '#1e1e2e',
		border: '1px solid #313244',
		borderRadius: '10px',
		padding: '20px',
		width: '400px',
		maxHeight: '400px',
		display: 'flex',
		flexDirection: 'column',
	},
	sshHostTitle: {
		color: '#cdd6f4',
		fontSize: '14px',
		fontWeight: '600',
		marginBottom: '12px',
	},
	sshHostList: {
		flex: 1,
		overflowY: 'auto',
	},
	sshHostItem: {
		padding: '8px 10px',
		cursor: 'pointer',
		borderRadius: '5px',
		color: '#cdd6f4',
		fontSize: '13px',
	},
	sshHostClose: {
		background: '#45475a',
		border: 'none',
		borderRadius: '6px',
		color: '#cdd6f4',
		padding: '7px 16px',
		cursor: 'pointer',
		fontSize: '12px',
		marginTop: '12px',
		alignSelf: 'flex-end',
	},
	status: {
		color: '#a6e3a1',
		fontSize: '12px',
		marginTop: '4px',
	},
	statusError: {
		color: '#f38ba8',
		fontSize: '12px',
		marginTop: '4px',
	},
};

/**
 * セッション編集フォームコンポーネント
 * @param {Object} props
 * @param {Object|null} props.session - 編集対象のセッション（null = 新規）
 * @param {function} props.onSave - 保存完了ハンドラ
 * @param {function} props.onCancel - キャンセルハンドラ
 */
export default function SessionEditor({ session, onSave, onCancel }) {
	const isNew = !session?.id;

	const [form, setForm] = useState({
		name: '',
		protocol: 'sftp',
		host: '',
		port: 22,
		username: '',
		authType: 'password',
		privateKeyPath: null,
	});
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [privateKeys, setPrivateKeys] = useState([]);
	const [sshHosts, setSshHosts] = useState([]);
	const [showSshModal, setShowSshModal] = useState(false);
	const [status, setStatus] = useState('');
	const [statusError, setStatusError] = useState('');

	// セッションが変わったらフォームを更新
	useEffect(() => {
		if (session) {
			setForm({
				name: session.name ?? '',
				protocol: session.protocol ?? 'sftp',
				host: session.host ?? '',
				port: session.port ?? 22,
				username: session.username ?? '',
				authType: session.authType ?? 'password',
				privateKeyPath: session.privateKeyPath ?? null,
			});
			setPassword('');
			setStatus('');
			setStatusError('');

			// 既存セッションの場合は Keychain からパスワード/パスフレーズを読み込む
			if (session.id && ['password', 'key'].includes(session.authType)) {
				window.macscp.sessions.getCredential(session.id)
					.then((cred) => { if (cred) setPassword(cred); })
					.catch(() => {});
			}
		} else {
			setForm({
				name: '',
				protocol: 'sftp',
				host: '',
				port: 22,
				username: '',
				authType: 'password',
				privateKeyPath: null,
			});
			setPassword('');
			setStatus('');
			setStatusError('');
		}
	}, [session]);

	// 秘密鍵一覧を初期読み込み
	useEffect(() => {
		window.macscp.ssh.privateKeys()
			.then(setPrivateKeys)
			.catch(() => setPrivateKeys([]));
	}, []);

	/**
	 * フォームフィールドの変更を反映する
	 * @param {string} key - フォームのキー
	 * @param {*} value - 新しい値
	 */
	const handleChange = (key, value) => {
		setForm((prev) => {
			const next = { ...prev, [key]: value };
			// プロトコル変更時にデフォルトポートを自動設定
			if (key === 'protocol') {
				next.port = DEFAULT_PORTS[value] ?? 22;
			}
			return next;
		});
	};

	/**
	 * SSH ホスト補完モーダルを開く
	 */
	const handleOpenSshHosts = async () => {
		try {
			const hosts = await window.macscp.ssh.hosts();
			setSshHosts(hosts);
			setShowSshModal(true);
		} catch (err) {
			setStatusError(`SSH config の読み込みに失敗しました: ${err.message}`);
		}
	};

	/**
	 * SSH ホスト一覧から選択してフォームを補完する
	 * @param {Object} h - SSH ホストエントリ
	 */
	const handleSelectSshHost = (h) => {
		setForm((prev) => ({
			...prev,
			name: prev.name || h.host,
			host: h.hostname || h.host,
			port: h.port ?? 22,
			username: h.user || prev.username,
			privateKeyPath: h.identityFile ?? prev.privateKeyPath,
			authType: h.identityFile ? 'key' : prev.authType,
		}));
		setShowSshModal(false);
	};

	/**
	 * フォームを保存する
	 */
	const handleSave = async () => {
		setStatus('');
		setStatusError('');

		if (!form.name.trim()) {
			setStatusError('セッション名を入力してください。');
			return;
		}
		if (!form.host.trim()) {
			setStatusError('ホスト名を入力してください。');
			return;
		}

		try {
			const saved = await window.macscp.sessions.save({ ...form, id: session?.id });

			// パスワード/パスフレーズを Keychain に保存
			if (['password', 'key'].includes(form.authType) && password) {
				await window.macscp.sessions.saveCredential(saved.id, password);
			}

			setStatus('保存しました。');
			onSave(saved);
		} catch (err) {
			setStatusError(`保存に失敗しました: ${err.message}`);
		}
	};

	if (!session && !isNew) {
		return (
			<div style={styles.container}>
				<div style={styles.placeholder}>
					左のリストからセッションを選択するか、新規ボタンで作成してください。
				</div>
			</div>
		);
	}

	return (
		<div style={styles.container}>
			<div style={styles.header}>
				<h2 style={styles.headerTitle}>
					{isNew ? '新規セッション' : `セッション編集: ${session.name || '(名前なし)'}`}
				</h2>
			</div>

			<div style={styles.form}>
				{/* セッション名 */}
				<div style={styles.fieldGroup}>
					<label style={styles.label}>セッション名</label>
					<input
						style={styles.input}
						type='text'
						value={form.name}
						onChange={(e) => handleChange('name', e.target.value)}
						placeholder='例: 本番サーバー'
					/>
				</div>

				{/* プロトコル */}
				<div style={styles.fieldGroup}>
					<label style={styles.label}>プロトコル</label>
					<select
						style={styles.select}
						value={form.protocol}
						onChange={(e) => handleChange('protocol', e.target.value)}
					>
						{PROTOCOLS.map((p) => (
							<option key={p} value={p}>
								{p.toUpperCase()}
							</option>
						))}
					</select>
				</div>

				{/* ホスト / ポート */}
				<div style={styles.row}>
					<div style={{ ...styles.fieldGroup, flex: 3 }}>
						<label style={styles.label}>ホスト名 / IP</label>
						<input
							style={styles.input}
							type='text'
							value={form.host}
							onChange={(e) => handleChange('host', e.target.value)}
							placeholder='例: example.com'
						/>
					</div>
					<div style={{ ...styles.fieldGroup, flex: 1 }}>
						<label style={styles.label}>ポート</label>
						<input
							style={styles.input}
							type='number'
							value={form.port}
							onChange={(e) => handleChange('port', parseInt(e.target.value, 10) || 22)}
							min={1}
							max={65535}
						/>
					</div>
				</div>

				{/* ユーザー名 */}
				<div style={styles.fieldGroup}>
					<label style={styles.label}>ユーザー名</label>
					<input
						style={styles.input}
						type='text'
						value={form.username}
						onChange={(e) => handleChange('username', e.target.value)}
						placeholder='例: ubuntu'
					/>
				</div>

				{/* SSH ホスト補完ボタン */}
				{(form.protocol === 'sftp' || form.protocol === 'scp') && (
					<div style={styles.fieldGroup}>
						<button style={styles.autoFillButton} onClick={handleOpenSshHosts}>
							SSH config からホストを補完
						</button>
					</div>
				)}

				{/* 認証方式 */}
				<div style={styles.fieldGroup}>
					<label style={styles.label}>認証方式</label>
					<select
						style={styles.select}
						value={form.authType}
						onChange={(e) => handleChange('authType', e.target.value)}
					>
						{AUTH_TYPES.map((a) => (
							<option key={a.value} value={a.value}>
								{a.label}
							</option>
						))}
					</select>
				</div>

				{/* パスワード入力（password 認証のとき） */}
				{form.authType === 'password' && (
					<div style={styles.fieldGroup}>
						<label style={styles.label}>パスワード（Keychain に保存）</label>
						<div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
							<input
								style={{ ...styles.input, paddingRight: '36px' }}
								type={showPassword ? 'text' : 'password'}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder='パスワードを入力...'
							/>
							<button
								type='button'
								onClick={() => setShowPassword(v => !v)}
								style={{
									position: 'absolute',
									right: '8px',
									background: 'none',
									border: 'none',
									cursor: 'pointer',
									color: '#888',
									fontSize: '16px',
									padding: '0',
									lineHeight: 1,
								}}
								title={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
							>
								{showPassword ? '🙈' : '👁'}
							</button>
						</div>
					</div>
				)}

				{/* 秘密鍵選択（key 認証のとき） */}
				{form.authType === 'key' && (
					<div style={styles.fieldGroup}>
						<label style={styles.label}>秘密鍵</label>
						<div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
							<select
								style={{ ...styles.select, flex: 1 }}
								value={form.privateKeyPath ?? ''}
								onChange={(e) => handleChange('privateKeyPath', e.target.value || null)}
							>
								<option value=''>秘密鍵を選択...</option>
								{privateKeys.map((k) => (
									<option key={k} value={k}>
										{k}
									</option>
								))}
							</select>
							<button
								type='button'
								style={{
									background: '#f0f0f0',
									color: '#333',
									border: '1px solid #b8b8b8',
									borderRadius: '4px',
									padding: '4px 10px',
									fontSize: '12px',
									cursor: 'pointer',
									whiteSpace: 'nowrap',
								}}
								onClick={async () => {
									const picked = await window.macscp.ssh.pickPrivateKey();
									if (!picked) return;
									if (!privateKeys.includes(picked)) {
										setPrivateKeys(prev => [...prev, picked]);
									}
									handleChange('privateKeyPath', picked);
								}}
							>
								参照...
							</button>
						</div>
						{/* パスフレーズ入力 */}
						<label style={{ ...styles.label, marginTop: '10px' }}>
							パスフレーズ（任意・Keychain に保存）
						</label>
						<div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
							<input
								style={{ ...styles.input, paddingRight: '36px' }}
								type={showPassword ? 'text' : 'password'}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder='パスフレーズを入力...'
							/>
							<button
								type='button'
								onClick={() => setShowPassword(v => !v)}
								style={{
									position: 'absolute',
									right: '8px',
									background: 'none',
									border: 'none',
									cursor: 'pointer',
									color: '#888',
									fontSize: '16px',
									padding: '0',
									lineHeight: 1,
								}}
								title={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
							>
								{showPassword ? '🙈' : '👁'}
							</button>
						</div>
					</div>
				)}

				{/* ステータスメッセージ */}
				{status && <p style={styles.status}>{status}</p>}
				{statusError && <p style={styles.statusError}>{statusError}</p>}

				{/* ボタン */}
				<div style={styles.buttonRow}>
					<button style={styles.saveButton} onClick={handleSave}>
						保存
					</button>
					<button style={styles.cancelButton} onClick={onCancel}>
						キャンセル
					</button>
				</div>
			</div>

			{/* SSH ホスト補完モーダル */}
			{showSshModal && (
				<div style={styles.sshHostModal} onClick={() => setShowSshModal(false)}>
					<div style={styles.sshHostBox} onClick={(e) => e.stopPropagation()}>
						<div style={styles.sshHostTitle}>~/.ssh/config のホスト一覧</div>
						<div style={styles.sshHostList}>
							{sshHosts.length === 0 ? (
								<p style={{ color: '#6c7086', fontSize: '13px' }}>
									ホストが見つかりませんでした
								</p>
							) : (
								sshHosts.map((h, i) => (
									<div
										key={i}
										style={styles.sshHostItem}
										onClick={() => handleSelectSshHost(h)}
										onMouseEnter={(e) => { e.currentTarget.style.background = '#313244'; }}
										onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
									>
										<strong>{h.host}</strong>{' '}
										<span style={{ color: '#6c7086', fontSize: '11px' }}>
											{h.hostname ? `→ ${h.hostname}` : ''}
											{h.user ? ` · ${h.user}` : ''}
										</span>
									</div>
								))
							)}
						</div>
						<button style={styles.sshHostClose} onClick={() => setShowSshModal(false)}>
							閉じる
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
