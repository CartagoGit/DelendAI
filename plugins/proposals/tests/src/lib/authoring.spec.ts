import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import type {
	IGitRunResult,
	IGitRunner,
} from '@delendai/proposals/lib/shared/git-runner';

import { runAgentLockEngine } from '@delendai/proposals/lib/locks/agent-lock-engine';
import { runAgentNames } from '@delendai/proposals/lib/tools/agent-names.tool';
import {
	buildCloseSliceRegistration,
	buildCreateProposalRegistration,
	buildProposalBoardRegistration,
	buildReviewRegistration,
	type IAuthoringToolOptions,
	REVIEW_OUTPUT_SCHEMA,
} from '@delendai/proposals/lib/tools/authoring.tool';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

const proposalPath = (opts: IAuthoringToolOptions, file: string): string =>
	join(opts.proposalsDirAbs, ...file.split('/'));

const APPROVE_EVIDENCE = {
	commitHash: 'abc1234',
	validateExitCode: 0,
	testsPassing: 2,
	testsTotal: 2,
} as const;

const recentValidate = () => ({
	timestamp: new Date().toISOString(),
	exitCode: 0,
});

describe('proposal authoring (create → board → close)', async () => {
	let root = '';
	let opts: IAuthoringToolOptions;
	beforeEach(() => {
		delete process.env.MCP_HOST;
		root = mkdtempSync(join(tmpdir(), 'authoring-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/delendai/proposals'),
			// x00052: indexPathAbs moved to the cache root.
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			agentNames: {
				namespacePrefix: 'proposals',
				registryPathAbs: join(root, '.cache/agent-registry.json'),
				lockPathAbs: join(root, '.cache/agents.lock.json'),
				queuePathAbs: join(root, '.cache/agent-queue.json'),
				closedTasksPathAbs: join(root, '.cache/closed-tasks.json'),
				workspaceRoot: root,
			},
			peerReviewLogPathAbs: join(
				root,
				'.cache/delendai/proposals/peer-review.jsonl',
			),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
			// a00069 S5: default stub so suites with acceptance that demand
			// validate never shell out; focused S5 specs override this.
			runValidation: async () => ({
				ok: true,
				output: 'ok',
				exitCode: 0,
			}),
			requirePeerReview: false,
		};
	});
	afterEach(() => {
		delete process.env.MCP_HOST;
		rmSync(root, { recursive: true, force: true });
	});

	// f00016 S13: id is now optional — omit it and pass `kind` to get a
	// race-safe allocated id instead.
	it('allocates an id from kind when id is omitted', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({ kind: 'feat', title: 'Auto allocated' }),
		);
		expect(created.ok).toBe(true);
		expect(created.file).toBe('ready/feats/f00001-auto-allocated.md');

		// A second call with the same kind continues the sequence, not f00001 again.
		const second = parse(
			await create({ kind: 'feat', title: 'Second one' }),
		);
		expect(second.file).toBe('ready/feats/f00002-second-one.md');
	});

	// x00157 S1: kebab() strips ALL non-ASCII characters, so a title
	// like "提案" used to collapse to "" — every non-ASCII title
	// produced the SAME shape (`${id}-.md`), and a second non-ASCII
	// proposal would overwrite... no, different ids still differ, but
	// the filename gives the user zero signal their title was even
	// used. slugFromTitle falls back to the (always-unique) id instead.
	it('falls back to the proposal id in the filename for a non-ASCII title (x00157 S1)', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(await create({ kind: 'feat', title: '提案' }));
		expect(created.ok).toBe(true);
		expect(created.file).toBe('ready/feats/f00001-f00001.md');
		expect(created.file).not.toBe('ready/feats/f00001-.md');
	});

	it('errors clearly when neither id nor kind is provided', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const result = await create({ title: 'No id, no kind' });
		expect(result).toMatchObject({ isError: true });
	});

	it('rejects explicit ids that would create a lint-invalid document', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const result = await create({ id: 'f1', title: 'Not padded' });
		expect(result).toMatchObject({ isError: true });
		expect(parse(result).error.reason).toMatch(/invalid proposal id/);
	});

	it('creates a proposal with disjoint slices, lists it on the board, and closes a slice', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'f00081',
				title: 'Add login',
				goal: 'Login flow',
				slices: [
					{
						sliceId: 's1',
						files: ['src/a.ts'],
						acceptance: ['bun test'],
					},
					{ sliceId: 's2', files: ['src/b.ts'] },
				],
			}),
		);
		expect(created.ok).toBe(true);
		expect(created.file).toBe('ready/feats/f00081-add-login.md');

		const board = await capture(buildProposalBoardRegistration(opts));
		const view = parse(await board({}));
		const p1 = view.proposals.find(
			(p: { id: string }) => p.id === 'f00081',
		);
		// The generator canonicalises slice ids to uppercase (`S1`), while
		// close_slice below still accepts the caller's lowercase spelling.
		expect(p1.slices.map((s: { sliceId: string }) => s.sliceId)).toEqual([
			'S1',
			'S2',
		]);
		expect(p1.claimableSliceIds).toContain('S1');

		const close = await capture(buildCloseSliceRegistration(opts));
		const closed = parse(
			await close({
				proposalId: 'f00081',
				sliceId: 's1',
				releaseLock: false,
				validateEvidence: recentValidate(),
			}),
		);
		expect(closed.closed).toBe(true);
		const doc = readFileSync(proposalPath(opts, created.file), 'utf8');
		expect(doc).toMatch(/### S1[\s\S]*?- \*\*Status\*\*: done/);
	});

	it('returns a typed no-op persistence result when mode is none', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00088',
			title: 'No-op persist',
			slices: [{ sliceId: 's1', files: ['src/no-op.ts'] }],
		});

		const close = await capture(buildCloseSliceRegistration(opts));
		const result = parse(
			await close({
				proposalId: 'f00088',
				sliceId: 's1',
				releaseLock: false,
				validateEvidence: recentValidate(),
			}),
		);
		expect(result.closed).toBe(true);
		expect(result.persist).toEqual({
			committed: false,
			pushed: false,
			mode: 'none',
		});
	});

	it('does not close or release when commit-and-push is incomplete', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'f00089',
				title: 'Incomplete push',
				slices: [{ sliceId: 's1', files: ['src/incomplete.ts'] }],
			}),
		);
		const runner: IGitRunner = async (
			args: readonly string[],
		): Promise<IGitRunResult> => {
			if (args[0] === 'add' || args[0] === 'commit') {
				return { ok: true, output: '' };
			}
			if (args[0] === 'rev-parse') {
				return { ok: true, output: 'abc1234' };
			}
			return { ok: false, output: '', reason: 'push rejected' };
		};
		const close = await capture(
			buildCloseSliceRegistration({
				...opts,
				persist: {
					mode: 'commit-and-push',
					pushTarget: 'origin wip/f00089',
				},
				agentWorktreeEnabled: true,
				persistGit: runner,
			} as IAuthoringToolOptions),
		);
		const result = parse(
			await close({
				proposalId: 'f00089',
				sliceId: 's1',
				validateEvidence: recentValidate(),
			}),
		);
		expect(result.closed).toBe(false);
		expect(result.persist).toMatchObject({
			committed: true,
			pushed: false,
			mode: 'commit-and-push',
		});
		expect(result.lockReleased).toBeUndefined();
		expect(readFileSync(proposalPath(opts, created.file), 'utf8')).toMatch(
			/- \*\*Status\*\*: pending/,
		);
	});

	it('refuses close_slice until a distinct agent has approved the slice', async () => {
		const gated: IAuthoringToolOptions = {
			...opts,
			requirePeerReview: true,
		};
		const create = await capture(buildCreateProposalRegistration(gated));
		const created = parse(
			await create({
				id: 'f00083',
				title: 'Peer review gate',
				goal: 'Must be reviewed',
				slices: [{ sliceId: 's1', files: ['src/c.ts'] }],
			}),
		);
		expect(created.ok).toBe(true);

		const close = await capture(buildCloseSliceRegistration(gated));
		const refused = await close({
			proposalId: 'f00083',
			sliceId: 's1',
			releaseLock: false,
			validateEvidence: recentValidate(),
		});
		expect(refused).toMatchObject({ isError: true });
		expect(parse(refused).blockerType).toBe('peer-review-required');
		expect(readFileSync(proposalPath(opts, created.file), 'utf8')).toMatch(
			/- \*\*Status\*\*: pending/,
		);
	});

	// x00157 S3-adjacent finding: `close_slice` released by the bare
	// `sliceId` (e.g. "S1"), but `auto_work`'s own `claimReady.agent_lock_args`
	// instructs callers to claim with the composite `${proposalId}-${sliceId}`
	// task_id (so two different proposals with the same slice name never
	// collide). Every claim made the recommended way was never actually
	// released — `close_slice` still reported `lockReleased: true` because
	// it never inspected the release engine's result, hiding the leak.
	it('actually releases a lock claimed with the auto_work-recommended composite task_id', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'f00082',
				title: 'Composite lock release',
				goal: 'regression',
				slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
			}),
		);
		expect(created.ok).toBe(true);

		const lockDeps = {
			lockPath: opts.lockPathAbs,
			toolName: 'proposals_agent_lock',
		};
		await runAgentLockEngine(
			{
				action: 'claim',
				task_id: 'f00082-S1',
				agent: 'test-agent',
				files: ['src/a.ts'],
			},
			lockDeps,
		);

		const close = await capture(buildCloseSliceRegistration(opts));
		const closed = parse(
			await close({
				proposalId: 'f00082',
				sliceId: 's1',
				validateEvidence: recentValidate(),
			}),
		);
		expect(closed.closed).toBe(true);
		expect(closed.lockReleased).toBe(true);

		const status = await runAgentLockEngine({ action: 'status' }, lockDeps);
		const statusBody = parse(status);
		expect(statusBody.active_write_lanes).toBe(0);
	});

	it('releases the delegated assignment and lease when closing a slice', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'f00087',
				title: 'Assignment cleanup',
				goal: 'regression',
				slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
			}),
		);
		expect(created.ok).toBe(true);

		const assigned = parse(
			await runAgentNames(
				{
					action: 'assign',
					task_id: 'f00087-S1',
					agent_slot: 'implementation_runner',
				},
				opts.agentNames!,
			),
		) as { subscription_id: string };
		const close = await capture(buildCloseSliceRegistration(opts));
		const closed = parse(
			await close({
				proposalId: 'f00087',
				sliceId: 's1',
				validateEvidence: recentValidate(),
			}),
		);

		expect(closed).toMatchObject({
			closed: true,
			lockReleased: false,
			assignmentReleased: true,
		});
		const heartbeat = await runAgentNames(
			{
				action: 'heartbeat',
				task_id: 'f00087-S1',
				subscription_id: assigned.subscription_id,
			},
			opts.agentNames!,
		);
		expect(heartbeat).toMatchObject({ isError: true });
	});

	it('returns a schema-valid review status without releasing ownership', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00088',
			title: 'Review status contract',
			goal: 'regression',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		const status = parse(
			await review({
				proposalId: 'f00088',
				sliceId: 's1',
				action: 'status',
				agent: 'reviewer',
			}),
		);

		expect(REVIEW_OUTPUT_SCHEMA.parse(status)).toMatchObject({
			action: 'status',
			status: 'none',
			lockReleased: false,
			assignmentReleased: false,
		});
	});

	it('closes the last slice without appending the done marker outside the slice block', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00086',
			title: 'Last slice close',
			goal: 'close final slice cleanly',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const file = proposalPath(
			opts,
			'ready/feats/f00086-last-slice-close.md',
		);
		const original = readFileSync(file, 'utf8');
		const withAcceptance = original.replace(
			/## Acceptance\n\n- \[ \] done\./,
			'## Acceptance\n\n- [ ] done.\n\n## Notes\n\nTail after slices.',
		);
		require('node:fs').writeFileSync(file, withAcceptance, 'utf8');

		const close = await capture(buildCloseSliceRegistration(opts));
		const closed = parse(
			await close({
				proposalId: 'f00086',
				sliceId: 's1',
				releaseLock: false,
				validateEvidence: recentValidate(),
			}),
		);
		expect(closed.closed).toBe(true);

		const doneFile = proposalPath(
			opts,
			'done/feats/f00086-last-slice-close.md',
		);
		expect(existsSync(file)).toBe(false);
		expect(existsSync(doneFile)).toBe(true);
		const doc = readFileSync(doneFile, 'utf8');
		const sliceBlock = doc.slice(
			doc.indexOf('### S1'),
			doc.indexOf('## Acceptance'),
		);
		expect(sliceBlock).toMatch(/- \*\*Status\*\*: done/);
		expect(doc.slice(doc.indexOf('## Acceptance'))).not.toMatch(
			/^- \*\*Status\*\*: done/m,
		);
	});

	it('redacts secrets pasted into the goal before persisting (M23)', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'f00083',
				title: 'Wire API',
				goal: 'Use api_key = "s3cr3tValue123" to call the service',
				slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
			}),
		);
		expect(created.ok).toBe(true);
		expect(created.redactedSecrets).toBeGreaterThan(0);
		const doc = readFileSync(proposalPath(opts, created.file), 'utf8');
		expect(doc).not.toContain('s3cr3tValue123');
		expect(doc).toContain('[REDACTED]');
	});

	it('runs a peer-review loop: submit → request_changes (by another) → resubmit → approve → done (M35)', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'f00084',
				title: 'Review me',
				goal: 'work',
				slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
			}),
		);
		const review = await capture(buildReviewRegistration(opts));
		const file = proposalPath(opts, created.file);
		writeFileSync(
			file,
			readFileSync(file, 'utf8').replace(
				'status: ready',
				'status: ready\nshipped-in: [30551533]',
			),
			'utf8',
		);
		process.env.MCP_HOST = 'implementer-host';

		// Implementer submits for review.
		const submitted = parse(
			await review({
				proposalId: 'f00084',
				sliceId: 's1',
				action: 'submit',
				agent: 'falcon',
			}),
		);
		expect(submitted.status).toBe('in_review');
		expect(submitted.implementer).toBe('falcon');

		// The implementer cannot review their own work.
		const selfReview = parse(
			await review({
				proposalId: 'f00084',
				sliceId: 's1',
				action: 'approve',
				agent: 'falcon',
			}),
		);
		expect(selfReview.ok).toBe(false);
		expect(selfReview.error.reason).toMatch(/different agent/i);

		// A different agent finds a fault.
		const changes = parse(
			await review({
				proposalId: 'f00084',
				sliceId: 's1',
				action: 'request_changes',
				agent: 'eagle',
				note: 'add a test',
			}),
		);
		expect(changes.status).toBe('changes_requested');
		expect(readFileSync(file, 'utf8')).not.toMatch(
			/^- \*\*Status\*\*: done/m,
		);

		// Fixer resubmits; another agent approves the fix.
		const resubmitted = parse(
			await review({
				proposalId: 'f00084',
				sliceId: 's1',
				action: 'submit',
				agent: 'falcon',
			}),
		);
		expect(resubmitted.status).toBe('in_review');
		process.env.MCP_HOST = 'reviewer-host';
		const approved = parse(
			await review({
				proposalId: 'f00084',
				sliceId: 's1',
				action: 'approve',
				agent: 'owl',
				evidence: APPROVE_EVIDENCE,
			}),
		);
		expect(approved.status).toBe('done');
		expect(approved.reviewer).toBe('owl');
		expect(
			approved.rounds.map((r: { verdict: string }) => r.verdict),
		).toEqual(['requested_changes', 'approved']);

		// The doc now carries the real done marker + the review log.
		const doc = readFileSync(file, 'utf8');
		expect(doc).toMatch(/^- \*\*Status\*\*: done/m);
		expect(doc).toMatch(
			/review-log: requested_changes by eagle — add a test/,
		);
		expect(doc).toMatch(/review-log: approved by owl/);
		const reviewLog = readFileSync(opts.peerReviewLogPathAbs!, 'utf8');
		expect(reviewLog).toContain('"proposalId":"f00084"');
		expect(reviewLog).toContain('"action":"approve"');
		expect(reviewLog).toContain('"reviewer":"owl"');
	});

	it('targets the exact slice even when the sliceId has regex metacharacters', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00085',
			title: 'Meta',
			goal: 'work',
			// 'axb' first: an UNescaped /### a.b —/ would match it (`.`=`x`) — the
			// wrong block. The escape pins the match to the literal 'a.b'.
			slices: [
				{ sliceId: 'axb', files: ['src/b.ts'] },
				{ sliceId: 'a.b', files: ['src/a.ts'] },
			],
		});
		const review = await capture(buildReviewRegistration(opts));
		const r = parse(
			await review({
				proposalId: 'f00085',
				sliceId: 'a.b',
				action: 'submit',
				agent: 'falcon',
			}),
		);
		expect(r.status).toBe('in_review');
		const doc = readFileSync(
			proposalPath(opts, 'ready/feats/f00085-meta.md'),
			'utf8',
		);
		// The literal a.b block got the review line; the earlier axb block did NOT.
		const axbBlock = doc.slice(
			doc.indexOf('### axb'),
			doc.indexOf('### a.b'),
		);
		expect(axbBlock).not.toMatch(/review-state/);
		expect(doc.slice(doc.indexOf('### a.b'))).toMatch(
			/review-state: in_review/,
		);
	});

	it('rejects overlapping slices', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const out = parse(
			await create({
				id: 'f00082',
				title: 'Bad',
				slices: [
					{ sliceId: 's1', files: ['x.ts'] },
					{ sliceId: 's2', files: ['x.ts'] },
				],
			}),
		);
		expect(out.ok).toBe(false);
		expect(out.error.reason).toMatch(/share files/);
	});
});

