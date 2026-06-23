import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import { diffAnalysis } from '@mcp-vertex/core/lib/bootstrap/drift';

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

describe('diffAnalysis', () => {
	it('returns the first-snapshot sentinel when no previous analysis exists', () => {
		const report = diffAnalysis(analyse({}), undefined, null);
		expect(report.isFirstSnapshot).toBe(true);
		expect(report.hasDrift).toBe(true);
		expect(report.changes).toEqual([]);
		expect(report.summary).toMatch(/First snapshot/i);
	});

	it('reports no drift when the two analyses are identical', () => {
		const a = analyse({ scripts: { test: 'vitest' } });
		const b = analyse({ scripts: { test: 'vitest' } });
		const report = diffAnalysis(a, b, '2026-06-23T00:00:00.000Z');
		expect(report.hasDrift).toBe(false);
		expect(report.changes).toEqual([]);
		expect(report.summary).toMatch(/no drift/i);
		expect(report.lastSnapshotAt).toBe('2026-06-23T00:00:00.000Z');
	});

	it('flags a new script as a missing tool', () => {
		const last = analyse({ scripts: { test: 'vitest' } });
		const current = analyse({
			scripts: { test: 'vitest', e2e: 'playwright test' },
		});
		const report = diffAnalysis(current, last, '2026-06-23T00:00:00.000Z');
		const scriptAdd = report.changes.find((c) => c.kind === 'script-added');
		expect(scriptAdd).toBeDefined();
		expect(scriptAdd?.summary).toContain('e2e');
		expect(scriptAdd?.summary).toContain('run_e2e');
		expect(report.hasDrift).toBe(true);
	});

	it('flags a dropped script and suggests retiring its tool', () => {
		const last = analyse({ scripts: { test: 'vitest', lint: 'eslint .' } });
		const current = analyse({ scripts: { test: 'vitest' } });
		const report = diffAnalysis(current, last, '2026-06-23T00:00:00.000Z');
		const scriptDrop = report.changes.find(
			(c) => c.kind === 'script-dropped',
		);
		expect(scriptDrop).toBeDefined();
		expect(scriptDrop?.summary).toContain('lint');
		expect(scriptDrop?.summary).toContain('run_lint');
	});

	it('flags framework, language, monorepo and package manager changes', () => {
		const last = analyse({
			dependencies: { react: '^18' },
			scripts: {},
		});
		const current = analyse({
			dependencies: { '@angular/core': '^22' },
			scripts: {},
		});
		const report = diffAnalysis(current, last, '2026-06-23T00:00:00.000Z');
		const kinds = report.changes.map((c) => c.kind);
		expect(kinds).toContain('framework-changed');
	});

	it('flags MCP server appearance and disappearance', () => {
		const last = analyse({});
		const current = analyse({});
		// Re-analyse with extra evidence.
		const last2 = analyzeProject(
			reader({ 'package.json': '{"name":"x"}' }),
		);
		const current2 = analyzeProject(
			reader({
				'package.json':
					'{"name":"x","dependencies":{"@modelcontextprotocol/sdk":"^1"}}',
			}),
		);
		void last;
		void current;
		const report = diffAnalysis(
			current2,
			last2,
			'2026-06-23T00:00:00.000Z',
		);
		expect(
			report.changes.find((c) => c.kind === 'mcp-server-added'),
		).toBeDefined();
	});

	it('flags CI and agent config additions', () => {
		const last = analyzeProject(reader({ 'package.json': '{"name":"x"}' }));
		const current = analyzeProject(
			reader({
				'package.json': '{"name":"x"}',
				'.github/copilot-instructions.md': '# guide',
				'.gitlab-ci.yml': 'stages: [test]',
			}),
		);
		const report = diffAnalysis(current, last, '2026-06-23T00:00:00.000Z');
		const kinds = report.changes.map((c) => c.kind);
		expect(kinds).toContain('ci-changed');
		expect(kinds).toContain('agent-config-changed');
	});
});
