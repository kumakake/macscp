/**
 * @file s3.js
 * @description @aws-sdk/client-s3 を使った S3 / MinIO プロトコルアダプタ
 *
 * セッションの追加フィールド:
 *   - bucket: バケット名
 *   - region: リージョン（省略時 'us-east-1'）
 *   - endpoint: カスタムエンドポイント（MinIO 用。例: 'http://localhost:9000'）
 *
 * password は "accessKeyId:secretAccessKey" 形式で渡す
 */

import {
	S3Client,
	ListObjectsV2Command,
	GetObjectCommand,
	PutObjectCommand,
	DeleteObjectCommand,
	CopyObjectCommand,
} from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

/**
 * S3 / MinIO アダプタを生成して返す
 * @returns {import('../../shared/protocol-types.js').ProtocolAdapter}
 */
export function createS3Adapter() {
	/** @type {S3Client|null} */
	let s3 = null;
	/** @type {string} */
	let bucket = '';

	return {
		/**
		 * S3 / MinIO に接続する（S3Client を初期化する）
		 * @param {Object} session - セッション情報
		 * @param {string} [session.bucket] - バケット名
		 * @param {string} [session.region] - リージョン（省略時 'us-east-1'）
		 * @param {string} [session.endpoint] - カスタムエンドポイント（MinIO 用）
		 * @param {string} [password] - "accessKeyId:secretAccessKey" 形式の認証情報
		 * @returns {Promise<void>}
		 */
		async connect(session, password) {
			try {
				// password を "accessKeyId:secretAccessKey" 形式でパースする
				const [accessKeyId = '', secretAccessKey = ''] = (password ?? ':').split(':');
				bucket = session.bucket ?? '';

				s3 = new S3Client({
					region: session.region ?? 'us-east-1',
					endpoint: session.endpoint || undefined,
					// MinIO にはパス形式の URL が必要
					forcePathStyle: !!session.endpoint,
					credentials: { accessKeyId, secretAccessKey },
				});
			} catch (err) {
				s3 = null;
				throw new Error(`S3 接続の初期化に失敗しました: ${err.message}`);
			}
		},

		/**
		 * S3 接続をリセットする（S3Client は stateless なので null にするだけ）
		 * @returns {Promise<void>}
		 */
		async disconnect() {
			s3 = null;
			bucket = '';
		},

		/**
		 * リモートパス（プレフィックス）の一覧を取得する
		 * S3 の CommonPrefixes をディレクトリ、Contents をファイルとして扱う
		 * @param {string} remotePath - リモートディレクトリパス（先頭スラッシュは除去する）
		 * @returns {Promise<import('../../shared/protocol-types.js').FileEntry[]>}
		 */
		async list(remotePath) {
			try {
				const prefix = remotePath.replace(/^\//, '');
				const cmd = new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: prefix ? `${prefix}/` : '',
					Delimiter: '/',
				});
				const res = await s3.send(cmd);

				// CommonPrefixes を仮想ディレクトリとして扱う
				const dirs = (res.CommonPrefixes ?? []).map((p) => ({
					name: path.posix.basename(p.Prefix.replace(/\/$/, '')),
					path: `/${p.Prefix}`,
					isDirectory: true,
					size: 0,
					modifiedAt: null,
					permissions: '',
				}));

				// 現在のプレフィックス自体（空オブジェクト）は除外する
				const currentKey = prefix ? `${prefix}/` : '';
				const files = (res.Contents ?? [])
					.filter((o) => o.Key !== currentKey)
					.map((o) => ({
						name: path.posix.basename(o.Key),
						path: `/${o.Key}`,
						isDirectory: false,
						size: o.Size ?? 0,
						modifiedAt: o.LastModified ?? null,
						permissions: '',
					}));

				return [...dirs, ...files];
			} catch (err) {
				throw new Error(`ディレクトリ一覧の取得に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * リモートファイル/ディレクトリの情報を取得する
		 * 親ディレクトリの list 結果から対象エントリを検索する
		 * @param {string} remotePath - リモートパス
		 * @returns {Promise<import('../../shared/protocol-types.js').FileEntry>}
		 */
		async stat(remotePath) {
			try {
				const dir = path.posix.dirname(remotePath);
				const name = path.posix.basename(remotePath);
				const entries = await this.list(dir);
				const entry = entries.find((e) => e.name === name);
				if (!entry) {
					throw new Error(`${remotePath} が見つかりません`);
				}
				return entry;
			} catch (err) {
				throw new Error(`ファイル情報の取得に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * S3 からローカルへファイルをダウンロードする
		 * @param {string} remotePath - リモートファイルパス
		 * @param {string} localPath - ローカル保存先パス
		 * @param {(transferred: number, total: number) => void} [onProgress] - 進捗コールバック（未使用）
		 * @returns {Promise<void>}
		 */
		async download(remotePath, localPath, onProgress) {
			try {
				const key = remotePath.replace(/^\//, '');
				const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
				await pipeline(res.Body, createWriteStream(localPath));
			} catch (err) {
				throw new Error(`ダウンロードに失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * ローカルから S3 へファイルをアップロードする
		 * @param {string} localPath - ローカルファイルパス
		 * @param {string} remotePath - リモート保存先パス
		 * @param {(transferred: number, total: number) => void} [onProgress] - 進捗コールバック（未使用）
		 * @returns {Promise<void>}
		 */
		async upload(localPath, remotePath, onProgress) {
			try {
				const key = remotePath.replace(/^\//, '');
				const body = await fs.readFile(localPath);
				await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
			} catch (err) {
				throw new Error(`アップロードに失敗しました (${localPath}): ${err.message}`);
			}
		},

		/**
		 * S3 に仮想ディレクトリを作成する
		 * S3 にはディレクトリの概念がないため、末尾スラッシュ付きの空オブジェクトを作成する
		 * @param {string} remotePath - 作成するディレクトリのパス
		 * @returns {Promise<void>}
		 */
		async mkdir(remotePath) {
			try {
				const key = `${remotePath.replace(/^\//, '').replace(/\/$/, '')}/`;
				await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: '' }));
			} catch (err) {
				throw new Error(`ディレクトリ作成に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * S3 のオブジェクトを削除する
		 * @param {string} remotePath - 削除するパス
		 * @returns {Promise<void>}
		 */
		async rm(remotePath) {
			try {
				const key = remotePath.replace(/^\//, '');
				await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
			} catch (err) {
				throw new Error(`削除に失敗しました (${remotePath}): ${err.message}`);
			}
		},

		/**
		 * S3 のオブジェクトをリネームする（コピー後に元オブジェクトを削除する）
		 * @param {string} oldPath - 変更前のパス
		 * @param {string} newPath - 変更後のパス
		 * @returns {Promise<void>}
		 */
		async rename(oldPath, newPath) {
			try {
				const oldKey = oldPath.replace(/^\//, '');
				const newKey = newPath.replace(/^\//, '');
				await s3.send(new CopyObjectCommand({
					Bucket: bucket,
					CopySource: `${bucket}/${oldKey}`,
					Key: newKey,
				}));
				await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
			} catch (err) {
				throw new Error(`リネームに失敗しました (${oldPath} → ${newPath}): ${err.message}`);
			}
		},
	};
}
