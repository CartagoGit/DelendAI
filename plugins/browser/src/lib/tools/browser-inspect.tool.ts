import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import {
	PLAYWRIGHT_INSTALL_HINT,
	probePlaywright,
	type IBrowserDriver,
} from '../page';

export interface IBrowserInspectToolOptions {
	readonly namespacePrefix: string;
	// a00084 F13: required, not optional — the plugin entry (index.ts)
	// always injects ctx.pluginCacheDir (a required field on the plugin
	// context). A process.cwd() fallback here meant screenshots/captures
	// landed wherever the host process happened to be running from in a
	// multi-workspace session, breaking cache eviction and the
	// usage-tracking boot sweep, which both depend on a stable cache path.
	readonly pluginCacheDir: string;
	readonly driver?: IBrowserDriver;
	readonly probeTool?: () => Promise<{
		readonly unavailable?: boolean;
		readonly hint?: string;
	}>;
}

const URL_INPUT = z.object({ url: z.string().min(1).max(2_048) }).strict();
const OPEN_INPUT = URL_INPUT.extend({
	headless: z.boolean().optional(),
}).strict();
const QUERY_INPUT = URL_INPUT.extend({
	selector: z.string().min(1).max(512),
}).strict();
const SCREENSHOT_INPUT = URL_INPUT.extend({
	fullPage: z.boolean().optional(),
}).strict();

const OPEN_OUTPUT = z.discriminatedUnion('status', [
	z.object({
		url: z.string(),
		title: z.string(),
		html: z.string(),
		status: z.literal('ok'),
	}),
	z.object({
		url: z.string(),
		status: z.literal('install-missing'),
		hint: z.string(),
	}),
]);

const SCREENSHOT_OUTPUT = z.discriminatedUnion('status', [
	z.object({
		url: z.string(),
		path: z.string(),
		status: z.literal('ok'),
	}),
	z.object({
		url: z.string(),
		status: z.literal('install-missing'),
		hint: z.string(),
	}),
]);

const QUERY_OUTPUT = z.discriminatedUnion('status', [
	z.object({
		url: z.string(),
		matches: z.array(z.string()),
		status: z.literal('ok'),
	}),
	z.object({
		url: z.string(),
		status: z.literal('install-missing'),
		hint: z.string(),
	}),
]);

