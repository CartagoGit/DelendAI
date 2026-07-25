import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';
import { buildBrowserInspectToolRegistrations } from '../tools/browser-inspect.tool';

const driver = {
	navigate: async ({ url }: { url: string }) => ({
		url,
		title: 'Example',
		status: 200,
	}),
	screenshot: async () => ({
		path: '/cache/browser/screenshots/example.png',
		bytes: 42,
		format: 'png' as const,
		width: 1_280,
		height: 720,
	}),
	query: async () => ({
		url: 'https://example.test/',
		hits: [{ selector: 'h1', text: 'Hello', tag: 'h1' }],
	}),
};

const registration = (id: string) => {
	const found = buildBrowserInspectToolRegistrations({
		namespacePrefix: 'mcp',
		pluginCacheDir: '/cache/browser',
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
		})) as { url: string; title: string; status: number };
		expect(output).toEqual({
			tool: 'browser_open',
			url: 'https://example.test',
			title: 'Example',
			status: 200,
		});
	});

	it('returns a screenshot artifact from the injected driver', async () => {
		const captured = await captureToolRegistration(
			registration('browser_screenshot'),
		);
		const output = (await captured.invoke({
			url: 'https://example.test/docs',
		})) as { path: string; format: string };
		expect(output.path).toBe('/cache/browser/screenshots/example.png');
		expect(output.format).toBe('png');
	});

	it('passes bounded DOM queries to the injected driver', async () => {
		const captured = await captureToolRegistration(
			registration('browser_query'),
		);
		const output = (await captured.invoke({
			url: 'https://example.test',
			selector: 'h1',
			limit: 3,
		})) as { hits: Array<{ text: string }> };
		expect(output.hits).toEqual([
			{ selector: 'h1', text: 'Hello', tag: 'h1' },
		]);
	});

	it('returns an actionable install hint without a browser driver', async () => {
		const found = buildBrowserInspectToolRegistrations({
			namespacePrefix: 'mcp',
			pluginCacheDir: '/cache/browser',
		}).find((entry) => entry.id === 'browser_open');
		if (found === undefined)
			throw new Error('missing browser_open registration');
		const captured = await captureToolRegistration(found);
		const output = await captured.invokeRaw({
			url: 'https://example.test',
		});
		expect(output.isError).toBe(true);
		expect(output.payload).toMatchObject({
			error: { nextAction: expect.stringContaining('playwright') },
		});
	});
});
