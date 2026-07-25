import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';

import { buildBrowserVerifyPageToolRegistrations } from './browser-verify-page.tool';
import { PLAYWRIGHT_INSTALL_HINT } from '../page/playwright-probe';
import type { IBrowserDriver } from '../page/ibrowser-driver';

const fakeDriver = (html: string): IBrowserDriver => ({
	open: async ({ url }: { url: string }) => ({
		url,
		title: 'Example Domain',
		html,
	}),
	navigate: async ({ url }: { url: string }) => ({
		url,
		title: 'Example Domain',
		html,
	}),
	screenshot: async () => ({
		data: Uint8Array.from([1]),
		format: 'png',
	}),
	query: async ({ url, selector }: { url: string; selector: string }) => ({
		url,
		matches: [selector],
	}),
	assert: async () => ({ passed: true }),
});

const registration = (
	options: Omit<
		Parameters<typeof buildBrowserVerifyPageToolRegistrations>[0],
		'namespacePrefix'
	>,
) => {
	const found = buildBrowserVerifyPageToolRegistrations({
		namespacePrefix: 'browser',
		...options,
	})[0];
	if (found === undefined) {
		throw new Error('missing browser_verify_page registration');
	}
	return found;
};

describe('browser-verify-page (f00125 S3)', () => {
	it('passes with a complete fixture', async () => {
		const captured = await captureToolRegistration(registration({}));
		const output = (await captured.invoke({
			url: 'https://example.com',
			fixture: {
				html: '<html><body><nav>Home</nav></body></html>',
				stylesheet: 'main.css',
				nav: '<nav>Home</nav>',
			},
		})) as {
			url: string;
			ok: boolean;
			mode: string;
			checks: Record<string, boolean>;
		};
		expect(output.url).toBe('https://example.com/');
		expect(output.mode).toBe('fixture');
		expect(output.ok).toBe(true);
		expect(output.checks).toEqual({
			html: true,
			stylesheet: true,
			nav: true,
		});
	});

	it('fails when the fixture is missing a stylesheet', async () => {
		const captured = await captureToolRegistration(registration({}));
		const output = (await captured.invoke({
			url: 'https://example.com',
			fixture: {
				html: '<html><body><nav>Home</nav></body></html>',
				nav: '<nav>Home</nav>',
			},
		})) as {
			ok: boolean;
			checks: Record<string, boolean>;
		};
		expect(output.ok).toBe(false);
		expect(output.checks).toEqual({
			html: true,
			stylesheet: false,
			nav: true,
		});
	});

	it('returns ok=false with installHint when no driver is available', async () => {
		const captured = await captureToolRegistration(
			registration({
				probeTool: async () => ({
					unavailable: true,
					hint: PLAYWRIGHT_INSTALL_HINT,
				}),
			}),
		);
		const output = (await captured.invoke({
			url: 'https://example.com',
		})) as {
			ok: boolean;
			mode: string;
			installHint?: string;
			checks: Record<string, boolean>;
		};
		expect(output.mode).toBe('real');
		expect(output.ok).toBe(false);
		expect(output.installHint).toBe(PLAYWRIGHT_INSTALL_HINT);
		expect(output.checks).toEqual({
			html: false,
			stylesheet: false,
			nav: false,
		});
	});

	it('passes when the driver returns html with stylesheet and nav', async () => {
		const captured = await captureToolRegistration(
			registration({
				driver: fakeDriver(
					'<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><nav>Main</nav></body></html>',
				),
			}),
		);
		const output = (await captured.invoke({
			url: 'https://example.com/docs',
		})) as {
			url: string;
			ok: boolean;
			mode: string;
			checks: Record<string, boolean>;
		};
		expect(output.url).toBe('https://example.com/docs');
		expect(output.mode).toBe('real');
		expect(output.ok).toBe(true);
		expect(output.checks).toEqual({
			html: true,
			stylesheet: true,
			nav: true,
		});
	});
});
