import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';

import { buildBrowserInspectToolRegistrations } from './browser-inspect.tool';
import { PLAYWRIGHT_INSTALL_HINT } from '../page/playwright-probe';
import type { IBrowserDriver } from '../page/ibrowser-driver';

const fakeDriver = (): IBrowserDriver => ({
	open: async ({ url }: { url: string }) => ({
		url,
		title: 'Example Domain',
		html: '<html><body><h1>Example Domain</h1></body></html>',
	}),
	navigate: async ({ url }: { url: string }) => ({
		url,
		title: 'Example Domain',
		html: '<html><body><h1>Example Domain</h1></body></html>',
	}),
	screenshot: async () => ({
		data: Uint8Array.from([1, 2, 3, 4]),
		format: 'png',
	}),
	query: async ({ url, selector }: { url: string; selector: string }) => ({
		url,
		matches: [`${selector}:first`, `${selector}:second`],
	}),
	assert: async () => ({ passed: true }),
});

const registration = (
	id: string,
	options: Omit<
		Parameters<typeof buildBrowserInspectToolRegistrations>[0],
		'namespacePrefix'
	>,
) => {
	const found = buildBrowserInspectToolRegistrations({
		namespacePrefix: 'browser',
		...options,
	}).find((entry) => entry.id === id);
	if (found === undefined) throw new Error(`missing registration: ${id}`);
	return found;
};

const UNUSED_CACHE_DIR = '/tmp/browser-inspect-spec-unused';

describe('browser-inspect (f00125 S1)', () => {
	it('browser_open happy path with a mock driver', async () => {
		const captured = await captureToolRegistration(
			registration('browser_open', {
				pluginCacheDir: UNUSED_CACHE_DIR,
				driver: fakeDriver(),
			}),
		);
		const output = (await captured.invoke({
			url: 'https://example.com',
			headless: true,
		})) as { url: string; title: string; html: string; status: string };
		expect(output).toEqual({
			url: 'https://example.com/',
			title: 'Example Domain',
			html: '<html><body><h1>Example Domain</h1></body></html>',
			status: 'ok',
		});
	});

	it('browser_screenshot writes a file under the resolved cache dir', async () => {
		const cacheDir = await mkdtemp(join(tmpdir(), 'browser-inspect-'));
		try {
			const captured = await captureToolRegistration(
				registration('browser_screenshot', {
					pluginCacheDir: cacheDir,
					driver: fakeDriver(),
				}),
			);
			const output = (await captured.invoke({
				url: 'https://example.com/docs',
				fullPage: true,
			})) as { url: string; path: string; status: string };
			expect(output.status).toBe('ok');
			expect(output.path).toMatch(
				new RegExp(`^${cacheDir}/browser/\\d+\\.png$`),
			);
			const bytes = await readFile(output.path);
			expect([...bytes]).toEqual([1, 2, 3, 4]);
		} finally {
			await rm(cacheDir, { recursive: true, force: true });
		}
	});

	it('browser_query returns the matched texts', async () => {
		const captured = await captureToolRegistration(
			registration('browser_query', {
				pluginCacheDir: UNUSED_CACHE_DIR,
				driver: fakeDriver(),
			}),
		);
		const output = (await captured.invoke({
			url: 'https://example.com',
			selector: 'h1',
		})) as { url: string; matches: readonly string[]; status: string };
		expect(output).toEqual({
			url: 'https://example.com/',
			matches: ['h1:first', 'h1:second'],
			status: 'ok',
		});
	});

	it('missing Playwright returns install-missing for all three actions', async () => {
		const probeTool = async () => ({
			unavailable: true,
			hint: PLAYWRIGHT_INSTALL_HINT,
		});
		for (const toolId of [
			'browser_open',
			'browser_screenshot',
			'browser_query',
		]) {
			const captured = await captureToolRegistration(
				registration(toolId, {
					pluginCacheDir: UNUSED_CACHE_DIR,
					probeTool,
				}),
			);
			const output = (await captured.invoke({
				url: 'https://example.com',
				...(toolId === 'browser_query' ? { selector: 'h1' } : {}),
			})) as { url: string; status: string; hint: string };
			expect(output.status).toBe('install-missing');
			expect(output.url).toBe('https://example.com/');
			expect(output.hint).toBe(PLAYWRIGHT_INSTALL_HINT);
		}
	});
});
