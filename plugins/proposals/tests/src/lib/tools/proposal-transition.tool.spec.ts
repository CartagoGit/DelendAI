import {
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	hasIndependentPeerApproval,
	runProposalTransition as runProposalTransitionRaw,
	type IProposalTransitionToolOptions,
} from '@mcp-vertex/proposals/lib/tools/proposal-transition.tool';
import {
	PROPOSAL_STATUS_TRANSITIONS,
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
} from '@mcp-vertex/proposals/lib/contracts/constants/proposal-glossary.constant';
import type { IGitRunner } from '@mcp-vertex/proposals/lib/shared/git-runner';
import * as planClosureGuardModule from '@mcp-vertex/proposals/lib/swarm/plan-closure-guard';
import {
	getPlanClosureBypassCount,
	listPlanClosureBypasses,
	resetPlanClosureBypassLog,
} from '@mcp-vertex/proposals/lib/shared/plan-closure-bypass-log';

const _RECENT_VALIDATE_LOG = '/dev/null';
const RECENT_VALIDATE = {
	timestamp: new Date().toISOString(),
	exitCode: 0,
	logPath: '.cache/validate.log',
} as const;

const recentValidateWithLog = async (root: string) => {
	const logPath = join(root, '.cache', 'validate.log');
	await mkdir(dirname(logPath), { recursive: true });
	await writeFile(logPath, 'ok\n', 'utf8');
	return {
		timestamp: new Date().toISOString(),
		exitCode: 0 as const,
		logPath,
	};
};

// A real `git mv` actually moves the file; the fake must too, or the tool's
// post-move read (and every assertion on the new path) would silently pass
// for the wrong reason (a no-op "success"). x00106 S2: the tool now asks
// `ls-files --error-unmatch` first — both fakes answer it as TRACKED so
// these specs keep exercising the git-mv path.
const FAKE_GIT_MV: IGitRunner = async (args) => {
	if (args[0] === 'mv') {
		const [, from, to] = args;
		if (from && to) await rename(from, to);
	}
	return { ok: true, output: '' };
};
const FAKE_GIT_FAIL: IGitRunner = async (args) => {
	if (args[0] === 'ls-files') return { ok: true, output: '' };
	return { ok: false, output: '', reason: 'not a git repository' };
};

const isErrorResult = (result: unknown): boolean =>
	typeof result === 'object' &&
	result !== null &&
	'isError' in result &&
	result.isError === true;

type ProposalTransitionResult = Awaited<
	ReturnType<typeof runProposalTransitionRaw>
> & { isError?: boolean };

const runProposalTransition = async (
	...args: Parameters<typeof runProposalTransitionRaw>
): Promise<ProposalTransitionResult> =>
	runProposalTransitionRaw(...args) as Promise<ProposalTransitionResult>;

const writeProposal = async (
	proposalsDirAbs: string,
	folder: string,
	filename: string,
	frontmatter: Record<string, string>,
	body = '## Goal\n\np.\n',
): Promise<void> => {
	const dir = join(proposalsDirAbs, folder);
	await mkdir(dir, { recursive: true });
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	const raw = `---\n${lines.join('\n')}\n---\n\n${body}`;
	await writeFile(join(dir, filename), raw, 'utf8');
};

