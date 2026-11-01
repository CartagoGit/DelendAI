/**
 * x00638 S4: a triage run writes its proposal in the checkout the call
 * is bound to, and allocates its id from the repository's one counter.
 */
import { describe, expect, it } from 'vitest';

import { runInExecutionRoot } from '@delendai/core/lib/shared/execution-root';

import { triageProposalPaths } from '../src/lib/proposal-paths.service';

const SERVER = '/repo';
const WORKTREE = '/worktrees/x638';

const paths = () =>
	triageProposalPaths(
		{ root: SERVER, resolve: (relative) => `${SERVER}/${relative}` },
		'docs/delendai',
		'.cache/delendai',
	);

describe('triage proposal paths', () => {
	it("answers with the server's tree outside a bound call", () => {
		expect(paths().proposalsDirAbs).toBe(
			`${SERVER}/docs/delendai/proposals`,
		);
	});

	it('moves the proposals directory, and only it, inside a bound call', async () => {
		const scoped = paths();
		await runInExecutionRoot(WORKTREE, async () => {
			expect(scoped.proposalsDirAbs).toBe(
				`${WORKTREE}/docs/delendai/proposals`,
			);
			expect(scoped.counterPathAbs).toBe(
				`${SERVER}/.cache/delendai/proposal-id-counters.json`,
			);
		});
	});
});