const normalizeHttpUrl = (input: string): string => {
	const parsed = new URL(input);
	if (
		(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
		parsed.username !== '' ||
		parsed.password !== ''
	) {
		throw new Error(
			'url must be an absolute HTTP(S) URL without embedded credentials',
		);
	}
	return parsed.toString();
};

const installMissing = (url: string, hint: string) =>
	toolJson({
		url,
		status: 'install-missing' as const,
		hint,
	});

const screenshotPathFor = (
	pluginCacheDir: string,
	timestamp = Date.now(),
): string => join(pluginCacheDir, 'browser', `${timestamp}.png`);

const writeScreenshotAtomic = async (
	path: string,
	data: Uint8Array,
): Promise<void> => {
	await mkdir(dirname(path), { recursive: true });
	const tempPath = `${path}.${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}.tmp`;
	try {
		const handle = await open(tempPath, 'w');
		try {
			await handle.write(data);
			await handle.sync();
		} finally {
			await handle.close();
		}
		await rename(tempPath, path);
	} catch (error) {
		await rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}
};

const defaultProbeTool = async (): Promise<{
	readonly unavailable?: boolean;
	readonly hint?: string;
}> => {
	const result = await probePlaywright();
	return result.available
		? {}
		: {
				unavailable: true,
				hint: result.installHint,
			};
};

const probeDriver = async (
	options: IBrowserInspectToolOptions,
): Promise<
	| { readonly available: true; readonly driver: IBrowserDriver }
	| { readonly available: false; readonly hint: string }
> => {
	if (options.driver !== undefined) {
		return { available: true, driver: options.driver };
	}
	const probe = await (options.probeTool ?? defaultProbeTool)();
	return {
		available: false,
		hint: probe.hint ?? PLAYWRIGHT_INSTALL_HINT,
	};
};

const openWithDriver = async (
	driver: IBrowserDriver,
	args: { url: string; headless?: boolean },
) => {
	if (driver.open !== undefined) {
		return driver.open({
			url: args.url,
			...(args.headless !== undefined ? { headless: args.headless } : {}),
		});
	}
	if (driver.navigate !== undefined) {
		return driver.navigate({
			url: args.url,
			...(args.headless !== undefined ? { headless: args.headless } : {}),
		});
	}
	throw new Error('Browser driver does not implement open or navigate');
};

/**
 * Page navigation and inspection registrations. Each action is stateless from
 * the MCP caller's perspective: the injected driver receives the target URL
 * on every invocation, so hosts may safely launch and dispose a browser per
 * tool call.
 */
export const buildBrowserInspectToolRegistrations = (
	options: IBrowserInspectToolOptions,
): readonly IToolRegistration[] => [
	{
		id: 'browser_open',
		tags: ['browser', 'page', 'network'],
		effects: ['network'],
		summary: 'Open an HTTP(S) page through the configured browser driver.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_browser_open`,
				{
					description:
						'Open a page through the injected browser driver and return the resolved URL, title, and HTML. Missing Playwright returns an install hint without crashing.',
					inputSchema: OPEN_INPUT,
					outputSchema: OPEN_OUTPUT,
				},
				async (args: {
					url: string;
					headless?: boolean | undefined;
				}) => {
					const url = normalizeHttpUrl(args.url);
					const probed = await probeDriver(options);
					if (!probed.available)
						return installMissing(url, probed.hint);
					const result = await openWithDriver(probed.driver, {
						url,
						...(args.headless !== undefined
							? { headless: args.headless }
							: {}),
					});
					return toolJson({
						url: result.url,
						title: result.title,
						html: result.html,
						status: 'ok' as const,
					});
				},
			);
		},
	},
	{
		id: 'browser_screenshot',
		tags: ['browser', 'page', 'screenshot', 'network'],
		effects: ['network', 'write'],
		summary: 'Capture a page screenshot into the private plugin cache.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_browser_screenshot`,
				{
					description:
						'Capture a screenshot using the injected browser driver. Artifacts are written under the resolved plugin cache directory; missing Playwright returns an install hint without crashing.',
					inputSchema: SCREENSHOT_INPUT,
					outputSchema: SCREENSHOT_OUTPUT,
				},
				async (args: {
					url: string;
					fullPage?: boolean | undefined;
				}) => {
					const url = normalizeHttpUrl(args.url);
					const probed = await probeDriver(options);
					if (!probed.available)
						return installMissing(url, probed.hint);
					const result = await probed.driver.screenshot({
						url,
						...(args.fullPage !== undefined
							? { fullPage: args.fullPage }
							: {}),
						format: 'png',
					});
					const path = screenshotPathFor(options.pluginCacheDir);
					await writeScreenshotAtomic(path, result.data);
					return toolJson({
						url,
						path,
						status: 'ok' as const,
					});
				},
			);
		},
	},
	{
		id: 'browser_query',
		tags: ['browser', 'page', 'dom', 'network'],
		effects: ['network'],
		summary:
			'Query bounded DOM matches through the configured browser driver.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_browser_query`,
				{
					description:
						'Query a page with a CSS selector through the injected browser driver and return matched texts. Missing Playwright returns an install hint without crashing.',
					inputSchema: QUERY_INPUT,
					outputSchema: QUERY_OUTPUT,
				},
				async (args: { url: string; selector: string }) => {
					const url = normalizeHttpUrl(args.url);
					const probed = await probeDriver(options);
					if (!probed.available)
						return installMissing(url, probed.hint);
					const result = await probed.driver.query({
						url,
						selector: args.selector,
					});
					return toolJson({
						url: result.url,
						matches: result.matches,
						status: 'ok' as const,
					});
				},
			);
		},
	},
];
