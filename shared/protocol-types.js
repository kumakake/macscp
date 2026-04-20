/**
 * @file protocol-types.js
 * @description プロトコルアダプタで使用する共通インターフェースの型定義
 */

/**
 * リモートファイルエントリ
 * @typedef {Object} FileEntry
 * @property {string} name - ファイル名
 * @property {string} path - フルパス
 * @property {boolean} isDirectory - ディレクトリの場合 true
 * @property {number} size - ファイルサイズ（バイト）
 * @property {Date} modifiedAt - 最終更新日時
 * @property {string} permissions - パーミッション文字列（例: '-rw-r--r--'）
 */

/**
 * 転送進捗情報
 * @typedef {Object} TransferProgress
 * @property {string} name - ファイル名
 * @property {number} transferred - 転送済みバイト数
 * @property {number} total - 合計バイト数
 */

/**
 * すべてのプロトコルアダプタが実装すべきインターフェース（JSDoc のみ、実装なし）
 * @typedef {Object} ProtocolAdapter
 * @property {(session: Object, password?: string) => Promise<void>} connect - サーバーへ接続する
 * @property {() => Promise<void>} disconnect - 接続を切断する
 * @property {(remotePath: string) => Promise<FileEntry[]>} list - ディレクトリ一覧を取得する
 * @property {(remotePath: string) => Promise<FileEntry>} stat - ファイル情報を取得する
 * @property {(remotePath: string, localPath: string, onProgress?: (transferred: number, total: number) => void) => Promise<void>} download - リモートからローカルへダウンロードする
 * @property {(localPath: string, remotePath: string, onProgress?: (transferred: number, total: number) => void) => Promise<void>} upload - ローカルからリモートへアップロードする
 * @property {(remotePath: string) => Promise<void>} mkdir - リモートにディレクトリを作成する
 * @property {(remotePath: string) => Promise<void>} rm - リモートのファイル/ディレクトリを削除する
 * @property {(oldPath: string, newPath: string) => Promise<void>} rename - リモートのファイル/ディレクトリをリネームする
 */

export {};
