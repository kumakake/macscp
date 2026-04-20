import { test, expect } from './fixtures.js';

test.describe('アプリ起動', () => {
	test('Electron ウィンドウが起動する', async ({ window }) => {
		await expect(window).toHaveTitle(/MacSCP/);
	});

	test('IPC ping が応答する', async ({ window }) => {
		const result = await window.evaluate(() => window.macscp.ping());
		expect(result).toBe('pong');
	});

	test('ローカルペインが表示される', async ({ window }) => {
		// LocalPane が描画されていること
		const localPane = window.locator('[data-testid="local-pane"]').or(
			window.locator('text=ローカル').or(window.locator('text=Local'))
		);
		await expect(localPane.first()).toBeVisible({ timeout: 10000 });
	});
});
