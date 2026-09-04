import { describe, expect, it } from 'vitest';

import { diffDoc, formatReport } from './check-quantitative.script';
import type { IQuantitativeSnapshot } from '../gen/quantitative.script';

const SNAP: IQuantitativeSnapshot = {
	schemaVersion: 1,
	generatedAt: '<<snapshot>>',
	plugins: { total: 51 },
	tools: { total: 214, byPlugin: {} },
	tests: { specFiles: 378, testCases: 2993 },
	packages: { packages: 4, apps: 2, extensions: 1, tools: 4 },
	proposals: {
		total: 416,
		byKind: [],
		byStatus: [
			{ kind: 'done', count: 341 },
			{ kind: 'ready', count: 72 },
			{ kind: 'in-progress', count: 2 },
			{ kind: 'review', count: 1 },
		],
	},
};

describe('diffDoc (c00140)', () => {
	it('returns null when the on-disk block is already in sync', () => {
		const { text: doc } = (() => {
			// Re-export updateDocBlock indirectly via the same module
			// the script uses. We rebuild the doc block via
			// renderBlockForCompare to keep this test independent of
			// any on-disk artefact.
			const MARKER_BEGIN = '<!-- delendai:begin quantitative -->';
			const MARKER_END = '<!-- delendai:end quantitative -->';
			const block = [
				MARKER_BEGIN,
				'```',
				`Generated at: ${SNAP.generatedAt}`,
				'',
				`Plugins: ${SNAP.plugins.total}`,
				`Tools: ${SNAP.tools.total}`,
				`Test specs: ${SNAP.tests.specFiles} (≈${SNAP.tests.testCases} cases)`,
				`Workspaces: ${SNAP.packages.packages} packages, ${SNAP.packages.apps} apps, ${SNAP.packages.extensions} extensions, ${SNAP.packages.tools} tooling workspace(s).`,
				`Proposals: ${SNAP.proposals.total} on disk (${
					SNAP.proposals.byStatus
						.map((b) => `${b.kind}=${b.count}`)
						.join(', ') || 'none'
				})`,
				'```',
				MARKER_END,
			].join('\n');
			return {
				text: [
					'# Heading',
					'',
					'Some prose.',
					'',
					block,
					'',
					'Tail.',
				].join('\n'),
			};
		})();
		expect(diffDoc(doc, SNAP)).toBeNull();
	});

	it('reports a missing block as drift (generator would append)', () => {
		const doc = ['# Heading', '', 'No block here.'].join('\n');
		const drift = diffDoc(doc, SNAP);
		expect(drift).not.toBeNull();
		expect(drift?.diffLines[0]).toMatch(/block is missing/);
	});

	it('reports a stale block as drift', () => {
		const stale = [
			'# Heading',
			'',
			'<!-- delendai:begin quantitative -->',
			'old',
			'<!-- delendai:end quantitative -->',
		].join('\n');
		const drift = diffDoc(stale, SNAP);
		expect(drift).not.toBeNull();
		expect(drift?.diffLines.join(' ')).toMatch(/on-disk block length/);
	});
});

describe('formatReport', () => {
	it('prints a clean message when nothing drifted', () => {
		expect(formatReport([])).toContain('0 drift(s)');
	});

	it('lists each drift with path and reason', () => {
		const out = formatReport([
			{
				relPath: 'docs/delendai/AGENT-BOOTSTRAP.md',
				onDiskLen: 100,
				refreshedLen: 110,
				diffLines: ['block mismatch'],
			},
		]);
		expect(out).toContain('AGENT-BOOTSTRAP.md');
		expect(out).toContain('block mismatch');
	});
});