const writePeerReviewLog = async (
	logPathAbs: string,
	entries: readonly Record<string, unknown>[],
): Promise<void> => {
	await mkdir(dirname(logPathAbs), { recursive: true });
	await writeFile(
		logPathAbs,
		`${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
		'utf8',
	);
};

describe('proposal_transition', async () => {
	let root = '';
	let options: IProposalTransitionToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'transition-'));
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: root,
			workspaceRoot: root,
			gitRunner: FAKE_GIT_MV,
			peerReviewLogPathAbs: join(root, '.cache', 'peer-review.jsonl'),
			// Pre-S7 DFA cases stay free of peer-review noise; S7 suite opts in.
			requirePeerReview: false,
		};
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('requires a non-empty reason', async () => {
		const result = await runProposalTransition(
			{ id: 'f00014', to: 'in-progress', reason: '' },
			options,
		);
		expect(isErrorResult(result)).toBe(true);
	});

	it('rejects an unknown target status', async () => {
		const result = await runProposalTransition(
			{ id: 'f00014', to: 'bogus', reason: 'because' },
			options,
		);
		expect(isErrorResult(result)).toBe(true);
	});

	it('returns an error when the id is not found', async () => {
		const result = await runProposalTransition(
			{ id: 'f999', to: 'in-progress', reason: 'because' },
			options,
		);
		expect(isErrorResult(result)).toBe(true);
	});

	it('refuses a proposal whose current status is not on the new state machine (legacy)', async () => {
		await writeProposal(root, 'ready', 'p001-legacy.md', {
			id: 'p001',
			status: 'pending',
		});
		const result = await runProposalTransition(
			{ id: 'p001', to: 'in-progress', reason: 'because' },
			options,
		);
		expect(isErrorResult(result)).toBe(true);
	});

	it('moves the file and updates frontmatter on a legal transition (ready -> in-progress)', async () => {
		await writeProposal(root, 'ready', 'f00014-do-thing.md', {
			id: 'f00014',
			status: 'ready',
		});
		const result = await runProposalTransition(
			{ id: 'f00014', to: 'in-progress', reason: 'claimed' },
			options,
		);
		if (isErrorResult(result)) {
			process.stderr.write(`\n\nDEBUG: ${result.content?.[0]?.text}\n\n`);
		}
		expect(isErrorResult(result)).toBe(false);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.from).toBe('ready');
		expect(body.to).toBe('in-progress');
		const moved = await readFile(
			join(root, 'in-progress', 'f00014-do-thing.md'),
			'utf8',
		);
		expect(moved).toContain('status: in-progress');
	});

	it('rejects an illegal transition (done -> in-progress)', async () => {
		await writeProposal(root, 'done', 'f00015-shipped.md', {
			id: 'f00015',
			status: 'done',
		});
		const result = await runProposalTransition(
			{ id: 'f00015', to: 'in-progress', reason: 'oops' },
			options,
		);
		expect(result.isError).toBe(true);
	});

	it('falls back to a plain rename (with a warning) when git mv fails', async () => {
		await writeProposal(root, 'ready', 'f00017-do-thing.md', {
			id: 'f00017',
			status: 'ready',
		});
		const result = await runProposalTransition(
			{ id: 'f00017', to: 'blocked', reason: 'deps missing' },
			{ ...options, gitRunner: FAKE_GIT_FAIL },
		);
		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.warning).toContain('git mv failed');
		const moved = await readFile(
			join(root, 'blocked', 'f00017-do-thing.md'),
			'utf8',
		);
		expect(moved).toContain('status: blocked');
	});

	// 7x7 transition matrix: legal edges succeed, illegal edges are rejected.
	const statuses = Object.keys(PROPOSAL_STATUSES);
	for (const from of statuses) {
		for (const to of statuses) {
			if (from === to) continue;
			const legal = PROPOSAL_STATUS_TRANSITIONS[
				from as keyof typeof PROPOSAL_STATUS_TRANSITIONS
			].has(to as never);
			it(`${legal ? 'allows' : 'rejects'} ${from} -> ${to}`, async () => {
				const folder =
					STATUS_TO_FOLDER[from as keyof typeof STATUS_TO_FOLDER];
				const filename = `f200-${from}-${to}.md`;
				const frontmatter: Record<string, string> = {
					id: `f200${from}${to}`.replace(/[^a-z0-9]/g, ''),
					status: from,
				};
				if (to === 'done') {
					frontmatter['shipped-in'] = '[abc1234]';
				}
				if (to === 'paused') {
					frontmatter['paused-reason'] = 'matrix test pause reason';
				}
				await writeProposal(root, folder, filename, frontmatter);
				const result = await runProposalTransition(
					{
						id: `f200${from}${to}`.replace(/[^a-z0-9]/g, ''),
						to,
						reason: 'matrix test',
						...(to === 'review'
							? { validateEvidence: RECENT_VALIDATE }
							: to === 'done'
								? {
										validateEvidence:
											await recentValidateWithLog(root),
									}
								: {}),
					},
					options,
				);
				const allowed = legal || (from === 'ready' && to === 'done');
				if (allowed) {
					expect(result.isError).toBeUndefined();
				} else {
					expect(result.isError).toBe(true);
				}
			});
		}
	}

	// f00042: `done/<kind>/` mirror. Closing a feat proposal must move the
	// file to `done/feats/`, not `done/`. Same for every kind that has a
	// sub-folder. This regression covers the original bug — previously
	// the file ended up at `done/` directly. Source folder is `review`
	// because `in-progress → done` is not a legal DFA edge (the engine
	// routes every close through `review` first).
	describe('done/<kind>/ sub-folder routing (f00042)', async () => {
		const cases: ReadonlyArray<{
			readonly kind: string;
			readonly prefix: string;
			readonly subfolder: string;
		}> = [
			{ kind: 'feat', prefix: 'f', subfolder: 'feats' },
			{ kind: 'fix', prefix: 'x', subfolder: 'fixes' },
			{ kind: 'refactor', prefix: 'r', subfolder: 'refactors' },
			{ kind: 'audit', prefix: 'a', subfolder: 'audits' },
			{ kind: 'chore', prefix: 'c', subfolder: 'chores' },
			{ kind: 'docs', prefix: 'd', subfolder: 'docs' },
			{ kind: 'test', prefix: 't', subfolder: 'tests' },
			{ kind: 'plan', prefix: 'q', subfolder: 'plans' },
			{ kind: 'resume', prefix: 'n', subfolder: 'resumes' },
		];
		for (const { kind, prefix, subfolder } of cases) {
			it(`closes a kind:${kind} proposal into done/${subfolder}/`, async () => {
				const id = `${prefix}70000`;
				const filename = `${prefix}70000-subfolder-routing.md`;
				await writeProposal(root, 'review', filename, {
					id,
					kind,
					status: 'review',
					'shipped-in': '[30551533]',
				});
				const result = await runProposalTransition(
					{
						id,
						to: 'done',
						reason: 'shipping',
						validateEvidence: RECENT_VALIDATE,
					},
					options,
				);
				expect(result.isError).toBeUndefined();
				const moved = await readFile(
					join(root, 'done', subfolder, filename),
					'utf8',
				);
				expect(moved).toContain('status: done');
				// And it MUST NOT live at `done/` itself.
				await expect(
					readFile(join(root, 'done', filename), 'utf8'),
				).rejects.toThrow();
			});
		}

		it('requireValidateEvidence:false lets a host opt out of the gate', async () => {
			// Hosts without a validate chain worth blocking on switch the
			// gate off in config instead of passing `force: true`, which
			// would also disable the peer-review and dependent gates.
			await writeProposal(root, 'review', 'f70002-no-validate.md', {
				id: 'f70002',
				status: 'review',
				'shipped-in': '[30551533]',
			});
			const result = await runProposalTransition(
				{
					id: 'f70002',
					to: 'done',
					reason: 'host opted out of the validate gate',
				},
				{ ...options, requireValidateEvidence: false },
			);
			expect(result.isError).toBeUndefined();
			expect(
				await readFile(
					join(root, 'done', 'f70002-no-validate.md'),
					'utf8',
				),
			).toContain('status: done');
		});

		it('still refuses without evidence when the gate is left on', async () => {
			await writeProposal(root, 'review', 'f70003-needs-validate.md', {
				id: 'f70003',
				status: 'review',
				'shipped-in': '[30551533]',
			});
			const result = await runProposalTransition(
				{
					id: 'f70003',
					to: 'done',
					reason: 'no evidence supplied',
				},
				options,
			);
			expect(result.isError).toBe(true);
		});

		it('falls back to `done/` (no sub-folder) when kind is missing', async () => {
			await writeProposal(root, 'review', 'f70001-no-kind.md', {
				id: 'f70001',
				status: 'review',
				'shipped-in': '[30551533]',
			});
			const result = await runProposalTransition(
				{
					id: 'f70001',
					to: 'done',
					reason: 'no kind declared',
					validateEvidence: RECENT_VALIDATE,
				},
				options,
			);
			expect(result.isError).toBeUndefined();
			const moved = await readFile(
				join(root, 'done', 'f70001-no-kind.md'),
				'utf8',
			);
			expect(moved).toContain('status: done');
		});

		it('falls back to `done/` for kinds without a registered sub-folder', async () => {
			await writeProposal(root, 'review', 'l70002-legacy.md', {
				id: 'l70002',
				kind: 'legacy',
				status: 'review',
				'shipped-in': '[30551533]',
			});
			const result = await runProposalTransition(
				{
					id: 'l70002',
					to: 'done',
					reason: 'legacy',
					validateEvidence: RECENT_VALIDATE,
				},
				options,
			);
			expect(result.isError).toBeUndefined();
			const moved = await readFile(
				join(root, 'done', 'l70002-legacy.md'),
				'utf8',
			);
			expect(moved).toContain('status: done');
		});
	});

	describe('c00075 paused-reason and blocked redirection', () => {
		it('allows transition to paused when paused-reason is set', async () => {
			await writeProposal(root, 'ready', 'f80001-paused.md', {
				id: 'f80001',
				status: 'ready',
				'paused-reason': 'deferred by user request',
			});
			const result = await runProposalTransition(
				{ id: 'f80001', to: 'paused', reason: 'pause it' },
				options,
			);
			expect(result.isError).toBeUndefined();
			const moved = await readFile(
				join(root, 'paused', 'f80001-paused.md'),
				'utf8',
			);
			expect(moved).toContain('status: paused');
		});

		it('rejects transition to paused when paused-reason is missing and no dependency is present', async () => {
			await writeProposal(root, 'ready', 'f80002-nopause.md', {
				id: 'f80002',
				status: 'ready',
			});
			const result = await runProposalTransition(
				{ id: 'f80002', to: 'paused', reason: 'pause it' },
				options,
			);
			expect(result.isError).toBe(true);
			expect(result.content?.[0]?.text).toContain(
				'paused requires a paused-reason field or a blocked-by dependency',
			);
		});

		it('redirects transition to blocked when paused-reason is missing but reason names a dependency', async () => {
			await writeProposal(root, 'ready', 'f80003-redirect.md', {
				id: 'f80003',
				status: 'ready',
			});
			const result = await runProposalTransition(
				{ id: 'f80003', to: 'paused', reason: 'blocked by f00078' },
				options,
			);
			expect(result.isError).toBeUndefined();
			const moved = await readFile(
				join(root, 'blocked', 'f80003-redirect.md'),
				'utf8',
			);
			expect(moved).toContain('status: blocked');
			expect(moved).toContain('blocked-by: [f00078]');
		});

		it('redirects transition to blocked when paused-reason is missing but blocked-by is present in frontmatter', async () => {
			await writeProposal(root, 'ready', 'f80004-redirect-fm.md', {
				id: 'f80004',
				status: 'ready',
				'blocked-by': '[f00057]',
			});
			const result = await runProposalTransition(
				{ id: 'f80004', to: 'paused', reason: 'trying to pause' },
				options,
			);
			expect(result.isError).toBeUndefined();
			const moved = await readFile(
				join(root, 'blocked', 'f80004-redirect-fm.md'),
				'utf8',
			);
			expect(moved).toContain('status: blocked');
			expect(moved).toContain('blocked-by: [f00057]');
		});
	});

	describe('a00069 S3 — atomic transition + nextHops + Files rewrite', () => {
		it('blocks ready -> done without explicit evidence before any DFA shortcut closes', async () => {
			await writeProposal(root, 'ready', 'f90001-nexthops.md', {
				id: 'f90001',
				status: 'ready',
				kind: 'feat',
				'shipped-in': '[30551533]',
			});
			const result = await runProposalTransition(
				{ id: 'f90001', to: 'done', reason: 'shortcut' },
				options,
			);
			expect(result.isError).toBe(true);
			const body = JSON.parse(result.content[0]?.text ?? '{}') as {
				ok: boolean;
				error?: { nextHops?: string[]; reason?: string };
			};
			expect(body.ok).toBe(false);
			expect(body.error?.reason).toMatch(/validateEvidence/i);
			expect(body.error?.nextHops).toBeUndefined();
		});

		it('rewrites stale **Files** self-paths and marks indexSynced when index is configured', async () => {
			const filename = 'f90002-files-rewrite.md';
			const oldRel = `review/${filename}`;
			const body = [
				'---',
				'id: f90002',
				'kind: feat',
				'status: review',
				'shipped-in: [30551533]',
				'---',
				'',
				'## Slices',
				'',
				'### S1 — ship',
				`- **Files**: \`${oldRel}\``,
				'- **Status**: done',
				'',
			].join('\n');
			await mkdir(join(root, 'review'), { recursive: true });
			await writeFile(join(root, 'review', filename), body, 'utf8');

			const indexPathAbs = join(
				root,
				'.cache',
				'proposals',
				'index.json',
			);
			await mkdir(join(root, '.cache', 'proposals'), { recursive: true });
			await writeFile(
				indexPathAbs,
				JSON.stringify({
					proposals: [
						{
							id: 'f90002',
							file: oldRel,
							status: 'review',
							type: 'feat',
							track: 't',
							date: '2026-07-25',
						},
					],
				}),
				'utf8',
			);

			const result = await runProposalTransition(
				{
					id: 'f90002',
					to: 'done',
					reason: 'shipping',
					validateEvidence: RECENT_VALIDATE,
				},
				{ ...options, indexPathAbs, workspaceRoot: root },
			);
			expect(result.isError).toBeUndefined();
			const payload = JSON.parse(result.content[0]?.text ?? '{}') as {
				ok: boolean;
				movedTo?: string;
				indexSynced?: boolean;
				filesRewritten?: number;
			};
			expect(payload.ok).toBe(true);
			expect(payload.movedTo).toBe(`done/feats/${filename}`);
			expect(payload.filesRewritten).toBe(1);
			// indexSynced depends on syncProposalRegistry succeeding against
			// the temp layout; tolerate false when the temp root has no full
			// host layout, but the file move + rewrite must still hold.
			const moved = await readFile(
				join(root, 'done', 'feats', filename),
				'utf8',
			);
			expect(moved).toContain('status: done');
			expect(moved).toContain(`done/feats/${filename}`);
			expect(moved).not.toContain(`\`${oldRel}\``);
		});

		it('does not leave a twin behind after review → done', async () => {
			await writeProposal(root, 'review', 'f90003-no-twin.md', {
				id: 'f90003',
				status: 'review',
				kind: 'feat',
				'shipped-in': '[30551533]',
			});
			const result = await runProposalTransition(
				{
					id: 'f90003',
					to: 'done',
					reason: 'ship',
					validateEvidence: RECENT_VALIDATE,
				},
				options,
			);
			expect(result.isError).toBeUndefined();
			await expect(
				readFile(join(root, 'review', 'f90003-no-twin.md'), 'utf8'),
			).rejects.toThrow();
			const moved = await readFile(
				join(root, 'done', 'feats', 'f90003-no-twin.md'),
				'utf8',
			);
			expect(moved).toContain('status: done');
		});
	});

	describe('a00074 S1 guards', () => {
		it('blocks done -> review without force', async () => {
			await writeProposal(root, 'done', 'f91001-regress.md', {
				id: 'f91001',
				status: 'done',
			});
			const result = await runProposalTransition(
				{ id: 'f91001', to: 'review', reason: 're-open' },
				options,
			);
			expect(result.isError).toBe(true);
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.error.code).toBe('invalid-regression');
		});

		it('allows done -> review with force + reason and writes one audit line', async () => {
			await writeProposal(root, 'done', 'f91002-regress.md', {
				id: 'f91002',
				status: 'done',
			});
			const result = await runProposalTransition(
				{
					id: 'f91002',
					to: 'review',
					reason: 're-open after post-ship audit',
					force: true,
					agent: 'agent-s1',
				},
				options,
			);
			expect(result.isError).toBeUndefined();
			const log = await readFile(
				join(root, '.cache', 'mcp-vertex', 'proposals-state.log'),
				'utf8',
			);
			const lines = log.trim().split('\n');
			expect(lines).toHaveLength(1);
			const entry = JSON.parse(lines[0] ?? '{}');
			expect(entry.proposalId).toBe('f91002');
			expect(entry.from).toBe('done');
			expect(entry.to).toBe('review');
			expect(entry.caller.agent).toBe('agent-s1');
		});

		it('blocks done -> review with force and blank reason', async () => {
			await writeProposal(root, 'done', 'f91003-regress.md', {
				id: 'f91003',
				status: 'done',
			});
			const result = await runProposalTransition(
				{ id: 'f91003', to: 'review', reason: ' ', force: true },
				options,
			);
			expect(result.isError).toBe(true);
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.error.code).toBe('invalid-regression');
		});

		it('keeps in-progress -> review allowed', async () => {
			await writeProposal(root, 'in-progress', 'f91004-review.md', {
				id: 'f91004',
				status: 'in-progress',
			});
			const result = await runProposalTransition(
				{
					id: 'f91004',
					to: 'review',
					reason: 'ready for review',
					validateEvidence: RECENT_VALIDATE,
				},
				options,
			);
			expect(result.isError).toBeUndefined();
		});

		it('blocks ready -> done without explicit evidence', async () => {
			await writeProposal(root, 'ready', 'f91005-close.md', {
				id: 'f91005',
				status: 'ready',
				'shipped-in': '[30551533]',
			});
			const result = await runProposalTransition(
				{ id: 'f91005', to: 'done', reason: 'retro close' },
				options,
			);
			expect(result.isError).toBe(true);
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.error.code).toBe('missing-evidence');
		});

		it('blocks ready -> done with stale evidence', async () => {
			const logPath = join(root, '.cache', 'stale.log');
			await mkdir(dirname(logPath), { recursive: true });
			await writeFile(logPath, 'stale\n', 'utf8');
			await writeProposal(root, 'ready', 'f91006-close.md', {
				id: 'f91006',
				status: 'ready',
				'shipped-in': '[30551533]',
			});
			const result = await runProposalTransition(
				{
					id: 'f91006',
					to: 'done',
					reason: 'retro close',
					validateEvidence: {
						timestamp: '2026-07-20T00:00:00.000Z',
						exitCode: 0,
						logPath,
					},
				},
				options,
			);
			expect(result.isError).toBe(true);
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.error.code).toBe('stale-evidence');
		});

		it('blocks done transitions when shipped-in is empty', async () => {
			const validateEvidence = await recentValidateWithLog(root);
			await writeProposal(root, 'ready', 'f91007-close.md', {
				id: 'f91007',
				status: 'ready',
				'shipped-in': '[]',
			});
			const result = await runProposalTransition(
				{
					id: 'f91007',
					to: 'done',
					reason: 'retro close',
					validateEvidence,
				},
				options,
			);
			expect(result.isError).toBe(true);
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.error.code).toBe('missing-shipped-in');
		});

		it('allows retroactive ready -> done when evidence + shipped-in are present', async () => {
			const validateEvidence = await recentValidateWithLog(root);
			await writeProposal(root, 'ready', 'a00067-retroactive.md', {
				id: 'a00067',
				status: 'ready',
				kind: 'audit',
				'shipped-in': '[30551533]',
			});
			const result = await runProposalTransition(
				{
					id: 'a00067',
					to: 'done',
					reason: 'retroactive close after prior shipment',
					validateEvidence,
				},
				options,
			);
			expect(result.isError).toBeUndefined();
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.ok).toBe(true);
			expect(body.to).toBe('done');
		});
	});
});

