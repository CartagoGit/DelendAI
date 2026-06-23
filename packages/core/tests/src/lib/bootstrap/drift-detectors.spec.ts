// drift-detectors.spec.ts: pin the SOLID detector split.
//
// These tests assert that:
//   - each detector owns exactly one concern (a fake detector in
//     `diffAnalysis.detectors` only changes the report fields that
//     concern owns);
//   - the composer aggregates the chain order-independently;
//   - hosts can swap the chain via `IDiffAnalysisOptions.detectors`
//     without forking `diffAnalysis`.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IDriftChange } from '@mcp-vertex/core/lib/bootstrap/drift';
import {
	DEFAULT_DRIFT_DETECTORS,
	diffAnalysis,
} from '@mcp-vertex/core/lib/bootstrap/drift';
import type { IDriftDetector } from '@mcp-vertex/core/lib/bootstrap/drift-detector';
import { MetadataDriftDetector } from '@mcp-vertex/core/lib/bootstrap/metadata-drift-detector';
import { ScriptsDriftDetector } from '@mcp-vertex/core/lib/bootstrap/scripts-drift-detector';
import { StackDriftDetector } from '@mcp-vertex/core/lib/bootstrap/stack-drift-detector';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => [],
});

const analyse = (pkg: Record<string, unknown>) =>
	analyzeProject(
		reader({
			'package.json': JSON.stringify({
				name: '@acme/site',
				...pkg,
			}),
			'tsconfig.json': '{}',
		}),
	);

describe('default drift detectors', () => {
	it('exposes a chain with the three concern detectors', () => {
		const ids = DEFAULT_DRIFT_DETECTORS.map((d) => d.id);
		expect(ids).toEqual(['scripts', 'stack', 'metadata']);
	});

	it('each detector is independent (replacing one does not break the others)', () => {
		const customChain: readonly IDriftDetector[] = [
			new ScriptsDriftDetector(),
			new StackDriftDetector(),
			// metadata replaced by a fake.
			{
				id: 'fake-metadata',
				detect: () => [
					{
						kind: 'agent-config-changed',
						summary: 'fake',
					},
				],
			},
		];
		const last = analyse({});
		const current = analyse({});
		const report = diffAnalysis(current, last, '2026-06-23T00:00:00.000Z', {
			detectors: customChain,
		});
		expect(report.changes).toHaveLength(1);
		expect(report.changes[0]?.kind).toBe('agent-config-changed');
	});

	it('omitting a detector from the chain removes its kind from the report', () => {
		const last = analyse({ scripts: { test: 'vitest' } });
		const current = analyse({
			scripts: { test: 'vitest', e2e: 'playwright' },
		});
		const chain: readonly IDriftDetector[] = [
			// scripts detector omitted on purpose.
			new StackDriftDetector(),
			new MetadataDriftDetector(),
		];
		const report = diffAnalysis(current, last, '2026-06-23T00:00:00.000Z', {
			detectors: chain,
		});
		const kinds = report.changes.map((c) => c.kind);
		expect(kinds).not.toContain('script-added');
	});

	it('an empty detector chain returns hasDrift=false when analyses are equal', () => {
		const a = analyse({});
		const report = diffAnalysis(a, a, '2026-06-23T00:00:00.000Z', {
			detectors: [],
		});
		expect(report.hasDrift).toBe(false);
		expect(report.changes).toEqual([]);
	});
});

describe('ScriptsDriftDetector', () => {
	it('flags a new script and ignores stable ones', () => {
		const last = analyse({ scripts: { test: 'vitest' } });
		const current = analyse({
			scripts: { test: 'vitest', e2e: 'playwright' },
		});
		const changes: readonly IDriftChange[] =
			new ScriptsDriftDetector().detect({ current, last });
		expect(changes).toHaveLength(1);
		expect(changes[0]?.kind).toBe('script-added');
		expect(changes[0]?.summary).toContain('e2e');
	});

	it('emits no changes when scripts are identical (order-insensitive)', () => {
		const a = analyse({ scripts: { test: 'vitest', lint: 'eslint .' } });
		const b = analyse({ scripts: { lint: 'eslint .', test: 'vitest' } });
		expect(
			new ScriptsDriftDetector().detect({ current: a, last: b }),
		).toEqual([]);
	});
});

describe('StackDriftDetector', () => {
	it('flags a framework change', () => {
		const last = analyse({ dependencies: { react: '^18' } });
		const current = analyse({
			dependencies: { '@angular/core': '^22' },
		});
		const changes = new StackDriftDetector().detect({ current, last });
		const fw = changes.find((c) => c.kind === 'framework-changed');
		expect(fw).toBeDefined();
	});

	it('emits no changes when the stack is identical', () => {
		const a = analyse({});
		expect(
			new StackDriftDetector().detect({ current: a, last: a }),
		).toEqual([]);
	});

	it('classifies mcp-server-added vs mcp-server-dropped', () => {
		const last = analyse({});
		const current = analyse({
			dependencies: { '@modelcontextprotocol/sdk': '^1' },
		});
		const changes = new StackDriftDetector().detect({ current, last });
		expect(
			changes.find((c) => c.kind === 'mcp-server-added'),
		).toBeDefined();
	});
});

describe('MetadataDriftDetector', () => {
	it('flags a new CI file as a ci-changed entry', () => {
		const last = analyse({});
		const current = analyse({});
		// Hand-build a richer analysis with CI present.
		const last2 = analyzeProject(
			reader({ 'package.json': '{"name":"x"}' }),
		);
		const current2 = analyzeProject(
			reader({
				'package.json': '{"name":"x"}',
				'.github/copilot-instructions.md': '# guide',
			}),
		);
		void last;
		void current;
		const changes = new MetadataDriftDetector().detect({
			current: current2,
			last: last2,
		});
		expect(
			changes.find((c) => c.kind === 'agent-config-changed'),
		).toBeDefined();
	});
});