/**
 * An index entry pointing to a file that no longer exists.
 *
 * Pasa en cuanto alguien mueve una propuesta a mano —archivarla en
 * `done/`, por ejemplo— sin pasar por `sync_proposals`, y es lo normal
 * in a repo where the human also touches the files.
 *
 * The board returned `slices: []`, which is **exactly** what a proposal
 * without slices returns. An orchestrator saw "actionable, nothing to
 * claim" and stopped without any clue why.
 */
describe('proposal_board — index points to a file that does not exist', () => {
	let root = '';
	let opts: IAuthoringToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'board-stale-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/delendai/proposals'),
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			peerReviewLogPathAbs: join(
				root,
				'.cache/delendai/proposals/peer-review.jsonl',
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

	it('says it instead of returning an empty slices list', async () => {
		mkdirSync(join(root, '.cache/delendai/proposals'), {
			recursive: true,
		});
		writeFileSync(
			opts.indexPathAbs,
			JSON.stringify({
				proposals: [
					{
						id: 'x00001',
						file: 'ready/x00001-movida.md',
						status: 'ready',
					},
				],
			}),
		);

		const board = await capture(buildProposalBoardRegistration(opts));
		const view = parse(await board({}));
		const p = view.proposals.find((x: { id: string }) => x.id === 'x00001');

		expect(p.slices).toEqual([]);
		// EL test: sin esto, indistinguible de una propuesta sin slices.
		expect(p.unreadable).toContain('does not exist');
		expect(p.unreadable).toContain('sync_proposals');
	});

	it('a proposal without a slices section is not confused either', async () => {
		mkdirSync(join(root, 'docs/delendai/proposals/ready'), {
			recursive: true,
		});
		mkdirSync(join(root, '.cache/delendai/proposals'), {
			recursive: true,
		});
		writeFileSync(
			join(root, 'docs/delendai/proposals/ready/x00002-sin-slices.md'),
			'---\nid: x00002\nstatus: ready\n---\n\n# Sin slices\n',
		);
		writeFileSync(
			opts.indexPathAbs,
			JSON.stringify({
				proposals: [
					{
						id: 'x00002',
						file: 'ready/x00002-sin-slices.md',
						status: 'ready',
					},
				],
			}),
		);

		const board = await capture(buildProposalBoardRegistration(opts));
		const view = parse(await board({}));
		const p = view.proposals.find((x: { id: string }) => x.id === 'x00002');

		expect(p.slices).toEqual([]);
		expect(p.unreadable).toContain('Slices');
		// Y no se confunde con el caso de arriba.
		expect(p.unreadable).not.toContain('does not exist');
	});
});

