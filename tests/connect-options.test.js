/**
 * @file connect-options.test.js
 * @description electron/protocols/connect-options.js の単体テスト
 *
 * 鍵ファイルは os.tmpdir() に実ファイルとして作成して使用する。
 */

import { buildConnectOptions } from '../electron/protocols/connect-options.js';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

/** テスト用の仮の秘密鍵内容（接続には使わない） */
const FAKE_KEY_CONTENT = '-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----\n';

const TMP_KEY_PATH = path.join(os.tmpdir(), 'macscp-test-private-key');

beforeAll(async () => {
	await writeFile(TMP_KEY_PATH, FAKE_KEY_CONTENT, { encoding: 'utf8' });
});

afterAll(async () => {
	await unlink(TMP_KEY_PATH).catch(() => {});
});

describe('buildConnectOptions() - password 認証', () => {
	const session = {
		host: 'test.example.com',
		port: 22,
		username: 'user',
		authType: 'password',
		privateKeyPath: null,
	};

	test('host / port / username が opts に含まれる', async () => {
		const opts = await buildConnectOptions(session, 'secret');
		expect(opts.host).toBe('test.example.com');
		expect(opts.port).toBe(22);
		expect(opts.username).toBe('user');
	});

	test('opts.password にパスワードが設定される', async () => {
		const opts = await buildConnectOptions(session, 'mypassword');
		expect(opts.password).toBe('mypassword');
	});

	test('パスワード未指定時は空文字になる', async () => {
		const opts = await buildConnectOptions(session);
		expect(opts.password).toBe('');
	});

	test('opts.privateKey / opts.agent は含まれない', async () => {
		const opts = await buildConnectOptions(session, 'pw');
		expect(opts.privateKey).toBeUndefined();
		expect(opts.agent).toBeUndefined();
	});

	test('port 省略時のデフォルトは 22', async () => {
		const noPort = { ...session, port: undefined };
		const opts = await buildConnectOptions(noPort, 'pw');
		expect(opts.port).toBe(22);
	});
});

describe('buildConnectOptions() - key 認証', () => {
	const session = {
		host: 'keyauth.example.com',
		port: 2222,
		username: 'keyuser',
		authType: 'key',
		privateKeyPath: TMP_KEY_PATH,
	};

	test('opts.privateKey に鍵ファイルの内容が読み込まれる', async () => {
		const opts = await buildConnectOptions(session, '');
		expect(opts.privateKey).toBeDefined();
		expect(opts.privateKey.toString()).toContain('OPENSSH PRIVATE KEY');
	});

	test('パスフレーズを渡すと opts.passphrase に設定される', async () => {
		const opts = await buildConnectOptions(session, 'my-passphrase');
		expect(opts.passphrase).toBe('my-passphrase');
	});

	test('パスフレーズが空の場合 opts.passphrase は設定されない', async () => {
		const opts = await buildConnectOptions(session, '');
		expect(opts.passphrase).toBeUndefined();
	});

	test('パスフレーズ未指定の場合 opts.passphrase は設定されない', async () => {
		const opts = await buildConnectOptions(session);
		expect(opts.passphrase).toBeUndefined();
	});

	test('opts.password は含まれない', async () => {
		const opts = await buildConnectOptions(session, 'pw');
		expect(opts.password).toBeUndefined();
	});

	test('privateKeyPath が未指定の場合エラーを投げる', async () => {
		const noKey = { ...session, privateKeyPath: null };
		await expect(buildConnectOptions(noKey)).rejects.toThrow('秘密鍵パスが指定されていません');
	});

	test('存在しないパスの場合エラーを投げる', async () => {
		const badPath = { ...session, privateKeyPath: '/nonexistent/path/key' };
		await expect(buildConnectOptions(badPath)).rejects.toThrow('秘密鍵の読み込みに失敗しました');
	});
});

describe('buildConnectOptions() - agent 認証', () => {
	const session = {
		host: 'agent.example.com',
		port: 22,
		username: 'agentuser',
		authType: 'agent',
		privateKeyPath: null,
	};

	test('SSH_AUTH_SOCK が設定されていれば opts.agent に反映される', async () => {
		const originalSock = process.env.SSH_AUTH_SOCK;
		process.env.SSH_AUTH_SOCK = '/tmp/fake-agent.sock';
		try {
			const opts = await buildConnectOptions(session);
			expect(opts.agent).toBe('/tmp/fake-agent.sock');
		} finally {
			if (originalSock === undefined) {
				delete process.env.SSH_AUTH_SOCK;
			} else {
				process.env.SSH_AUTH_SOCK = originalSock;
			}
		}
	});

	test('SSH_AUTH_SOCK が未設定の場合エラーを投げる', async () => {
		const originalSock = process.env.SSH_AUTH_SOCK;
		delete process.env.SSH_AUTH_SOCK;
		try {
			await expect(buildConnectOptions(session)).rejects.toThrow('SSH エージェントのソケットが見つかりません');
		} finally {
			if (originalSock !== undefined) {
				process.env.SSH_AUTH_SOCK = originalSock;
			}
		}
	});
});

describe('buildConnectOptions() - 未対応認証方式', () => {
	test('authType が不明な値の場合エラーを投げる', async () => {
		const session = {
			host: 'x.com', port: 22, username: 'u',
			authType: 'unknown',
			privateKeyPath: null,
		};
		await expect(buildConnectOptions(session)).rejects.toThrow('未対応の認証方式');
	});
});
