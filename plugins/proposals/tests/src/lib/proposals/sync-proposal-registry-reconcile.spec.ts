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
	findDuplicateProposalIds,
	reconcileBlocked,
	reconcileCanonicalProposals,
	reconcileFolders,
	syncProposalRegistry,
} from '@delendai/proposals/lib/proposals/sync-proposal-registry';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';

// Real `git mv` moves the file; the fake must too (same reasoning as the
// proposal-transition.tool.spec.ts fake).
const FAKE_GIT_MV: IGitRunner = async (args) => {
	const [, from, to] = args;
	if (from && to) await rename(from, to);
	return { ok: true, output: '' };
};

const writeProposal = async (
	proposalsDirAbs: string,
	folder: string,
	filename: string,
	frontmatter: Record<string, string>,
	body = '## Goal\n\np.\n',
): Promise<void> => {
	const dir = folder === '' ? proposalsDirAbs : join(proposalsDirAbs, folder);
	await mkdir(dir, { recursive: true });
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	await writeFile(
		join(dir, filename),
		`---\n${lines.join('\n')}\n---\n\n${body}`,
		'utf8',
	);
};

describe('sync-proposal-registry reconciliation (f113 S5)', async () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'reconcile-'));
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	// x00050 S2 / sync_proposals filename-builder bug: a proposal whose
	// title already starts with `<id>:` (the consumer convention for
	// `fix` / `feat` / `chore` proposals — see `x00050`,
	// `x00039`, `x00040` on disk) used to produce
	// `x00050-x00050-ci-roja-bun-1-3-14-…md` because the slug already
	// contained the id and the builder prepended it again. The fix
	// strips the leading id from the title before slugifying, so the
	// on-disk filename carries the id exactly once. Coverage spans the
	// three prefix buckets a real consumer hits today (`x`, `c`, `f`).
	describe('reconcileCanonicalProposals filename duplication (x00050 S2)', async () => {
		it('strips the leading `<id>:` from an `x` (fix) proposal title', async () => {
			await writeProposal(root, '', 'x00050-stale-name.md', {
				id: 'x00050',
				kind: 'fix',
				status: 'ready',
				title: 'x00050: CI roja — Bun 1.3.14 no sabe leer el bun.lock v2',
			});
			const result = await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{
					id: 'x00050',
					from: 'x00050-stale-name.md',
					to: 'ready/fixes/x00050-ci-roja-bun-1-3-14-no-sabe-leer-el-bun-lock-v2.md',
				},
			]);
			await readFile(
				join(
					root,
					'ready',
					'fixes',
					'x00050-ci-roja-bun-1-3-14-no-sabe-leer-el-bun-lock-v2.md',
				),
				'utf8',
			);
		});

		it('strips the leading `<id>:` from a `c` (chore) proposal title', async () => {
			await writeProposal(root, '', 'c00006-stale.md', {
				id: 'c00006',
				kind: 'chore',
				status: 'ready',
				title: 'c00006: integration-verifier + validate-package con if-always',
			});
			const result = await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{
					id: 'c00006',
					from: 'c00006-stale.md',
					to: 'ready/chores/c00006-integration-verifier-validate-package-con-if-always.md',
				},
			]);
		});

		it('strips the leading `<id>:` from an `f` (feat) proposal title', async () => {
			await writeProposal(root, '', 'f00010-stale.md', {
				id: 'f00010',
				kind: 'feat',
				status: 'ready',
				title: 'f00010: a real audit feature title here',
			});
			const result = await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{
					id: 'f00010',
					from: 'f00010-stale.md',
					to: 'ready/feats/f00010-a-real-audit-feature-title-here.md',
				},
			]);
		});

		// A `r` (refactor) title goes through the same path; covering
		// it makes the regression test robust to a future refactor that
		// touches only one prefix by accident.
		it('strips the leading `<id>:` from an `r` (refactor) proposal title', async () => {
			await writeProposal(root, '', 'r00012-stale.md', {
				id: 'r00012',
				kind: 'refactor',
				status: 'ready',
				title: 'r00012: integration-verifier v2 — yaml real y header correcto',
			});
			const result = await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{
					id: 'r00012',
					from: 'r00012-stale.md',
					to: 'ready/refactors/r00012-integration-verifier-v2-yaml-real-y-header-correcto.md',
				},
			]);
		});

		// Same fix must apply to the legacy `<id> — ` (em-dash) form
		// that some proposals use (e.g. `x00039`).
		it('strips the leading `<id> — ` (em-dash) form too', async () => {
			await writeProposal(root, '', 'x00039-stale.md', {
				id: 'x00039',
				kind: 'fix',
				status: 'ready',
				title: 'x00039 — flat-hybrid pierde endpoints en groupByService',
			});
			const result = await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			const movedTo = result.moved[0]?.to ?? '';
			expect(movedTo).toBe(
				'ready/fixes/x00039-flat-hybrid-pierde-endpoints-en-groupbyservice.md',
			);
			expect(movedTo).not.toContain('x00039-x00039');
		});

		// Guards: titles that DO NOT start with the id are untouched
		// (the strip helper is a no-op when the leading id does not
		// match the proposal's own id — otherwise it would silently
		// strip the wrong substring from cross-referencing titles).
		it('does not strip a leading id that does not match the proposal id', async () => {
			await writeProposal(root, '', 'x00050-stale.md', {
				id: 'x00050',
				kind: 'fix',
				status: 'ready',
				title: 'x00039 references x00037 S4 (cross-cutting title)',
			});
			const result = await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			expect(result.moved[0]?.to).toBe(
				'ready/fixes/x00050-x00039-references-x00037-s4-cross-cutting-title.md',
			);
		});

		it('is idempotent: a file already with the canonical filename is left alone', async () => {
			await writeProposal(
				root,
				'ready/fixes',
				'x00050-ci-roja-bun-1-3-14.md',
				{
					id: 'x00050',
					kind: 'fix',
					status: 'ready',
					title: 'x00050: CI roja — Bun 1.3.14',
				},
			);
			const result = await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([]);
			expect(result.errors).toEqual([]);
		});
	});

	// x00050 S2 / sync_proposals frontmatter preservation contract:
	// `sync_proposals` only MOVES files (`git mv` or `rename`) and must
	// NEVER write content. The transition tool owns the frontmatter
	// rewrite (`setFrontmatterStatus` + `setFrontmatterMetadataField`
	// in `proposal-frontmatter-writer.ts`); the sync engine is on the
	// hook for one thing only — keep the on-disk tree consistent with
	// the frontmatter `status` (folder) and `id`+`title` (filename).
	// These specs pin that contract so a future refactor of
	// `moveFile` cannot silently start writing content.
	describe('frontmatter preservation through syncProposalRegistry (x00050 S2)', async () => {
		const writeRichProposal = async (
			folder: string,
			filename: string,
			fm: Record<string, string>,
		): Promise<void> => {
			await writeProposal(root, folder, filename, fm);
		};

		it('preserves shipped-in through a folder move', async () => {
			// A proposal sitting in the wrong status folder (e.g. a
			// misfiled `ready/` for a proposal whose status is `done`)
			// triggers `reconcileFolders` → `moveFile`. The fixture puts
			// a `done` proposal under `ready/` so the move fires.
			await writeRichProposal('ready', 'f91000-shipped.md', {
				id: 'f91000',
				kind: 'feat',
				status: 'done',
				'shipped-in': '[30551533]',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			const movedEntry = result.proposals.find((p) => p.id === 'f91000');
			expect(movedEntry?.file).toBe('done/feats/f91000-shipped.md');
			const moved = await readFile(
				join(root, movedEntry?.file ?? ''),
				'utf8',
			);
			expect(moved).toContain('shipped-in: [30551533]');
		});

		it('preserves shipped-in, last-transition-id, last-correlation-id and last-idempotency-key through a filename+folder rename', async () => {
			await writeRichProposal('', 'x00051-stale.md', {
				id: 'x00051',
				kind: 'fix',
				status: 'done',
				title: 'x00051: a fixed thing',
				'shipped-in': '[9043822, 1234567]',
				'last-transition-id': 'abc-123',
				'last-correlation-id': 'xyz-456',
				'last-idempotency-key': 'idem-789',
				'last-transition-from': 'review',
			});
			await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			const moved = await readFile(
				join(root, 'done', 'fixes', 'x00051-a-fixed-thing.md'),
				'utf8',
			);
			expect(moved).toContain('shipped-in: [9043822, 1234567]');
			expect(moved).toContain('last-transition-id: abc-123');
			expect(moved).toContain('last-correlation-id: xyz-456');
			expect(moved).toContain('last-idempotency-key: idem-789');
			expect(moved).toContain('last-transition-from: review');
		});

		it('preserves an arbitrary custom frontmatter field through a rename', async () => {
			await writeRichProposal('', 'x00052-stale.md', {
				id: 'x00052',
				kind: 'fix',
				status: 'ready',
				title: 'x00052: another fix',
				'custom-host-field': 'must-survive-sync',
				'evidence-commit': 'a1b2c3d',
			});
			await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			const moved = await readFile(
				join(root, 'ready', 'fixes', 'x00052-another-fix.md'),
				'utf8',
			);
			expect(moved).toContain('custom-host-field: must-survive-sync');
			expect(moved).toContain('evidence-commit: a1b2c3d');
		});

		it('does not write the file when the proposal is already in the canonical folder+filename (idempotent path)', async () => {
			// Seed a tree where every file is already canonical
			// (`<prefix><5d>-<slug>.md` in `<status>/<kind>/`). The sync
			// must be a no-op on the filesystem — no content write, no
			// rename, no `git mv`. We assert byte-equality of the on-disk
			// content before/after and the persistence of every
			// frontmatter field, so a future refactor of `moveFile` that
			// silently starts writing content (or that re-derives the
			// filename from the title and re-renames an "idempotent"
			// file) is caught here.
			await writeRichProposal('ready/fixes', 'x00053-already-fine.md', {
				id: 'x00053',
				kind: 'fix',
				status: 'ready',
				title: 'x00053: already fine',
				'shipped-in': '[9999999]',
				'last-transition-id': 'txn-keep',
				'last-correlation-id': 'corr-keep',
			});
			const before = await readFile(
				join(root, 'ready', 'fixes', 'x00053-already-fine.md'),
				'utf8',
			);
			await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			const after = await readFile(
				join(root, 'ready', 'fixes', 'x00053-already-fine.md'),
				'utf8',
			);
			expect(after).toBe(before);
			expect(after).toContain('shipped-in: [9999999]');
			expect(after).toContain('last-transition-id: txn-keep');
			expect(after).toContain('last-correlation-id: corr-keep');
		});
	});

	describe('reconcileFolders', async () => {
		it('normalizes a non-canonical name and places it under the configured kind folder', async () => {
			await writeProposal(root, '', 'x7-old-name.md', {
				id: 'x7',
				kind: 'fix',
				status: 'ready',
				title: 'Close the broken path',
			});
			const result = await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{
					id: 'x7',
					from: 'x7-old-name.md',
					to: 'ready/fixes/x00007-close-the-broken-path.md',
				},
			]);
			await readFile(
				join(root, 'ready', 'fixes', 'x00007-close-the-broken-path.md'),
				'utf8',
			);
		});

		it('is idempotent and reports collisions without overwriting the target', async () => {
			await writeProposal(
				root,
				'',
				'a8-old-name.md',
				{
					id: 'a8',
					kind: 'audit',
					status: 'ready',
					title: 'Same audit',
				},
				'original\n',
			);
			await writeProposal(
				root,
				'ready/audits',
				'a00008-same-audit.md',
				{
					id: 'a00008',
					kind: 'audit',
					status: 'ready',
					title: 'Same audit',
				},
				'target\n',
			);
			const result = await reconcileCanonicalProposals(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([]);
			expect(result.errors[0]).toContain(
				'canonical proposal collision for a8',
			);
			expect(
				await readFile(
					join(root, 'ready', 'audits', 'a00008-same-audit.md'),
					'utf8',
				),
			).toContain('target');
		});

		it('moves a new-system file whose folder disagrees with its status', async () => {
			await writeProposal(root, 'blocked', 'f300-misfiled.md', {
				id: 'f300',
				status: 'ready',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{ id: 'f300', from: 'blocked', to: 'ready/feats' },
			]);
			const moved = await readFile(
				join(root, 'ready', 'feats', 'f300-misfiled.md'),
				'utf8',
			);
			expect(moved).toContain('status: ready');
		});

		it('is idempotent: a file already correctly placed is left alone', async () => {
			await writeProposal(root, 'ready/feats', 'f301-fine.md', {
				id: 'f301',
				status: 'ready',
			});
			const first = await reconcileFolders(root, FAKE_GIT_MV);
			const second = await reconcileFolders(root, FAKE_GIT_MV);
			expect(first.moved).toEqual([]);
			expect(second.moved).toEqual([]);
		});

		it('never touches a legacy (old 8-status union) proposal', async () => {
			await writeProposal(root, '', 'p050-legacy.md', {
				id: 'p050',
				status: 'pending',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([]);
			// still at the root, untouched
			await readFile(join(root, 'p050-legacy.md'), 'utf8');
		});

		// Regression: `status` alone isn't a safe signal — `ready` is the
		// *default* status create_proposal writes for ANY new proposal
		// regardless of kind (authoring.tool.ts: `status: ${args.status ??
		// 'ready'}`). Without also gating on the filename prefix, a brand
		// new legacy-style proposal (id `p5`, `l100`, …) created via the
		// existing, heavily-used create_proposal tool would get silently
		// relocated into `ready/` the moment syncProposalRegistry next ran
		// — caught by authoring.spec.ts's "p5-meta.md stays exactly where
		// it was written" assertion.
		it('never touches a legacy-prefixed file even when its status happens to be a glossary status (ready)', async () => {
			await writeProposal(root, '', 'p005-newly-created.md', {
				id: 'p005',
				status: 'ready',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([]);
			await readFile(join(root, 'p005-newly-created.md'), 'utf8');
		});

		// f00042: closing a proposal lands the file at `done/<kind>/`,
		// not at `done/` itself. The reconciler must move a misfiled
		// `done/<file>.md` (status: done) into its kind's sub-folder.
		it('moves a done/ feat proposal into done/feats/', async () => {
			await writeProposal(root, 'done', 'f600-misfiled.md', {
				id: 'f600',
				kind: 'feat',
				status: 'done',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{ id: 'f600', from: 'done', to: 'done/feats' },
			]);
			const moved = await readFile(
				join(root, 'done', 'feats', 'f600-misfiled.md'),
				'utf8',
			);
			expect(moved).toContain('status: done');
		});

		it('moves a done/ fix proposal into done/fixes/', async () => {
			await writeProposal(root, 'done', 'x601-misfiled.md', {
				id: 'x601',
				kind: 'fix',
				status: 'done',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{ id: 'x601', from: 'done', to: 'done/fixes' },
			]);
			await readFile(
				join(root, 'done', 'fixes', 'x601-misfiled.md'),
				'utf8',
			);
		});

		it('moves a done/ refactor proposal into done/refactors/', async () => {
			await writeProposal(root, 'done', 'r602-misfiled.md', {
				id: 'r602',
				kind: 'refactor',
				status: 'done',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{ id: 'r602', from: 'done', to: 'done/refactors' },
			]);
			await readFile(
				join(root, 'done', 'refactors', 'r602-misfiled.md'),
				'utf8',
			);
		});

		it('moves a done/ plan proposal into done/plans/', async () => {
			await writeProposal(root, 'done', 'q603-misfiled.md', {
				id: 'q603',
				kind: 'plan',
				status: 'done',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{ id: 'q603', from: 'done', to: 'done/plans' },
			]);
			await readFile(
				join(root, 'done', 'plans', 'q603-misfiled.md'),
				'utf8',
			);
		});

		it('keeps a legacy (l<NNN>) proposal at done/ when kind: legacy', async () => {
			await writeProposal(root, 'done', 'l604-legacy.md', {
				id: 'l604',
				kind: 'legacy',
				status: 'done',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			// `legacy` has no sub-folder, so the file stays where it was.
			expect(result.moved).toEqual([]);
			await readFile(join(root, 'done', 'l604-legacy.md'), 'utf8');
		});

		it('is idempotent: a done/<kind>/ proposal is left in place', async () => {
			await writeProposal(root, 'done/feats', 'f605-already-fine.md', {
				id: 'f605',
				kind: 'feat',
				status: 'done',
			});
			const first = await reconcileFolders(root, FAKE_GIT_MV);
			const second = await reconcileFolders(root, FAKE_GIT_MV);
			expect(first.moved).toEqual([]);
			expect(second.moved).toEqual([]);
		});
	});

	describe('reconcileBlocked', async () => {
		it('resolves blocked -> ready when the dependency is done', async () => {
			await writeProposal(root, 'done', 'f400-dep.md', {
				id: 'f400',
				status: 'done',
			});
			await writeProposal(root, 'blocked', 'f401-waiting.md', {
				id: 'f401',
				status: 'blocked',
				blocked_by: '[f400]',
			});
			const result = await reconcileBlocked(root, FAKE_GIT_MV);
			expect(result.resolved).toEqual([{ id: 'f401' }]);
			const moved = await readFile(
				join(root, 'ready', 'feats', 'f401-waiting.md'),
				'utf8',
			);
			expect(moved).toContain('status: ready');
		});

		it('resolves blocked -> ready when the dependency is in review', async () => {
			await writeProposal(root, 'review', 'f404-dep.md', {
				id: 'f404',
				status: 'review',
			});
			await writeProposal(root, 'blocked', 'f405-waiting.md', {
				id: 'f405',
				status: 'blocked',
				blocked_by: '[f404]',
			});
			const result = await reconcileBlocked(root, FAKE_GIT_MV);
			expect(result.resolved).toEqual([{ id: 'f405' }]);
			const moved = await readFile(
				join(root, 'ready', 'feats', 'f405-waiting.md'),
				'utf8',
			);
			expect(moved).toContain('status: ready');
		});

		it('stays blocked when the dependency is not done', async () => {
			await writeProposal(root, 'ready', 'f402-dep.md', {
				id: 'f402',
				status: 'ready',
			});
			await writeProposal(root, 'blocked', 'f403-waiting.md', {
				id: 'f403',
				status: 'blocked',
				blocked_by: '[f402]',
			});
			const result = await reconcileBlocked(root, FAKE_GIT_MV);
			expect(result.resolved).toEqual([]);
		});

		it('resolves a self-block once the scaffold linter passes', async () => {
			const validBody = [
				'## Goal',
				'',
				'p.',
				'',
				'## Why',
				'',
				'p.',
				'',
				'## Non-goals',
				'',
				'- x',
				'',
				'## Slices',
				'',
				'### S1 — Do the thing',
				'- **Status**: pending',
				'- **Files**: [`a.ts`]',
				'- **Command**: `bun run test`',
				'- **Expect**: exit0',
				'',
				'## Acceptance',
				'',
				'- [ ] done.',
				'',
			].join('\n');
			await writeProposal(
				root,
				'blocked',
				'f00404-self-blocked.md',
				{
					id: 'f00404',
					kind: 'feat',
					title: 'A sufficiently long title',
					status: 'blocked',
					date: '2026-06-20',
					track: 'proposals',
					blocked_by: '[self:goal-missing]',
				},
				validBody,
			);
			const result = await reconcileBlocked(root, FAKE_GIT_MV);
			expect(result.resolved).toEqual([{ id: 'f00404' }]);
		});
	});

	describe('findDuplicateProposalIds (a00069 S3)', async () => {
		it('reports twin files that share a frontmatter id', async () => {
			await writeProposal(root, 'ready', 'f00900-twin.md', {
				id: 'f00900',
				status: 'ready',
			});
			await writeProposal(root, 'done/feats', 'f00900-twin.md', {
				id: 'f00900',
				status: 'done',
			});
			const dups = await findDuplicateProposalIds(root);
			expect(dups).toEqual([
				{
					id: 'f00900',
					paths: [
						'done/feats/f00900-twin.md',
						'ready/f00900-twin.md',
					],
				},
			]);
		});

		// x00157-adjacent finding (2026-07-28 live repro): a `.md` with NO
		// frontmatter block at all (README.md, a session summary, etc.)
		// used to fall back to its filename as the "id" — so multiple
		// frontmatter-less README.md files under different folders all
		// collided on id "README.md". Confirmed live against the real
		// `docs/delendai/proposals` tree (5 README.md files, one false
		// "duplicate" report) before this fix.
		it('does not treat multiple frontmatter-less README.md files as duplicate ids', async () => {
			for (const folder of ['done', 'done/audits', 'legacy/closed']) {
				const dir = join(root, folder);
				await mkdir(dir, { recursive: true });
				await writeFile(
					join(dir, 'README.md'),
					'# Just an index page, no frontmatter\n',
					'utf8',
				);
			}
			const dups = await findDuplicateProposalIds(root);
			expect(dups).toEqual([]);
		});

		it('surfaces duplicate ids in syncProposalRegistry errors', async () => {
			await writeProposal(root, 'ready', 'f00901-twin.md', {
				id: 'f00901',
				status: 'ready',
				track: 'proposals',
				date: '2026-07-25',
			});
			await writeProposal(root, 'done/feats', 'f00901-twin.md', {
				id: 'f00901',
				status: 'done',
				track: 'proposals',
				date: '2026-07-25',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			expect(
				result.errors.some((e) =>
					e.includes('duplicate proposal id "f00901"'),
				),
			).toBe(true);
		});
	});

	describe('syncProposalRegistry integration', async () => {
		it('discovers a new-system proposal living in ready/', async () => {
			await writeProposal(root, 'ready', 'f00500-discoverable.md', {
				id: 'f00500',
				status: 'ready',
				track: 'proposals',
				date: '2026-06-20',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			expect(result.proposals.some((p) => p.id === 'f00500')).toBe(true);
		});

		it('reconciles a misfiled proposal before building the index (no duplicate entries)', async () => {
			await writeProposal(root, 'blocked', 'f501-misfiled.md', {
				id: 'f501',
				status: 'ready',
				track: 'proposals',
				date: '2026-06-20',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			const matches = result.proposals.filter((p) => p.id === 'f501');
			expect(matches).toHaveLength(1);
			expect(matches[0]?.file).toBe('ready/feats/f00501-misfiled.md');
		});

		// n007 (resume kind): proposals living in kind sub-folders inside
		// `done/` (`done/resumes/`, `done/audits/`, `done/feats/`,
		// `done/fixes/`) must show up in the index exactly once, never
		// duplicated by `done/` itself or any other subtree. Before n007,
		// syncProposalRegistry only listed top-level status folders, so
		// `done/resumes/*.md` were invisible to the registry — the linter
		// walked them, but `proposal_board` / `auto_work` couldn't see
		// them. The fix: add explicit sub-tree entries for the 4 known
		// kind buckets under `done/` so each is scanned once and only once.
		it('discovers a proposal in done/resumes/ exactly once (n007 resume kind)', async () => {
			await writeProposal(root, 'done/resumes', 'n001-handoff.md', {
				id: 'n001',
				kind: 'resume',
				status: 'done',
				track: 'general',
				date: '2026-06-21',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			const matches = result.proposals.filter((p) => p.id === 'n001');
			expect(matches).toHaveLength(1);
			expect(matches[0]?.file).toBe('done/resumes/n00001-handoff.md');
			expect(matches[0]?.status).toBe('done');
		});

		it('discovers all 4 f119 kind sub-folders under done/ exactly once', async () => {
			await writeProposal(root, 'done/audits', 'a900-test.md', {
				id: 'a900',
				status: 'done',
				track: 'audit',
				date: '2026-06-21',
			});
			await writeProposal(root, 'done/feats', 'f901-test.md', {
				id: 'f901',
				status: 'done',
				track: 'proposals',
				date: '2026-06-21',
			});
			await writeProposal(root, 'done/fixes', 'x901-test.md', {
				id: 'x901',
				status: 'done',
				track: 'proposals',
				date: '2026-06-21',
			});
			await writeProposal(root, 'done/resumes', 'n902-test.md', {
				id: 'n902',
				status: 'done',
				track: 'general',
				date: '2026-06-21',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			for (const id of ['a900', 'f901', 'x901', 'n902']) {
				const matches = result.proposals.filter((p) => p.id === id);
				expect(matches, `${id} must appear exactly once`).toHaveLength(
					1,
				);
			}
		});
	});
});
