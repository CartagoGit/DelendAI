import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	buildCreateProposalRegistration,
	buildReviewRegistration,
	type IAuthoringToolOptions,
} from '@mcp-vertex/proposals/lib/tools/authoring.tool';

const capture = async (
	reg: IToolRegistration,
): Promise<
	(
		a: unknown,
	) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>
> => {
	let h: (
		a: unknown,
	) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};

const parse = (r: { content: Array<{ text: string }> }) =>
	JSON.parse(r.content[0]?.text ?? '{}');

const APPROVE_EVIDENCE = {
	commitHash: 'abc1234',
	validateExitCode: 0,
	testsPassing: 3,
	testsTotal: 3,
} as const;

describe('proposal_review identity gate (a00074 S2)', () => {
	let root = '';
	let opts: IAuthoringToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'review-tool-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/mcp-vertex/proposals'),
			indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			peerReviewLogPathAbs: join(
				root,
				'.cache/mcp-vertex/proposals/peer-review.jsonl',
			),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			runValidation: async () => ({
				ok: true,
				output: 'ok',
				exitCode: 0,
			}),
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('allows approve from a different agent even on the same host+pid', async () => {
		process.env.MCP_HOST = 'shared-host';
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00086',
			title: 'Identity gate',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		const submitted = parse(
			await review({
				proposalId: 'f00086',
				sliceId: 's1',
				action: 'submit',
				agent: 'copilot-minimax-m3',
			}),
		);
		expect(submitted.ok).toBe(true);
		const approved = parse(
			await review({
				proposalId: 'f00086',
				sliceId: 's1',
				action: 'approve',
				agent: 'delivery_verifier',
				evidence: APPROVE_EVIDENCE,
			}),
		);
		expect(approved.ok).toBe(true);
		expect(approved.status).toBe('done');
		expect(approved.reviewer).toBe('delivery_verifier');
	});

	it('rejects approve without empirical evidence after submit', async () => {
		process.env.MCP_HOST = 'shared-host';
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00090',
			title: 'Evidence gate',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		const submitted = parse(
			await review({
				proposalId: 'f00090',
				sliceId: 's1',
				action: 'submit',
				agent: 'copilot-minimax-m3',
			}),
		);
		expect(submitted.ok).toBe(true);
		const approved = parse(
			await review({
				proposalId: 'f00090',
				sliceId: 's1',
				action: 'approve',
				agent: 'delivery_verifier',
			}),
		);
		expect(approved.ok).toBe(false);
		expect(approved.error.reason).toMatch(/empirical evidence/i);
		expect(approved.error.reason).toMatch(/commitHash/);
	});

	it('refuses self-approval by the same agent', async () => {
		process.env.MCP_HOST = 'shared-host';
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00089',
			title: 'Self approval',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		const submitted = parse(
			await review({
				proposalId: 'f00089',
				sliceId: 's1',
				action: 'submit',
				agent: 'copilot-minimax-m3',
			}),
		);
		expect(submitted.ok).toBe(true);
		const approved = parse(
			await review({
				proposalId: 'f00089',
				sliceId: 's1',
				action: 'approve',
				agent: 'copilot-minimax-m3',
			}),
		);
		expect(approved).toEqual({
			ok: false,
			error: {
				reason: 'reviewer must be a different agent from the implementer',
			},
		});
	});

	it('refuses approve before submit with an explicit missing identity reason', async () => {
		process.env.MCP_HOST = 'shared-host';
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00087',
			title: 'Approve first',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		const approved = parse(
			await review({
				proposalId: 'f00087',
				sliceId: 's1',
				action: 'approve',
				agent: 'delivery_verifier',
				evidence: APPROVE_EVIDENCE,
			}),
		);
		expect(approved).toEqual({
			ok: false,
			error: {
				reason: 'missing-submit-identity',
				nextAction:
					'submit the slice for review before approving it so the implementer identity is recorded',
			},
		});
	});

	it('allows request_changes without empirical evidence', async () => {
		process.env.MCP_HOST = 'shared-host';
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00091',
			title: 'Reject without evidence',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		await review({
			proposalId: 'f00091',
			sliceId: 's1',
			action: 'submit',
			agent: 'copilot-minimax-m3',
		});
		const requestedChanges = parse(
			await review({
				proposalId: 'f00091',
				sliceId: 's1',
				action: 'request_changes',
				agent: 'delivery_verifier',
				note: 'add coverage',
			}),
		);
		expect(requestedChanges.ok).toBe(true);
		expect(requestedChanges.status).toBe('changes_requested');
	});

	it('writes the submit identity log that review approval reads back', async () => {
		process.env.MCP_HOST = 'shared-host';
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00088',
			title: 'Identity log',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		await review({
			proposalId: 'f00088',
			sliceId: 's1',
			action: 'submit',
			agent: 'copilot-minimax-m3',
		});
		const raw = readFileSync(
			join(root, '.cache/mcp-vertex/review-identity.jsonl'),
			'utf8',
		);
		const record = JSON.parse(raw.trim());
		expect(record.proposalId).toBe('f00088');
		expect(record.sliceId).toBe('s1');
		expect(record.host).toBe('shared-host');
		expect(record.pid).toBe(process.pid);
		expect(record.agent).toBe('copilot-minimax-m3');
	});

	it('reports that status does not release the delegated assignment', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00093',
			title: 'Review status contract',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		const result = parse(
			await review({
				proposalId: 'f00093',
				sliceId: 's1',
				action: 'status',
				agent: 'delivery_verifier',
			}),
		);

		expect(result).toMatchObject({
			ok: true,
			lockReleased: false,
			assignmentReleased: false,
		});
	});

	it('gives a recovery path when the requested slice is not declared', async () => {
		process.env.MCP_HOST = 'shared-host';
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00092',
			title: 'Missing slice guidance',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		const result = parse(
			await review({
				proposalId: 'f00092',
				sliceId: 'stale-slice',
				action: 'status',
				agent: 'delivery_verifier',
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.error.nextAction).toContain(
			'proposal_get { view: "slices", proposalId: "f00092" }',
		);
		expect(result.error.nextAction).toContain(
			'proposal_reconcile_folder { id: "f00092"',
		);
		expect(result.error.nextAction).toContain(
			'proposal_force_transition { id: "f00092", to: "done"',
		);
	});
});
