import {
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runProposalTransition,
	type IProposalTransitionToolOptions,
} from '@mcp-vertex/proposals/lib/tools/proposal-transition.tool';
import {
	PROPOSAL_STATUS_TRANSITIONS,
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
} from '@mcp-vertex/proposals/lib/contracts/constants/proposal-glossary.constant';
import type { IGitRunner } from '@mcp-vertex/proposals/lib/shared/git-runner';

// A real `git mv` actually moves the file; the fake must too, or the tool's
// post-move read (and every assertion on the new path) would silently pass
// for the wrong reason (a no-op "success").
const FAKE_GIT_MV: IGitRunner = async (args) => {
	const [, from, to] = args;
	if (from && to) await rename(from, to);
	return { ok: true, output: '' };
};
const FAKE_GIT_FAIL: IGitRunner = async () => ({
	ok: false,
	output: '',
	reason: 'not a git repository',
});

const writeProposal = async (
	proposalsDirAbs: string,
	folder: string,
	filename: string,
	frontmatter: Record<string, string>,
): Promise<void> => {
	const dir = join(proposalsDirAbs, folder);
	await mkdir(dir, { recursive: true });
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	const raw = `---\n${lines.join('\n')}\n---\n\n## Goal\n\np.\n`;
	await writeFile(join(dir, filename), raw, 'utf8');
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
		};
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('requires a non-empty reason', async () => {
		const result = await runProposalTransition(
			{ id: 'f00014', to: 'in-progress', reason: '' },
			options,
		);
		expect(result.isError).toBe(true);
	});

	it('rejects an unknown target status', async () => {
		const result = await runProposalTransition(
			{ id: 'f00014', to: 'bogus', reason: 'because' },
			options,
		);
		expect(result.isError).toBe(true);
	});

	it('returns an error when the id is not found', async () => {
		const result = await runProposalTransition(
			{ id: 'f999', to: 'in-progress', reason: 'because' },
			options,
		);
		expect(result.isError).toBe(true);
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
		expect(result.isError).toBe(true);
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
		if (result.isError === true) {
			process.stderr.write(`\n\nDEBUG: ${result.content?.[0]?.text}\n\n`);
		}
		expect(result.isError).toBeUndefined();
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
				await writeProposal(root, folder, filename, {
					id: `f200${from}${to}`.replace(/[^a-z0-9]/g, ''),
					status: from,
				});
				const result = await runProposalTransition(
					{
						id: `f200${from}${to}`.replace(/[^a-z0-9]/g, ''),
						to,
						reason: 'matrix test',
					},
					options,
				);
				if (legal) {
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
				});
				const result = await runProposalTransition(
					{ id, to: 'done', reason: 'shipping' },
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

		it('falls back to `done/` (no sub-folder) when kind is missing', async () => {
			await writeProposal(root, 'review', 'f70001-no-kind.md', {
				id: 'f70001',
				status: 'review',
			});
			const result = await runProposalTransition(
				{ id: 'f70001', to: 'done', reason: 'no kind declared' },
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
			});
			const result = await runProposalTransition(
				{ id: 'l70002', to: 'done', reason: 'legacy' },
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
});
