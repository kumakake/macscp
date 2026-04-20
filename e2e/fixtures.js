import { test as base, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const test = base.extend({
	// Electron アプリを起動して最初のウィンドウを返すフィクスチャ
	electronApp: async ({}, use) => {
		const app = await electron.launch({
			args: [path.join(__dirname, '..', 'electron', 'main.js')],
			env: {
				...process.env,
				NODE_ENV: 'production',
				ELECTRON_IS_DEV: '0',
			},
		});
		await use(app);
		await app.close();
	},

	window: async ({ electronApp }, use) => {
		const page = await electronApp.firstWindow();
		await page.waitForLoadState('domcontentloaded');
		await use(page);
	},
});

export { expect } from '@playwright/test';