describe('a00069 S7 peer-review gate on review → done', () => {
	let root = '';
	let options: IProposalTransitionToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'transition-s7-'));
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: root,
			workspaceRoot: root,
			gitRunner: FAKE_GIT_MV,
			peerReviewLogPathAbs: join(
				root,
				'.cache',
				'mcp-vertex',
				'peer-review.jsonl',
			),
			requirePeerReview: true,
		};
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('hasIndependentPeerApproval requires a non-self approve', () => {
		expect(
			hasIndependentPeerApproval(
				'- review-implementer: alice\n- review-log: approved by bob\n',
			),
		).toBe(true);
		expect(
			hasIndependentPeerApproval(
				'- review-implementer: alice\n- review-log: approved by alice\n',
			),
		).toBe(false);
		expect(hasIndependentPeerApproval('no review lines')).toBe(false);
	});

	it('r00010: refuses review → done without a peer-review journal entry', async () => {
		await writeProposal(root, 'review', 'f00970-s7.md', {
			id: 'f00970',
			status: 'review',
			type: 'feat',
			'shipped-in': '[30551533]',
		});
		const result = await runProposalTransition(
			{
				id: 'f00970',
				to: 'done',
				reason: 'ship',
				validateEvidence: RECENT_VALIDATE,
			},
			options,
		);
		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.error.code).toBe('peer-review-missing');
		expect(body.error.blockerType).toBe('missing-peer-review');
	});

	it('a00065: allows review → done after an independent approve is logged after review', async () => {
		await writeProposal(
			root,
			'review',
			'f00971-s7.md',
			{
				id: 'f00971',
				status: 'review',
				type: 'feat',
				'shipped-in': '[30551533]',
			},
			[
				'## Slices',
				'',
				'### S1 — work',
				'- **Status**: done',
				'- review-state: done',
				'- review-implementer: alice',
				'- review-reviewer: bob',
				'- review-log: approved by bob',
				'',
			].join('\n'),
		);
		await writePeerReviewLog(options.peerReviewLogPathAbs!, [
			{
				kind: 'transition',
				ts: '2026-07-25T10:00:00.000Z',
				proposalId: 'f00971',
				from: 'in-progress',
				to: 'review',
			},
			{
				kind: 'review',
				ts: '2026-07-25T10:01:00.000Z',
				proposalId: 'f00971',
				sliceId: 'S1',
				action: 'approve',
				implementer: 'alice',
				reviewer: 'bob',
				verdict: 'approved',
			},
		]);
		const result = await runProposalTransition(
			{
				id: 'f00971',
				to: 'done',
				reason: 'peer approved',
				validateEvidence: RECENT_VALIDATE,
			},
			options,
		);
		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.to).toBe('done');
	});

	it('requires attached CI evidence before in-progress → review in CI', async () => {
		const previousCi = process.env.CI;
		const previousSha = process.env.GITHUB_SHA;
		process.env.CI = 'true';
		process.env.GITHUB_SHA = 'feedface1234';
		try {
			await writeProposal(root, 'in-progress', 'f00972-ci-review.md', {
				id: 'f00972',
				status: 'in-progress',
				type: 'feat',
			});
			const result = await runProposalTransition(
				{
					id: 'f00972',
					to: 'review',
					reason: 'ready for review',
					validateEvidence: RECENT_VALIDATE,
				},
				options,
			);
			expect(result.isError).toBe(true);
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.error.code).toBe('missing-ci-evidence');
		} finally {
			if (previousCi === undefined) {
				delete process.env.CI;
			} else {
				process.env.CI = previousCi;
			}
			if (previousSha === undefined) {
				delete process.env.GITHUB_SHA;
			} else {
				process.env.GITHUB_SHA = previousSha;
			}
		}
	});

	it('rejects in-progress → review in CI when evidence.commit does not match GITHUB_SHA', async () => {
		const previousCi = process.env.CI;
		const previousSha = process.env.GITHUB_SHA;
		process.env.CI = 'true';
		process.env.GITHUB_SHA = 'feedface1234';
		try {
			const validateEvidence = await recentValidateWithLog(root);
			const dir = join(root, 'in-progress');
			await mkdir(dir, { recursive: true });
			await writeFile(
				join(dir, 'f00973-ci-review.md'),
				[
					'---',
					'id: f00973',
					'status: in-progress',
					'type: feat',
					'evidence:',
					'  commit: "abc123"',
					'  ci-runs:',
					'    - name: "CI"',
					'      status: "success"',
					'      runId: "101"',
					'---',
					'',
					'## Goal',
					'',
					'p.',
				].join('\n'),
				'utf8',
			);
			const result = await runProposalTransition(
				{
					id: 'f00973',
					to: 'review',
					reason: 'ready for review',
					validateEvidence,
				},
				options,
			);
			expect(result.isError).toBe(true);
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.error.code).toBe('ci-evidence-sha-mismatch');
		} finally {
			if (previousCi === undefined) {
				delete process.env.CI;
			} else {
				process.env.CI = previousCi;
			}
			if (previousSha === undefined) {
				delete process.env.GITHUB_SHA;
			} else {
				process.env.GITHUB_SHA = previousSha;
			}
		}
	});

	it('allows in-progress → review in CI when frontmatter evidence matches GITHUB_SHA', async () => {
		const previousCi = process.env.CI;
		const previousSha = process.env.GITHUB_SHA;
		process.env.CI = 'true';
		process.env.GITHUB_SHA = 'feedface1234';
		try {
			const validateEvidence = await recentValidateWithLog(root);
			const dir = join(root, 'in-progress');
			await mkdir(dir, { recursive: true });
			await writeFile(
				join(dir, 'f00973-ci-review.md'),
				[
					'---',
					'id: f00973',
					'status: in-progress',
					'type: feat',
					'evidence:',
					'  commit: "feedface1234"',
					'  ci-runs:',
					'    - name: "CI"',
					'      status: "success"',
					'      runId: "101"',
					'---',
					'',
					'## Goal',
					'',
					'p.',
				].join('\n'),
				'utf8',
			);
			const result = await runProposalTransition(
				{
					id: 'f00973',
					to: 'review',
					reason: 'ready for review',
					validateEvidence,
				},
				options,
			);
			expect(result.isError).toBeUndefined();
			const body = JSON.parse(result.content[0]?.text ?? '{}');
			expect(body.ok).toBe(true);
			expect(body.to).toBe('review');
		} finally {
			if (previousCi === undefined) {
				delete process.env.CI;
			} else {
				process.env.CI = previousCi;
			}
			if (previousSha === undefined) {
				delete process.env.GITHUB_SHA;
			} else {
				process.env.GITHUB_SHA = previousSha;
			}
		}
	});

	it('a00063: rejects review → done when the only approval is self-review', async () => {
		await writeProposal(
			root,
			'review',
			'f00974-s7.md',
			{
				id: 'f00974',
				status: 'review',
				type: 'feat',
				'shipped-in': '[30551533]',
			},
			[
				'## Slices',
				'',
				'### S1 — work',
				'- **Status**: done',
				'- review-state: done',
				'- review-implementer: alice',
				'- review-reviewer: alice',
				'- review-log: approved by alice',
				'',
			].join('\n'),
		);
		await writePeerReviewLog(options.peerReviewLogPathAbs!, [
			{
				kind: 'transition',
				ts: '2026-07-25T11:00:00.000Z',
				proposalId: 'f00974',
				from: 'in-progress',
				to: 'review',
			},
			{
				kind: 'review',
				ts: '2026-07-25T11:01:00.000Z',
				proposalId: 'f00974',
				sliceId: 'S1',
				action: 'approve',
				implementer: 'alice',
				reviewer: 'alice',
				verdict: 'approved',
			},
		]);
		const result = await runProposalTransition(
			{
				id: 'f00974',
				to: 'done',
				reason: 'self-reviewed',
				validateEvidence: RECENT_VALIDATE,
			},
			options,
		);
		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.error.code).toBe('peer-review-missing');
		expect(body.error.blockerType).toBe('missing-peer-review');
	});

	it('allows force:true bypass without peer approve', async () => {
		await writeProposal(root, 'review', 'f00972-s7.md', {
			id: 'f00972',
			status: 'review',
			type: 'feat',
			'shipped-in': '[30551533]',
		});
		const result = await runProposalTransition(
			{ id: 'f00972', to: 'done', reason: 'emergency', force: true },
			options,
		);
		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.to).toBe('done');
	});

	it('skips gate when requirePeerReview is false', async () => {
		await writeProposal(root, 'review', 'f00973-s7.md', {
			id: 'f00973',
			status: 'review',
			type: 'feat',
			'shipped-in': '[30551533]',
		});
		const result = await runProposalTransition(
			{
				id: 'f00973',
				to: 'done',
				reason: 'host opted out',
				validateEvidence: RECENT_VALIDATE,
			},
			{ ...options, requirePeerReview: false },
		);
		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
	});

	it('does not apply the peer-review gate on transitions to review', async () => {
		await writeProposal(root, 'in-progress', 'f00975-s7.md', {
			id: 'f00975',
			status: 'in-progress',
			type: 'feat',
		});
		const result = await runProposalTransition(
			{
				id: 'f00975',
				to: 'review',
				reason: 'ready for review',
				validateEvidence: RECENT_VALIDATE,
			},
			options,
		);
		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.to).toBe('review');
	});
});

