import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SSHConfig = require('ssh-config');

/** ~/.ssh ディレクトリのパス */
const SSH_DIR = path.join(os.homedir(), '.ssh');

/** ~/.ssh/config のパス */
const SSH_CONFIG_PATH = path.join(SSH_DIR, 'config');

/**
 * ~/.ssh/config を読み込み、Host エントリを配列で返す
 * @returns {Promise<Array<{host: string, hostname: string, user: string, port: number, identityFile: string|null}>>}
 */
export async function readSshHosts() {
	try {
		const content = await fs.readFile(SSH_CONFIG_PATH, 'utf-8');
		const config = SSHConfig.parse(content);

		const hosts = [];

		for (const block of config) {
			// Host セクションのみ処理（Match セクションは除外）
			if (block.param !== 'Host') continue;
			// ワイルドカードのみのエントリは除外
			if (!block.value || block.value === '*') continue;

			const entry = {
				host: block.value,
				hostname: '',
				user: '',
				port: 22,
				identityFile: null,
			};

			for (const line of (block.config ?? [])) {
				const key = (line.param ?? '').toLowerCase();
				if (key === 'hostname') entry.hostname = line.value ?? '';
				if (key === 'user') entry.user = line.value ?? '';
				if (key === 'port') entry.port = parseInt(line.value, 10) || 22;
				if (key === 'identityfile') {
					// ~ をホームディレクトリに展開
					entry.identityFile = (line.value ?? '').replace(/^~/, os.homedir());
				}
			}

			hosts.push(entry);
		}

		return hosts;
	} catch (err) {
		if (err.code === 'ENOENT') {
			// ~/.ssh/config が存在しない場合は空配列を返す
			return [];
		}
		throw new Error(`SSH config の読み込みに失敗しました: ${err.message}`);
	}
}

/**
 * ~/.ssh/id_* ファイルを列挙し、.pub なしの秘密鍵候補を返す
 * @returns {Promise<string[]>} 秘密鍵ファイルの絶対パス配列
 */
export async function listPrivateKeys() {
	try {
		const files = await fs.readdir(SSH_DIR);

		// id_ で始まるファイルを抽出
		const idFiles = files.filter((f) => f.startsWith('id_'));

		// 公開鍵（.pub）のセット
		const pubSet = new Set(
			idFiles.filter((f) => f.endsWith('.pub')).map((f) => f.slice(0, -4))
		);

		// 対応する公開鍵が存在しない、または .pub でない秘密鍵を返す
		const privateKeys = idFiles
			.filter((f) => !f.endsWith('.pub'))
			.map((f) => path.join(SSH_DIR, f));

		return privateKeys;
	} catch (err) {
		if (err.code === 'ENOENT') {
			return [];
		}
		throw new Error(`SSH 秘密鍵の列挙に失敗しました: ${err.message}`);
	}
}
