import { describe, expect, it } from 'vitest';

import {
	proposalFilenameFor,
	scaffoldProposals,
} from '../../../../src/lib/services/proposal-scaffolder.service';
import type { IConsolidation } from '../../../../src/lib/contracts/interfaces/audit.interface';

const consolidationWith = (files: readonly string[]): IConsolidation => ({
	auditsFound: 1,
	skipped: [],
	consensus: [],
	findings: [
		{
			id: 'fatal-1',
			titles: ['A finding'],
			worstSeverity: 'FATAL',
			files,
			seenBy: ['gpt-4o'],
		},
	],
	topActions: [],
});

// x00165 (S-B): `scaffoldProposals` is a public, project-agnostic
// export — its own defaults must not hardcode mcp-vertex vocabulary,
// and its track-inference heuristic must be overridable by hosts
// whose folder layout does not match this repo's monorepo shape.
describe('scaffoldProposals — agnostic contract (x00165)', () => {
	it('defaults outputDir to a generic path, no mcp-vertex literal, when the caller omits it', () => {
		const [proposal] = scaffoldProposals(consolidationWith(['src/x.ts']));
		expect(proposal).toBeDefined();
		expect(proposal!.body).toContain('docs/proposals/ready');
		expect(proposal!.body).not.toContain('mcp-vertex');
	});

	it('lets a host override the track-inference heuristic', () => {
		const [proposal] = scaffoldProposals(consolidationWith(['src/x.ts']), {
			inferTrack: () => 'custom-track',
		});
		expect(proposal!.body).toContain('track: custom-track');
	});

	it('falls back to the built-in folder-based heuristic when no override is passed', () => {
		const [proposal] = scaffoldProposals(
			consolidationWith(['packages/core/src/x.ts']),
		);
		expect(proposal!.body).toContain('track: core+fix');
	});

	it('does not leak mcp-vertex-internal roadmap vocabulary into the generated body', () => {
		const [proposal] = scaffoldProposals(consolidationWith(['src/x.ts']));
		expect(proposal!.body).not.toContain('Alcance B');
		expect(proposal!.body).not.toContain('f00077');
		expect(proposal!.body).not.toContain('MUY_MAL');
		expect(proposal!.body).not.toContain('MEJORABLE');
		expect(proposal!.body).toContain('Sourced by `audit_run`.');
	});

	it('drops leftover markdown tokens and lifts file:// citations to workspace paths', () => {
		const [proposal] = scaffoldProposals(
			consolidationWith([
				'[',
				'[sync-proposal-registry.ts#L311](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L311)',
			]),
		);
		expect(proposal!.files).toEqual([
			'plugins/proposals/src/lib/proposals/sync-proposal-registry.ts',
		]);
		expect(proposal!.body).toContain(
			'`plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`',
		);
		expect(proposal!.body).not.toContain('    - `[`');
	});

	it('proposalFilenameFor previews the same filename scaffoldProposals would allocate', () => {
		const [proposal] = scaffoldProposals(consolidationWith(['src/x.ts']));
		expect(proposalFilenameFor(proposal!.title, proposal!.id)).toBe(
			proposal!.filename,
		);
	});
});
