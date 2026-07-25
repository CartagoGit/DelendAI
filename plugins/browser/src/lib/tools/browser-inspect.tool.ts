import { isAbsolute, relative, resolve } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import {
	PLAYWRIGHT_INSTALL_HINT,
	planPageRequest,
	type IBrowserDriver,
} from '../page';

export interface IBrowserInspectToolOptions {
	readonly namespacePrefix: string;
	/** Private plugin cache directory supplied by the plugin context. */
	readonly pluginCacheDir: string;
	/** Injectable runtime adapter; omitted when the optional runtime is absent. */
	readonly driver?: IBrowserDriver | undefined;
}

const URL_INPUT = z.object({ url: z.string().min(1).max(2_048) }).strict();
const QUERY_INPUT = URL_INPUT.extend({
	selector: z.string().min(1).max(512),
	limit: z.number().int().min(1).max(100).optional(),
}).strict();
const SCREENSHOT_INPUT = URL_INPUT.extend({
	fullPage: z.boolean().optional(),
	format: z.enum(['png', 'jpeg']).optional(),
}).strict();

const unavailable = () =>
	toolError(
		'Playwright is not available for this browser plugin.',
		PLAYWRIGHT_INSTALL_HINT,
	);

const pageDriver = (
	driver: IBrowserDriver | undefined,
): IBrowserDriver | undefined => driver;

const isCacheArtifact = (
	pluginCacheDir: string,
	artifactPath: string,
): boolean => {
	const pathFromCache = relative(
		resolve(pluginCacheDir),
		resolve(artifactPath),
	);
	return (
		pathFromCache.length > 0 &&
		!pathFromCache.startsWith('..') &&
		!isAbsolute(pathFromCache)
	);
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
						'Open an HTTP(S) page through the injected browser driver and return its final URL and optional title. Missing Playwright returns an install hint without crashing.',
					inputSchema: URL_INPUT,
					outputSchema: z.object({
						tool: z.literal('browser_open'),
						url: z.string(),
						title: z.string().optional(),
						status: z.number().int(),
					}),
				},
				async (args: { url: string }) => {
					const driver = pageDriver(options.driver);
					if (driver === undefined) return unavailable();
					try {
						const request = planPageRequest(args);
						const result = await driver.navigate({
							url: request.url,
						});
						return toolJson({
							tool: 'browser_open',
							url: result.url,
							...(result.title !== undefined
								? { title: result.title }
								: {}),
							status: result.status,
						});
					} catch (error) {
						return toolError((error as Error).message);
					}
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
						'Capture an HTTP(S) page screenshot using the injected browser driver. Artifacts are placed under the plugin cache; missing Playwright returns an install hint without crashing.',
					inputSchema: SCREENSHOT_INPUT,
					outputSchema: z.object({
						tool: z.literal('browser_screenshot'),
						url: z.string(),
						path: z.string(),
						bytes: z.number().int().nonnegative(),
						format: z.enum(['png', 'jpeg']),
						width: z.number().int().positive(),
						height: z.number().int().positive(),
					}),
				},
				async (args: {
					url: string;
					fullPage?: boolean | undefined;
					format?: 'png' | 'jpeg' | undefined;
				}) => {
					const driver = pageDriver(options.driver);
					if (driver === undefined) return unavailable();
					try {
						const request = planPageRequest(args);
						const result = await driver.screenshot({
							url: request.url,
							fullPage: args.fullPage ?? true,
							...(args.format !== undefined
								? { format: args.format }
								: {}),
						});
						if (
							!isCacheArtifact(
								options.pluginCacheDir,
								result.path,
							)
						) {
							return toolError(
								'Browser driver returned a screenshot outside the plugin cache.',
								'Configure the browser driver to write screenshots below pluginCacheDir.',
							);
						}
						return toolJson({
							tool: 'browser_screenshot',
							url: request.url,
							path: result.path,
							bytes: result.bytes,
							format: result.format,
							width: result.width,
							height: result.height,
						});
					} catch (error) {
						return toolError((error as Error).message);
					}
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
						'Query an HTTP(S) page with a CSS selector through the injected browser driver. Results are bounded by maxResults; missing Playwright returns an install hint without crashing.',
					inputSchema: QUERY_INPUT,
					outputSchema: z.object({
						tool: z.literal('browser_query'),
						url: z.string(),
						selector: z.string(),
						hits: z.array(
							z.object({
								selector: z.string(),
								text: z.string(),
								tag: z.string(),
							}),
						),
					}),
				},
				async (args: {
					url: string;
					selector: string;
					limit?: number | undefined;
				}) => {
					const driver = pageDriver(options.driver);
					if (driver === undefined) return unavailable();
					try {
						const request = planPageRequest({
							url: args.url,
							selector: args.selector,
							maxResults: args.limit,
						});
						const result = await driver.query({
							url: request.url,
							selector: request.selector ?? args.selector,
							limit: request.maxResults ?? 20,
						});
						return toolJson({
							tool: 'browser_query',
							url: request.url,
							selector: request.selector ?? args.selector,
							hits: result.hits,
						});
					} catch (error) {
						return toolError((error as Error).message);
					}
				},
			);
		},
	},
];
