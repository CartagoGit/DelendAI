import { describe, expect, it } from 'vitest';

import { buildBrowserInspectToolRegistrations } from './browser-inspect.tool';
import type {
	IBrowserDriver,
	INavigateResult,
	IQueryHit,
	IQueryResult,
	IScreenshotResult,
} from '../page/ibrowser-driver';

class FakeServer {
	tools: Record<string, { handler: (a: unknown) => Promise<unknown> }> = {};
	registerTool(
		name: string,
		_meta: unknown,
		handler: (a: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { handler };
	}
}

const parseOk = (r: unknown): Record<string, unknown> => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const parseError = (r: unknown): { reason: string; nextAction: string } => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	return JSON.parse(text) as { reason: string; nextAction: string };
};

const buildTools = (
	driver: IBrowserDriver | undefined,
	cacheDir = '/cache',
) => {
	const regs = buildBrowserInspectToolRegistrations({
		namespacePrefix: 'browser',
		pluginCacheDir: cacheDir,
		...(driver === undefined ? {} : { driver }),
	});
	const server = new FakeServer();
	for (const r of regs) void r.register(server as never);
	return server.tools;
};

const fakeDriver = (): IBrowserDriver => ({
	navigate: async (req): Promise<INavigateResult> => ({
		url: req.url,
		title: 'Example Domain',
		status: 200,
	}),
	screenshot: async (req): Promise<IScreenshotResult> => ({
		path: `/cache/browser/screenshot-${req.url.replace(/[^a-z0-9]+/gi, '_').slice(0, 64)}.${req.format ?? 'png'}`,
		bytes: 1234,
		format: req.format ?? 'png',
		width: 1280,
		height: 800,
	}),
	query: async (req): Promise<IQueryResult> => {
		const hits: IQueryHit[] = [
			{ selector: req.selector, text: 'first match', tag: 'h1' },
			{ selector: req.selector, text: 'second match', tag: 'h2' },
		];
		const limit = req.limit ?? hits.length;
		return { url: req.url, hits: hits.slice(0, limit) };
	},
});

describe('browser-inspect (f00125 S1)', () => {
	it('registers all three tools under the namespace prefix', () => {
		const tools = buildTools(fakeDriver());
		const ids = Object.keys(tools).sort();
		expect(ids).toEqual([
			'browser_browser_open',
			'browser_browser_query',
			'browser_browser_screenshot',
		]);
	});

	it('browser_open returns the page title and status via the driver', async () => {
		const tools = buildTools(fakeDriver());
		const handler = tools['browser_browser_open']?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(await handler({ url: 'https://example.com' }));
		expect(out['url']).toBe('https://example.com');
		expect(out['title']).toBe('Example Domain');
		expect(out['status']).toBe(200);
	});

	it('browser_screenshot returns the on-disk path + dimensions', async () => {
		const tools = buildTools(fakeDriver());
		const handler = tools['browser_browser_screenshot']?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({ url: 'https://example.com', format: 'jpeg' }),
		);
		expect(out['format']).toBe('jpeg');
		expect(out['width']).toBe(1280);
		expect(out['height']).toBe(800);
		expect(out['bytes']).toBe(1234);
	});

	it('browser_query respects the `limit` option', async () => {
		const tools = buildTools(fakeDriver());
		const handler = tools['browser_browser_query']?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({
				url: 'https://example.com',
				selector: 'h1',
				limit: 1,
			}),
		);
		const hits = out['hits'] as IQueryHit[];
		expect(hits.length).toBe(1);
		expect(hits[0]?.tag).toBe('h1');
	});
});
