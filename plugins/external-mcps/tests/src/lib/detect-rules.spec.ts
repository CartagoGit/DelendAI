/**
 * detect-rules.spec.ts — the generic detection engine + the Angular seed
 * rule (f00068 S4). Detection is annotation-only: a rule that fires marks
 * a catalog id `detected: true` in `catalog`/`suggest` output, but NEVER
 * activates a server (the autonomy knobs govern activation). These specs
 * pin the pure engine, the graceful package.json read, and the fact that
 * the annotation threads through both tools without ever booting anything.
 */
import { describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	DETECT_RULES,
	detectCatalogIds,
	hasDependency,
	type IDetectEvidence,
	loadDetectEvidence,
	parsePackageJsonEvidence,
} from '../../../src/lib/detect/detect-rules';
import {
	buildCatalogToolRegistration,
	CatalogOutputSchema,
} from '../../../src/lib/tools/catalog.tool';
import {
	buildSuggestToolRegistration,
	SuggestOutputSchema,
} from '../../../src/lib/tools/suggest.tool';

interface IToolResult {
	readonly content: Array<{ type: 'text'; text: string }>;
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
}

interface ICapturedTool {
	readonly name: string;
	readonly handler: (args: Record<string, unknown>) => Promise<IToolResult>;
}

const captureTool = async (reg: IToolRegistration): Promise<ICapturedTool> => {
	const captured: ICapturedTool[] = [];
	const server = {
		registerTool: (
			name: string,
			_config: unknown,
			handler: ICapturedTool['handler'],
		) => {
			captured.push({ name, handler });
		},
	} as unknown as Parameters<IToolRegistration['register']>[0];
	await reg.register(server);
	const tool = captured[0];
	if (tool === undefined) throw new Error('tool did not register');
	return tool;
};

const angularEvidence: IDetectEvidence = {
	packageJson: { dependencies: { '@angular/core': '20.0.0' } },
};

describe('detect engine (pure)', () => {
	it('the seed rule set probes @angular/core for the angular catalog id', () => {
		const angular = DETECT_RULES.find((r) => r.catalogId === 'angular');
		expect(angular).toBeDefined();
		expect(angular?.probe).toContain('@angular/core');
	});

	it('hasDependency finds a name across deps, devDeps and peerDeps', () => {
		expect(hasDependency(angularEvidence, '@angular/core')).toBe(true);
		expect(
			hasDependency(
				{ packageJson: { devDependencies: { vitest: '3.0.0' } } },
				'vitest',
			),
		).toBe(true);
		expect(
			hasDependency(
				{ packageJson: { peerDependencies: { react: '19.0.0' } } },
				'react',
			),
		).toBe(true);
		expect(hasDependency(angularEvidence, 'react')).toBe(false);
		expect(hasDependency({}, '@angular/core')).toBe(false);
	});

	it('detectCatalogIds fires angular only when the dependency is present', () => {
		expect([...detectCatalogIds(angularEvidence)]).toEqual(['angular']);
		expect(detectCatalogIds({}).size).toBe(0);
		expect(
			detectCatalogIds({
				packageJson: { dependencies: { react: '19.0.0' } },
			}).size,
		).toBe(0);
	});

	it('runs an injected custom rule set purely', () => {
		const rules = [
			{
				catalogId: 'docker',
				probe: 'dependencies.dockerode',
				matches: (e: IDetectEvidence) => hasDependency(e, 'dockerode'),
			},
		];
		const evidence: IDetectEvidence = {
			packageJson: { dependencies: { dockerode: '4.0.0' } },
		};
		expect([...detectCatalogIds(evidence, rules)]).toEqual(['docker']);
	});
});

describe('evidence parsing + loading (never throws)', () => {
	it('parses dependency maps from a raw package.json', () => {
		const evidence = parsePackageJsonEvidence(
			JSON.stringify({
				dependencies: { '@angular/core': '20.0.0' },
				devDependencies: { typescript: '5.5.0' },
			}),
		);
		expect(evidence.packageJson?.dependencies?.['@angular/core']).toBe(
			'20.0.0',
		);
		expect(evidence.packageJson?.devDependencies?.typescript).toBe('5.5.0');
	});

	it('returns empty evidence for malformed or non-object JSON', () => {
		expect(parsePackageJsonEvidence('not json {')).toEqual({});
		expect(parsePackageJsonEvidence('42')).toEqual({});
		expect(parsePackageJsonEvidence('null')).toEqual({});
	});

	it('loadDetectEvidence reads the workspace package.json via the injected reader', async () => {
		const evidence = await loadDetectEvidence('/ws', async (path) => {
			expect(path).toBe('/ws/package.json');
			return JSON.stringify({
				dependencies: { '@angular/core': '20.0.0' },
			});
		});
		expect(detectCatalogIds(evidence).has('angular')).toBe(true);
	});

	it('loadDetectEvidence degrades to empty when the read fails (no throw)', async () => {
		const evidence = await loadDetectEvidence('/ws', async () => {
			throw new Error('ENOENT');
		});
		expect(evidence).toEqual({});
	});
});

describe('detection annotates catalog output (never activates)', () => {
	const detect = async (): Promise<ReadonlySet<string>> =>
		new Set(['angular']);

	it('marks detected catalog entries with detected:true, others plain', async () => {
		const tool = await captureTool(
			buildCatalogToolRegistration({
				namespacePrefix: 'external-mcps',
				detect,
			}),
		);
		const result = await tool.handler({ query: 'angular' });
		const payload = CatalogOutputSchema.parse(result.structuredContent);
		const angular = payload.entries?.find((e) => e.id === 'angular');
		expect(angular?.detected).toBe(true);
	});

	it('detail mode annotates the single matched entry', async () => {
		const tool = await captureTool(
			buildCatalogToolRegistration({
				namespacePrefix: 'external-mcps',
				detect,
			}),
		);
		const result = await tool.handler({ detail: 'angular' });
		const payload = CatalogOutputSchema.parse(result.structuredContent);
		expect(payload.entry?.detected).toBe(true);
	});

	it('omits detected entirely when no provider is wired (pure default)', async () => {
		const tool = await captureTool(
			buildCatalogToolRegistration({ namespacePrefix: 'external-mcps' }),
		);
		const result = await tool.handler({ query: 'angular' });
		const payload = CatalogOutputSchema.parse(result.structuredContent);
		for (const row of payload.entries ?? []) {
			expect(row.detected).toBeUndefined();
		}
	});
});

describe('detection annotates suggest candidates (never activates)', () => {
	it('marks a detected candidate with detected:true', async () => {
		const tool = await captureTool(
			buildSuggestToolRegistration({
				namespacePrefix: 'external-mcps',
				options: {},
				detect: async () => new Set(['angular']),
			}),
		);
		const result = await tool.handler({ need: 'angular framework' });
		const payload = SuggestOutputSchema.parse(result.structuredContent);
		const angular = payload.candidates.find((c) => c.id === 'angular');
		expect(angular?.detected).toBe(true);
	});
});