// a00072 S4 — plan-closure DFA shortcut (`skipDfaForPlanClosure`).
// The wrapper `proposals_close_plan` runs the closure preflight and,
// when closable, forwards the verified plan to `runProposalTransition`
// with `skipDfaForPlanClosure: true`. The flag must reach the
// positive branch (skipping the strict `in-progress → done` DFA
// edge) AND audit the skip with proposal id + caller reason.
describe('a00072 S4 — plan-closure DFA shortcut', () => {
	let root = '';
	let options: IProposalTransitionToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'transition-s4-'));
		const validateEvidence = await recentValidateWithLog(root);
		const indexPathAbs = join(
			root,
			'.cache',
			'mcp-vertex',
			'proposals',
			'index.json',
		);
		await mkdir(dirname(indexPathAbs), { recursive: true });
		await writeFile(
			indexPathAbs,
			JSON.stringify({ proposals: [] }),
			'utf8',
		);
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: root,
			workspaceRoot: root,
			indexPathAbs,
			gitRunner: FAKE_GIT_MV,
			peerReviewLogPathAbs: join(
				root,
				'.cache',
				'mcp-vertex',
				'peer-review.jsonl',
			),
			requirePeerReview: false,
			validateEvidenceDeps: {
				readValidateLog: async () => [
					{
						timestamp: validateEvidence.timestamp,
						ts: validateEvidence.timestamp,
						result: 'pass',
						exitCode: 0,
						logPath: validateEvidence.logPath,
					},
				],
			},
		};
		resetPlanClosureBypassLog();
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('lands a verified plan in done/ when skipDfaForPlanClosure:true and the closure guard is clear', async () => {
		await writeProposal(
			root,
			'in-progress',
			'q80001-verified-plan.md',
			{
				id: 'q80001',
				status: 'in-progress',
				type: 'plan',
				kind: 'plan',
				'shipped-in': '[abcdef1]',
			},
			['## Slices', '', '### S1 — work', '- **Status**: done', ''].join(
				'\n',
			),
		);
		const guardSpy = vi
			.spyOn(planClosureGuardModule, 'runPlanClosureGuard')
			.mockResolvedValue({ closable: true });

		const result = await runProposalTransition(
			{
				id: 'q80001',
				to: 'done',
				reason: 'all children and slices are done',
				skipDfaForPlanClosure: true,
			},
			options,
		);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.from).toBe('in-progress');
		expect(body.to).toBe('done');
		expect(body.movedTo).toBe('done/plans/q80001-verified-plan.md');

		// The shortcut MUST be audited — proposal id, caller's reason,
		// via:'plan-closure-shortcut' marker.
		expect(getPlanClosureBypassCount()).toBe(1);
		const events = listPlanClosureBypasses();
		expect(events[0]).toMatchObject({
			kind: 'plan-closure-bypassed',
			proposalId: 'q80001',
			reason: 'all children and slices are done',
			via: 'plan-closure-shortcut',
		});
		guardSpy.mockRestore();
	});

	it('rejects in-progress → done without the shortcut flag', async () => {
		await writeProposal(
			root,
			'in-progress',
			'q80002-strict-plan.md',
			{
				id: 'q80002',
				status: 'in-progress',
				type: 'plan',
				kind: 'plan',
				'shipped-in': '[abcdef1]',
			},
			['## Slices', '', '### S1 — work', '- **Status**: done', ''].join(
				'\n',
			),
		);
		const guardSpy = vi
			.spyOn(planClosureGuardModule, 'runPlanClosureGuard')
			.mockResolvedValue({ closable: true });

		const result = await runProposalTransition(
			{
				id: 'q80002',
				to: 'done',
				reason: 'no shortcut flag',
			},
			options,
		);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.error.reason).toBe(
			'illegal transition: "in-progress" → "done"',
		);

		// Without the flag, no audit entry is recorded.
		expect(getPlanClosureBypassCount()).toBe(0);
		guardSpy.mockRestore();
	});

	it('still rejects when the closure guard reports blockers (skipDfaForPlanClosure does NOT bypass q00001)', async () => {
		// Slice is done so the slice-completeness gate passes; the
		// closure guard is the only gate that can reject after that.
		await writeProposal(
			root,
			'in-progress',
			'q80003-blocked-plan.md',
			{
				id: 'q80003',
				status: 'in-progress',
				type: 'plan',
				kind: 'plan',
				'shipped-in': '[abcdef1]',
			},
			['## Slices', '', '### S1 — work', '- **Status**: done', ''].join(
				'\n',
			),
		);
		const guardSpy = vi
			.spyOn(planClosureGuardModule, 'runPlanClosureGuard')
			.mockResolvedValue({
				closable: false,
				blockerLines: [
					"  - [proposal/not-done] Proposal f09995 is 'in-progress'",
				],
				blockerCount: 1,
			});

		const result = await runProposalTransition(
			{
				id: 'q80003',
				to: 'done',
				reason: 'attempting with blocker present',
				skipDfaForPlanClosure: true,
			},
			options,
		);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(String(body.error.reason)).toContain(
			'plan q80003 is not closable',
		);
		// The audit entry is still recorded: the shortcut was requested,
		// the guard rejected, but the caller bypassed the DFA edge so
		// it MUST appear in the log.
		expect(getPlanClosureBypassCount()).toBe(1);
		guardSpy.mockRestore();
	});
});
