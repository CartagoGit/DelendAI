/**
 * build-proposal-dfa.spec.ts — f00132 S2 acceptance for the pure
 * proposal DFA renderer. The DFA edges come from the proposals
 * plugin's `PROPOSAL_STATUS_TRANSITIONS`; the renderer is a thin
 * mermaid wrapper. Tests cover:
 *   - bare DFA (no counts)
 *   - counts map annotates non-zero nodes
 *   - zero counts are rendered without the [N] suffix
 *   - output is byte-identical across calls
 *   - edges are sorted alphabetically (stable)
 *   - terminal statuses (done, retired) have no outgoing edge
 */

import { describe, expect, it } from 'vitest';

import { buildProposalDfaMermaid } from '../../../../src/lib/erd/build-proposal-dfa';

describe('buildProposalDfaMermaid (f00132 S2)', () => {
	it('renders the bare DFA without counts', () => {
		const out = buildProposalDfaMermaid();
		expect(out.startsWith('stateDiagram-v2')).toBe(true);
		// All 7 statuses must appear as nodes.
		for (const status of [
			'ready',
			'in-progress',
			'review',
			'done',
			'paused',
			'blocked',
			'retired',
		]) {
			expect(out).toContain(`\t${status}`);
		}
		// Terminal statuses (done, retired) must have NO outgoing edge.
		const lines = out.split('\n');
		expect(lines.find((line) => /^done --> /.test(line))).toBeUndefined();
		expect(
			lines.find((line) => /^retired --> /.test(line)),
		).toBeUndefined();
	});

	it('annotates non-zero counts with [N] suffix', () => {
		const out = buildProposalDfaMermaid({
			ready: 3,
			'in-progress': 2,
			done: 7,
		});
		expect(out).toContain('\tready [3]');
		expect(out).toContain('\tin-progress [2]');
		expect(out).toContain('\tdone [7]');
		// Unspecified or zero counts render the bare label.
		expect(out).toMatch(/^\treview$/m);
		expect(out).toMatch(/^\tpaused$/m);
	});

	it('renders zero counts without the [0] suffix', () => {
		const out = buildProposalDfaMermaid({ ready: 0 });
		expect(out).not.toContain('ready [0]');
		expect(out).toContain('\tready');
	});

	it('output is byte-identical across calls (determinism)', () => {
		const counts = { ready: 1, 'in-progress': 2, done: 3 };
		const first = buildProposalDfaMermaid(counts);
		const second = buildProposalDfaMermaid(counts);
		expect(first).toBe(second);
	});

	it('emits edges in alphabetical order', () => {
		const out = buildProposalDfaMermaid();
		const edges = out
			.split('\n')
			.filter((line) => line.includes('-->'))
			.map((line) => line.replace(/^\s+/, '').trim());
		const sorted = [...edges].sort();
		expect(edges).toEqual(sorted);
	});

	it('every edge corresponds to a status in the DFA', () => {
		const out = buildProposalDfaMermaid();
		const validStatuses = new Set([
			'ready',
			'in-progress',
			'review',
			'done',
			'paused',
			'blocked',
			'retired',
		]);
		const edges = out
			.split('\n')
			.filter((line) => line.includes('-->'))
			.map((line) => {
				const match = line.match(/(\S+)\s+--> \s+(\S+)/);
				return match ? [match[1], match[2]] : null;
			})
			.filter((pair): pair is [string, string] => pair !== null);
		for (const [from, to] of edges) {
			expect(validStatuses.has(from)).toBe(true);
			expect(validStatuses.has(to)).toBe(true);
		}
	});
});
