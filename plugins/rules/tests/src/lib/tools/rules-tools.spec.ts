/**
 * l00008 s4 — `get_rules`'s outputSchema declared `areas[].rules:
 * z.object({}).catchall(z.unknown())`. The actual runtime shape is
 * `IAreaRules` (framework/presetId/eslint/typecheck/reason) — this spec
 * pins the hardened schema against the real registration's
 * structuredContent.
 */
import { describe, expect, it } from 'vitest';

import type {
	IFileReader,
	IWorkspacePathProvider,
} from '@mcp-vertex/core/public';

import { buildGetRulesRegistration } from '@mcp-vertex/rules/lib/tools/rules-tools';

const invoke = async (
	reg: ReturnType<typeof buildGetRulesRegistration>,
	args: unknown,
): Promise<{
	content: Array<{ text: string }>;
	structuredContent?: Record<string, unknown>;
}> => {
	let handler:
		| ((a: unknown) => Promise<{
				content: Array<{ text: string }>;
				structuredContent?: Record<string, unknown>;
		  }>)
		| undefined;
	await reg.register({
		registerTool: (
			_name: string,
			_desc: unknown,
			fn: typeof handler,
		): void => {
			handler = fn;
		},
	} as never);
	if (!handler) throw new Error('get_rules did not register a handler');
	return handler(args);
};

const emptyReader: IFileReader = {
	readFile: () => undefined,
	exists: () => false,
	listDir: () => [],
};

const workspace: IWorkspacePathProvider = {
	root: '/ws',
	resolve: (p: string) => `/ws/${p}`,
};

describe('get_rules — areas[].rules outputSchema (l00008 s4)', () => {
	it('returns a golden IAreaRules shape: framework/presetId/eslint/typecheck/reason, no stray keys', async () => {
		const reg = buildGetRulesRegistration({
			namespacePrefix: 'rules',
			workspace,
			reader: emptyReader,
			projectName: 'demo',
			cacheRelDir: '.cache/mcp-vertex/rules',
			manifestRelPath: '.cache/mcp-vertex/rules/rules-map.json',
			mode: 'mixed',
		});

		const result = await invoke(reg, {});
		const out = result.structuredContent as {
			areas: Array<{
				project: string;
				area: string;
				rules: {
					framework: string;
					presetId: string;
					eslint: string[];
					typecheck: string[];
					reason: string;
				};
			}>;
		};

		expect(out.areas.length).toBeGreaterThan(0);
		const root = out.areas.find((a) => a.area === 'root');
		expect(root).toBeDefined();
		expect(typeof root?.rules.framework).toBe('string');
		expect(typeof root?.rules.presetId).toBe('string');
		expect(Array.isArray(root?.rules.eslint)).toBe(true);
		expect(Array.isArray(root?.rules.typecheck)).toBe(true);
		expect(typeof root?.rules.reason).toBe('string');
		// No stray keys beyond the 5 IAreaRules fields — confirms the
		// catchall is gone, not just hidden behind a wider record.
		expect(Object.keys(root?.rules ?? {}).sort()).toEqual([
			'eslint',
			'framework',
			'presetId',
			'reason',
			'typecheck',
		]);
	});
});
