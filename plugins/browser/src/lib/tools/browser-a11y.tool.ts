/**
 * f00125 S2 — `browser_click` / `browser_fill` / `browser_assert` /
 * `browser_a11y`.
 *
 * Same shape as the S1 inspect tools: pure planners over an injected
 * `IBrowserActionDriver`, probe Playwright when no driver is provided,
 * and return a structured install-hint error so the host surfaces a
 * one-line install command instead of crashing.
 *
 * - `browser_click` / `browser_fill` → `IInteractionResult`
 * - `browser_assert` → `IFinding[]` (empty = all assertions passed)
 * - `browser_a11y` → `IFinding[]` (axe-core, normalized via r00012)
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import { PLAYWRIGHT_INSTALL_HINT } from '../page';
import type {
	IAssertRequest,
	IBrowserActionDriver,
	IA11yRequest,
	IFillRequest,
	IInteractionResult,
} from '../interact/iaction-driver';
import { mapAxeReport, summarizeSeverity } from '../interact/axe-mapper';
import { outcomesToFindings } from '../interact/assertions';

export interface IBrowserA11yToolOptions {
	readonly namespacePrefix: string;
	/** Injectable driver; absent → install-hint fail-soft. */
	readonly driver?: IBrowserActionDriver;
}

const installHintError = (tool: string) =>
	toolError(
		`${tool} needs Playwright`,
		`${PLAYWRIGHT_INSTALL_HINT} The plugin never bundles Chromium; install is opt-in.`,
	);

const FINDING = z.object({
	ruleId: z.string(),
	severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
	message: z.string(),
	location: z
		.object({
			file: z.string(),
			line: z.number().int().optional(),
			endLine: z.number().int().optional(),
		})
		.optional(),
	fix: z.string().optional(),
});

const INTERACTION_OUTPUT = z.object({
	target: z.string(),
	action: z.enum(['click', 'fill']),
	url: z.string(),
	matched: z.number().int().nonnegative(),
});

const ASSERT_OUTPUT = z.object({
	url: z.string(),
	passed: z.boolean(),
	findings: z.array(FINDING),
});

const A11Y_OUTPUT = z.object({
	url: z.string(),
	findings: z.array(FINDING),
	summary: z.record(z.string(), z.number().int().nonnegative()),
	worst: z.enum(['critical', 'high', 'medium', 'low', 'info', 'none']),
});

const severityOrder = ['critical', 'high', 'medium', 'low', 'info'] as const;
const worstSeverity = (
	summary: Readonly<
		Record<'critical' | 'high' | 'medium' | 'low' | 'info', number>
	>,
): 'critical' | 'high' | 'medium' | 'low' | 'info' | 'none' => {
	for (const s of severityOrder) {
		if (summary[s] > 0) return s;
	}
	return 'none';
};

