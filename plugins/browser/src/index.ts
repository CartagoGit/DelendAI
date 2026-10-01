/**
 * f00125 — `browser` plugin entry point.
 *
 * S1 (inspect): `browser_open`, `browser_screenshot`, `browser_query`.
 * S2 (interact + a11y): `browser_click`, `browser_fill`,
 *   `browser_assert`, `browser_a11y`.
 * S3 (verify-page): `browser_verify_page` — tracked separately.
 *
 * Every tool is a pure planner over an injected driver. Without a
 * driver, tools probe for Playwright and return a structured install
 * hint so the host surfaces a one-line install command instead of
 * crashing.
 */
import z from 'zod';

import { definePlugin } from '@delendai/core/public';

import { buildBrowserInspectToolRegistrations } from './lib/tools/browser-inspect.tool';
import { buildBrowserA11yToolRegistrations } from './lib/tools/browser-a11y.tool';
import { buildBrowserVerifyPageToolRegistrations } from './lib/tools/browser-verify-page.tool';
import type { IBrowserDriver } from './lib/page/ibrowser-driver';
import type { IBrowserActionDriver } from './lib/interact/iaction-driver';

const OptionsSchema = z.object({
	pluginCacheDir: z.string().optional(),
	driver: z
		.object({
			open: z.any().optional(),
			navigate: z.any(),
			screenshot: z.any(),
			query: z.any(),
			click: z.any(),
			fill: z.any(),
			assert: z.any(),
			runAxe: z.any(),
		})
		.optional(),
});

export default definePlugin({
	name: 'browser',
	version: '0.1.1',
	describe:
		'Playwright-backed browser: inspect (S1), interact + a11y (S2), verify-page (S3) — opt-in install, never bundled.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`browser plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const opts = parsed.data;
		const cacheDir = opts.pluginCacheDir ?? ctx.pluginCacheDir;
		const inspectDriver =
			opts.driver === undefined
				? undefined
				: ({
						open: opts.driver.open ?? opts.driver.navigate,
						navigate: opts.driver.navigate,
						screenshot: opts.driver.screenshot,
						query: opts.driver.query,
						assert: opts.driver.assert,
					} as unknown as IBrowserDriver);
		const interactDriver =
			opts.driver === undefined
				? undefined
				: ({
						click: opts.driver.click,
						fill: opts.driver.fill,
						assert: opts.driver.assert,
						runAxe: opts.driver.runAxe,
					} as unknown as IBrowserActionDriver);
		return {
			tools: [
				...buildBrowserInspectToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					pluginCacheDir: cacheDir,
					...(inspectDriver === undefined
						? {}
						: { driver: inspectDriver }),
				}),
				...buildBrowserA11yToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					...(interactDriver === undefined
						? {}
						: { driver: interactDriver }),
				}),
				...buildBrowserVerifyPageToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					...(inspectDriver === undefined
						? {}
						: { driver: inspectDriver }),
				}),
			],
		};
	},
});
