import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';
import { buildBrowserInspectToolRegistrations } from '../tools/browser-inspect.tool';

const driver = {
	open: async ({ url }: { url: string }) => ({
		url,
		title: 'Example',
		html: '<html><body>Hello</body></html>',
	}),
	navigate: async ({ url }: { url: string }) => ({
		url,
		title: 'Example',
		html: '<html><body>Hello</body></html>',
	}),
	screenshot: async () => ({
		data: Uint8Array.from([7, 8, 9]),
	}),
	query: async () => ({
		url: 'https://example.test/',
		matches: ['Hello'],
	}),
	assert: async () => ({ passed: true }),
};

const registration = (id: string, pluginCacheDir = '/cache/browser') => {
	const found = buildBrowserInspectToolRegistrations({
		namespacePrefix: 'mcp',
		pluginCacheDir,
		driver,
	}).find((entry) => entry.id === id);
	if (found === undefined) throw new Error(`missing registration: ${id}`);
	return found;
};

describe('browser page tools', () => {
	it('opens a normalized HTTP(S) URL through the injected driver', async () => {
		const captured = await captureToolRegistration(
			registration('browser_open'),
		);
		const output = (await captured.invoke({
			url: 'https://example.test',
		})) as { url: string; title: string; html: string; status: string };
		expect(output).toEqual({
			url: 'https://example.test/',
			title: 'Example',
			html: '<html><body>Hello</body></html>',
			status: 'ok',
		});
	});

	it('returns a screenshot path from the injected driver write', async () => {
		const cacheDir = await mkdtemp(join(tmpdir(), 'browser-page-tool-'));
		try {
			const captured = await captureToolRegistration(
				registration('browser_screenshot', cacheDir),
			);
			const output = (await captured.invoke({
				url: 'https://example.test/docs',
			})) as { path: string; status: string };
			expect(output.path).toMatch(
				new RegExp(`^${cacheDir}/browser/\\d+\\.png$`),
			);
			expect(output.status).toBe('ok');
		} finally {
			await rm(cacheDir, { recursive: true, force: true });
		}
	});

	it('passes bounded DOM queries to the injected driver', async () => {
		const captured = await captureToolRegistration(
			registration('browser_query'),
		);
		const output = (await captured.invoke({
			url: 'https://example.test',
			selector: 'h1',
		})) as { matches: string[]; status: string };
		expect(output.matches).toEqual(['Hello']);
		expect(output.status).toBe('ok');
	});

	it('returns an actionable install hint without a browser driver', async () => {
		const found = buildBrowserInspectToolRegistrations({
			namespacePrefix: 'mcp',
			pluginCacheDir: '/cache/browser',
		}).find((entry) => entry.id === 'browser_open');
		if (found === undefined)
			throw new Error('missing browser_open registration');
		const captured = await captureToolRegistration(found);
		const output = (await captured.invoke({
			url: 'https://example.test',
		})) as { status: string; hint: string };
		expect(output).toMatchObject({
			status: 'install-missing',
			hint: expect.stringContaining('playwright'),
		});
	});
});