describe('x00055: redactSecrets on reviewer note in proposal_review', () => {
	let root = '';
	let opts: IAuthoringToolOptions;
	let review: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), 'x00055-review-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/delendai/proposals'),
			indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			peerReviewLogPathAbs: join(
				root,
				'.cache/delendai/proposals/peer-review.jsonl',
			),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
		};
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'f00081',
			title: 'Review me',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		review = await capture(buildReviewRegistration(opts));
	});

	it('redacts a secret pasted into the reviewer note before persisting the review-log bullet', async () => {
		// The review state machine requires the slice to be in_review
		// before a request_changes can land (the implementer must
		// have submitted first). Mirror the flow the existing M35
		// test uses.
		const submitted = parse(
			await review({
				proposalId: 'f00081',
				sliceId: 's1',
				action: 'submit',
				agent: 'falcon',
			}),
		);
		expect(submitted.ok).toBe(true);

		const result = parse(
			await review({
				proposalId: 'f00081',
				sliceId: 's1',
				action: 'request_changes',
				agent: 'eagle',
				note: 'I see a leaked sk_live_abcdef0123456789 in src/x.ts',
			}),
		);
		expect(result.ok).toBe(true);
		expect(result.redactedSecrets).toBeGreaterThan(0);
		const doc = readFileSync(
			proposalPath(opts, 'ready/feats/f00081-review-me.md'),
			'utf8',
		);
		expect(doc).not.toContain('sk_live_abcdef0123456789');
		expect(doc).toContain('[REDACTED]');
	});
});
