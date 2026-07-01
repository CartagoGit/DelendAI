import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { buildServerBlueprint } from '@mcp-vertex/core/lib/bootstrap/build-blueprint';
import {
	diffCapabilities,
	existingToolsFromAnalysis,
} from '@mcp-vertex/core/lib/bootstrap/capability-diff';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files,
	listDir: async () => [],
});

const blue = async (pkg: Record<string, unknown>) =>
	buildServerBlueprint(
		await analyzeProject(
			reader({
				'package.json': JSON.stringify({
					name: '@acme/site',
					scripts: { lint: 'eslint .', test: 'vitest' },
					...pkg,
				}),
				'tsconfig.json': '{}',
			}),
		),
	);

describe('diffCapabilities', () => {
	it('flags everything missing when the existing server has no tools', async () => {
		const bp = await blue({});
		const diff = await diffCapabilities(bp, [], {
			namespacePrefix: 'acme',
		});
		expect(diff.missing.length).toBeGreaterThan(0);
		expect(diff.present).toEqual([]);
		expect(diff.extra).toEqual([]);
		expect(diff.mismatched).toEqual([]);
		// Summary line is human-readable.
		expect(diff.summary).toMatch(/missing/);
	});

	it('marks a tool as present when the existing server exposes it', async () => {
		const bp = await blue({});
		// The blueprint includes `run_test` and `run_lint` (derived from scripts).
		const existing = bp.tools
			.filter((t) => t.name === 'run_test')
			.map((t) => `acme_${t.name}`);
		const diff = await diffCapabilities(bp, existing, {
			namespacePrefix: 'acme',
		});
		const runTest = diff.present.find((p) => p.name === 'run_test');
		expect(runTest).toBeDefined();
		expect(diff.missing.some((m) => m.name === 'run_test')).toBe(false);
	});

	it('classifies a head-alias as present (not mismatched)', async () => {
		const bp = await blue({});
		// Existing has `acme_test_runner`; the blueprint derives
		// `run_test` from `scripts.test`. They share a "test" head alias,
		// so the diff lands it in `present` (not missing, not mismatched).
		const diff = await diffCapabilities(bp, ['acme_test_runner'], {
			namespacePrefix: 'acme',
		});
		expect(diff.present.find((p) => p.name === 'run_test')).toBeDefined();
		expect(diff.missing.find((m) => m.name === 'run_test')).toBeUndefined();
		expect(
			diff.mismatched.find((m) => m.name === 'run_test'),
		).toBeUndefined();
		// The related tool is consumed by the head-alias match — it does
		// not leak into `extra` either.
		expect(diff.extra).not.toContain('test_runner');
	});

	it('lists extra tools the blueprint does not need', async () => {
		const bp = await blue({});
		const diff = await diffCapabilities(
			bp,
			['acme_run_test', 'acme_legacy_unused_tool'],
			{ namespacePrefix: 'acme' },
		);
		expect(diff.extra).toContain('legacy_unused_tool');
	});

	it('matches without the namespace prefix when the caller forgets it', async () => {
		const bp = await blue({});
		// Caller passes bare ids — diffCapabilities still finds them.
		const diff = await diffCapabilities(
			bp,
			bp.tools.map((t) => t.name),
			{ namespacePrefix: 'acme' },
		);
		expect(diff.missing).toEqual([]);
		expect(diff.present.length).toBe(bp.tools.length);
	});
});

describe('existingToolsFromAnalysis', () => {
	it('returns an empty list when no mcp.json is present (best-effort)', async () => {
		const analysis = await analyzeProject(reader({}));
		const result = await existingToolsFromAnalysis(analysis, reader({}));
		expect(result).toEqual([]);
	});

	it('returns an empty list when mcp.json is present (cannot derive tool names statically)', async () => {
		const analysis = await analyzeProject(
			reader({
				'package.json': JSON.stringify({ name: 'svc' }),
				'.vscode/mcp.json': JSON.stringify({
					servers: {
						'mcp-vertex': {
							command: 'bunx',
							args: ['@mcp-vertex/core', '--plugins=proposals'],
						},
					},
				}),
			}),
		);
		const result = await existingToolsFromAnalysis(analysis, reader({}));
		expect(result).toEqual([]);
	});
});
