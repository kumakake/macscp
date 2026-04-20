/**
 * @file connect-options.js
 * @description SSH 接続オプション生成の共通モジュール
 */

import fs from 'fs/promises';

/**
 * SSH 接続オプションを構築する（パスワード/秘密鍵/agent 認証に対応）
 * @param {Object} session - セッション設定
 * @param {string} session.host - ホスト名
 * @param {number} [session.port] - ポート番号（省略時 22）
 * @param {string} session.username - ユーザー名
 * @param {string} session.authType - 認証方式 ('password'|'key'|'agent')
 * @param {string|null} [session.privateKeyPath] - 秘密鍵ファイルパス
 * @param {string} [password] - パスワードまたは秘密鍵パスフレーズ
 * @returns {Promise<Object>} ssh2 互換の接続オプション
 */
export async function buildConnectOptions(session, password) {
	const opts = {
		host: session.host,
		port: session.port ?? 22,
		username: session.username,
	};

	switch (session.authType) {
		case 'password':
			opts.password = password ?? '';
			break;

		case 'key': {
			if (!session.privateKeyPath) {
				throw new Error('秘密鍵パスが指定されていません');
			}
			try {
				opts.privateKey = await fs.readFile(session.privateKeyPath);
			} catch (err) {
				throw new Error(`秘密鍵の読み込みに失敗しました: ${err.message}`);
			}
			if (password) {
				opts.passphrase = password;
			}
			break;
		}

		case 'agent':
			opts.agent = process.env.SSH_AUTH_SOCK;
			if (!opts.agent) {
				throw new Error('SSH エージェントのソケットが見つかりません（SSH_AUTH_SOCK が未設定）');
			}
			break;

		default:
			throw new Error(`未対応の認証方式: ${session.authType}`);
	}

	return opts;
}
