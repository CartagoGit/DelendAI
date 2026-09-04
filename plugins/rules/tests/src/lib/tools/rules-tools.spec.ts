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
} from '@delendai/core/public';

import { buildGetRulesRegistration } from '@delendai/rules/lib/tools/rules-tools';

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
	readFile: async () => undefined,
	exists: async () => false,
	listDir: async () => [],
};

const workspace: IWorkspacePathProvider = {
	root: '/ws',
	resolve: (p: string) => `/ws/${p}`,
};

describe('get_rules — areas[].rules outputSchema (l00008 s4)', async () => {
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
			'configs',
			'eslint',
			'framework',
			'presetId',
			'reason',
			'typecheck',
		]);
	});

	it('returns dogmas in the response', async () => {
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
			dogmas: Record<string, any>;
		};

		expect(out.dogmas).toBeDefined();
		expect(out.dogmas.root).toBeDefined();
		expect(out.dogmas.root.language).toBe('js');
		expect(out.dogmas.root.ownership).toBe('gc');
	});

	it('x00101 S2: compact:true projects area ids + presets without rule bodies or dogmas', async () => {
		const reg = buildGetRulesRegistration({
			namespacePrefix: 'rules',
			workspace,
			reader: emptyReader,
			projectName: 'demo',
			cacheRelDir: '.cache/mcp-vertex/rules',
			manifestRelPath: '.cache/mcp-vertex/rules/rules-map.json',
			mode: 'mixed',
		});

		const result = await invoke(reg, { compact: true });
		const out = result.structuredContent as {
			mode: string;
			areas: Array<Record<string, unknown>>;
			dogmas?: unknown;
			conventions?: unknown;
			renderedDogmas?: unknown;
		};

		expect(out.mode).toBe('mixed');
		expect(out.areas.length).toBeGreaterThan(0);
		for (const area of out.areas) {
			expect(Object.keys(area).sort()).toEqual([
				'area',
				'presetId',
				'project',
			]);
		}
		expect(out.dogmas).toBeUndefined();
		expect(out.conventions).toBeUndefined();
		expect(out.renderedDogmas).toBeUndefined();
		expect(Buffer.byteLength(JSON.stringify(out), 'utf8')).toBeLessThan(
			1_500,
		);
	});
});
