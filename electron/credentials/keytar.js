import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const keytar = require('keytar');

/** macOS Keychain のサービス名 */
const SERVICE = 'com.kumakake.macscp';

/**
 * Keychain にシークレット（パスワード / パスフレーズ）を保存する
 * @param {string} sessionId - セッション ID（アカウント名として使用）
 * @param {string} secret - 保存するシークレット文字列
 * @returns {Promise<void>}
 */
export async function saveCredential(sessionId, secret) {
	try {
		await keytar.setPassword(SERVICE, sessionId, secret);
	} catch (err) {
		throw new Error(`Keychain への保存に失敗しました: ${err.message}`);
	}
}

/**
 * Keychain からシークレットを取得する
 * @param {string} sessionId - セッション ID
 * @returns {Promise<string|null>} シークレット文字列、存在しない場合は null
 */
export async function getCredential(sessionId) {
	try {
		return await keytar.getPassword(SERVICE, sessionId);
	} catch (err) {
		throw new Error(`Keychain からの取得に失敗しました: ${err.message}`);
	}
}

/**
 * Keychain からシークレットを削除する
 * @param {string} sessionId - セッション ID
 * @returns {Promise<boolean>} 削除できた場合 true
 */
export async function deleteCredential(sessionId) {
	try {
		return await keytar.deletePassword(SERVICE, sessionId);
	} catch (err) {
		throw new Error(`Keychain からの削除に失敗しました: ${err.message}`);
	}
}