export const buildBrowserA11yToolRegistrations = (
	options: IBrowserA11yToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	const probeIfNeeded = async (
		tool: string,
	): Promise<ReturnType<typeof installHintError> | null> => {
		if (options.driver !== undefined) return null;
		return installHintError(tool);
	};

	return [
		{
			id: 'browser_click',
			summary:
				'Click an element matched by a CSS selector or `text=<exact>`.',
			tags: ['browser', 'network', 'effect'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_browser_click`,
					{
						description:
							'Navigate to `url` and click the element matched by `target` (CSS selector or `text=<exact>`). Returns the resulting URL, action, and match count. Yields an install hint if Playwright is not installed.',
						inputSchema: z.object({
							url: z.string().url(),
							target: z.string().min(1),
						}),
						outputSchema: INTERACTION_OUTPUT,
					},
					async (args) => {
						const fail = await probeIfNeeded('browser_click');
						if (fail !== null) return fail;
						const driver = options.driver as IBrowserActionDriver;
						const out: IInteractionResult = await driver.click({
							url: args.url,
							target: args.target,
						});
						return toolJson(out);
					},
				);
			},
		},
		{
			id: 'browser_fill',
			summary: 'Fill an input or textarea matched by selector.',
			tags: ['browser', 'network', 'effect'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_browser_fill`,
					{
						description:
							'Navigate to `url`, fill `value` into the input/textarea matched by `target`, optionally submitting with Enter. Yields an install hint if Playwright is not installed.',
						inputSchema: z.object({
							url: z.string().url(),
							target: z.string().min(1),
							value: z.string(),
							submit: z.boolean().optional(),
						}),
						outputSchema: INTERACTION_OUTPUT,
					},
					async (args) => {
						const fail = await probeIfNeeded('browser_fill');
						if (fail !== null) return fail;
						const driver = options.driver as IBrowserActionDriver;
						const req: IFillRequest = {
							url: args.url,
							target: args.target,
							value: args.value,
							...(args.submit !== undefined
								? { submit: args.submit }
								: {}),
						};
						const out: IInteractionResult = await driver.fill(req);
						return toolJson(out);
					},
				);
			},
		},
		{
			id: 'browser_assert',
			summary:
				'Assert a text/visibility/count/url/title condition; returns IFinding[] on failure.',
			tags: ['browser', 'network', 'assert'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_browser_assert`,
					{
						description:
							'Evaluate one or more assertions against `url`. Returns normalized IFinding[] (r00012) — empty when all pass. Supports kinds: text-equals, text-contains, visible, hidden, count, url-matches, title-matches. Yields an install hint if Playwright is not installed.',
						inputSchema: z.object({
							url: z.string().url(),
							assertions: z
								.array(
									z.object({
										kind: z.enum([
											'text-equals',
											'text-contains',
											'visible',
											'hidden',
											'count',
											'url-matches',
											'title-matches',
										]),
										target: z.string().optional(),
										expected: z.string(),
										count: z
											.number()
											.int()
											.positive()
											.optional(),
										regex: z.boolean().optional(),
										label: z.string().optional(),
									}),
								)
								.min(1),
						}),
						outputSchema: ASSERT_OUTPUT,
					},
					async (args) => {
						const fail = await probeIfNeeded('browser_assert');
						if (fail !== null) return fail;
						const driver = options.driver as IBrowserActionDriver;
						const requests: IAssertRequest[] = args.assertions.map(
							(a) => ({
								url: args.url,
								kind: a.kind,
								expected: a.expected,
								...(a.target !== undefined
									? { target: a.target }
									: {}),
								...(a.count !== undefined
									? { count: a.count }
									: {}),
								...(a.regex !== undefined
									? { regex: a.regex }
									: {}),
								...(a.label !== undefined
									? { label: a.label }
									: {}),
							}),
						);
						const outcomes = await Promise.all(
							requests.map((r) => driver.assert(r)),
						);
						const findings = outcomesToFindings(requests, outcomes);
						return toolJson({
							url: args.url,
							passed: findings.length === 0,
							findings,
						});
					},
				);
			},
		},
		{
			id: 'browser_a11y',
			summary:
				'Run axe-core against a URL; return normalized IFinding[].',
			tags: ['browser', 'network', 'a11y', 'effects'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_browser_a11y`,
					{
						description:
							'Run axe-core against `url`, normalize violations to r00012 IFinding[] (one finding per affected node). Returns findings + per-severity counts + the worst band present. Yields an install hint if Playwright is not installed.',
						inputSchema: z.object({
							url: z.string().url(),
							tags: z.array(z.string()).optional(),
						}),
						outputSchema: A11Y_OUTPUT,
					},
					async (args) => {
						const fail = await probeIfNeeded('browser_a11y');
						if (fail !== null) return fail;
						const driver = options.driver as IBrowserActionDriver;
						const req: IA11yRequest = {
							url: args.url,
							...(args.tags !== undefined
								? { tags: args.tags }
								: {}),
						};
						const report = await driver.runAxe(req);
						const findings = mapAxeReport(
							report.url,
							report.violations,
						);
						const summary = summarizeSeverity(findings);
						return toolJson({
							url: report.url,
							findings,
							summary,
							worst: worstSeverity(summary),
						});
					},
				);
			},
		},
	];
};
