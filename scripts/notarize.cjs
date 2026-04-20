'use strict';

const { notarize } = require('@electron/notarize');

/**
 * electron-builder の afterSign フック
 * 環境変数 APPLE_ID / APPLE_ID_PASSWORD / APPLE_TEAM_ID が設定されている場合のみ実行
 */
exports.default = async function notarizing(context) {
	const { electronPlatformName, appOutDir } = context;

	// macOS ビルド以外はスキップ
	if (electronPlatformName !== 'darwin') return;

	// CI/CD 環境変数が未設定の場合はスキップ（ローカル開発用）
	if (!process.env.APPLE_ID) {
		console.log('APPLE_ID が未設定のため notarization をスキップします');
		return;
	}

	const appName = context.packager.appInfo.productFilename;
	const appPath = `${appOutDir}/${appName}.app`;

	console.log(`notarization を開始します: ${appPath}`);

	await notarize({
		appBundleId: 'com.kumakake.macscp',
		appPath,
		appleId: process.env.APPLE_ID,
		appleIdPassword: process.env.APPLE_ID_PASSWORD,
		teamId: process.env.APPLE_TEAM_ID,
	});

	console.log('notarization が完了しました');
};
