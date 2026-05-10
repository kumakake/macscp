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
 * @property {string} owner - 所有者名または UID 文字列（取得不可の場合は空文字列）
 * @property {string} group - グループ名または GID 文字列（取得不可の場合は空文字列）
 */

/**
 * 転送進捗情報
 * @typedef {Object} TransferProgress
 * @property {string} name - ファイル名
 * @property {number} transferred - 転送済みバイト数
 * @property {number} total - 合計バイト数
 */

/**
 * ディレクトリ転送の進捗情報
 * @typedef {Object} DirectoryProgress
 * @property {'file-start'|'file-progress'|'file-done'|'overall'|'error'} kind
 * @property {string} [currentFile] - dirRoot からの相対パス
 * @property {number} [transferred] - 当該ファイルの転送済バイト
 * @property {number} [total] - 当該ファイルの合計バイト
 * @property {number} processedFiles - 完了ファイル数
 * @property {number} totalFiles - スキャン済合計ファイル数（不明なら 0）
 * @property {number} processedBytes - 完了済バイト合計
 * @property {number} totalBytes - スキャン済合計バイト（不明なら 0）
 * @property {string} [error]
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
 * @property {(localDir: string, remoteDir: string, onProgress?: (info: DirectoryProgress) => void) => Promise<void>} putDirectory
 * @property {(remoteDir: string, localDir: string, onProgress?: (info: DirectoryProgress) => void) => Promise<void>} getDirectory
 */

export {};
