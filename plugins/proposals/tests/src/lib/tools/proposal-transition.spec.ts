/**
 * proposal-transition.spec.ts — x00529 S1.
 *
 * A transition must be a MOVE: the source and the destination must
 * never both exist afterwards. The 2026-09-08 audit found eleven ids
 * living in two status folders at once — in every pair the advanced
 * copy carried `shipped-in` / `closed-at` / `last-transition-*` and the
 * other was a pre-transition snapshot — because the transition wrote
 * the destination without removing the source, then aborted AFTER
 * rewriting the source frontmatter.
 *
 * These specs pin the resolution rules:
 *   - same id at the destination  → keep the copy further along
 *     `ready < in-progress < review < done`, delete the other;
 *   - different id at the destination → still a loud failure;
 *   - not comparable (parked status) → still a loud failure;
 *   - after any successful transition, exactly one file for that id.
 */
import {
	mkdir,
	mkdtemp,
	readdir,
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
} from '@delendai/proposals/lib/tools/proposal-transition.tool';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';

/** A fake git whose `mv` really moves, so a "successful" mv is observable. */
const FAKE_GIT_MV: IGitRunner = async (args) => {
	if (args[0] === 'mv') {
		const [, from, to] = args;
		if (from && to) await rename(from, to);
	}
	return { ok: true, output: '' };
};

const writeProposal = async (
	proposalsDirAbs: string,
	folder: string,
	filename: string,
	frontmatter: Record<string, string>,
): Promise<string> => {
	const dir = join(proposalsDirAbs, folder);
	await mkdir(dir, { recursive: true });
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	const abs = join(dir, filename);
	await writeFile(
		abs,
		`---\n${lines.join('\n')}\n---\n\n## Goal\n\nfixture\n`,
		'utf8',
	);
	return abs;
};

/** Every markdown file under the tree whose frontmatter claims `id`. */
const filesForId = async (
	proposalsDirAbs: string,
	id: string,
): Promise<readonly string[]> => {
	const entries = await readdir(proposalsDirAbs, { recursive: true });
	const found: string[] = [];
	for (const entry of entries) {
		const name = String(entry);
		if (!name.endsWith('.md')) continue;
		const text = await readFile(join(proposalsDirAbs, name), 'utf8');
		if (text.includes(`id: ${id}`)) found.push(name.split('\\').join('/'));
	}
	return found.sort();
};

interface IPayload {
	readonly ok?: boolean;
	readonly kind?: string;
	readonly movedTo?: string;
	readonly duplicateResolved?: string;
	readonly error?: { readonly message?: string };
}

const payloadOf = (result: { content: Array<{ text?: string }> }): IPayload =>
	JSON.parse(result.content[0]?.text ?? '{}') as IPayload;

describe('proposal_transition duplicate resolution (x00529 S1)', () => {
	let root = '';
	let options: IProposalTransitionToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'transition-x00529-'));
		options = {
			namespacePrefix: 'proposals',
			proposalsDirAbs: root,
			workspaceRoot: root,
			gitRunner: FAKE_GIT_MV,
			requirePeerReview: false,
		};
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('leaves exactly one file for the id after an ordinary transition', async () => {
		await writeProposal(root, 'ready', 'x00700-plain.md', {
			id: 'x00700',
			status: 'ready',
			kind: 'fix',
		});

		const result = await runProposalTransition(
			{
				id: 'x00700',
				to: 'in-progress',
				reason: 'claim slice',
			},
			options,
		);

		expect(payloadOf(result).ok).toBe(true);
		expect(await filesForId(root, 'x00700')).toEqual([
			'in-progress/x00700-plain.md',
		]);
	});

	it('resolves a same-id destination in favour of the incoming, more advanced copy', async () => {
		const source = await writeProposal(root, 'ready', 'x00701-dup.md', {
			id: 'x00701',
			status: 'ready',
			kind: 'fix',
		});
		// A stale snapshot squatting on the destination, still at `ready`.
		await writeProposal(root, 'in-progress', 'x00701-dup.md', {
			id: 'x00701',
			status: 'ready',
			kind: 'fix',
			note: 'stale-snapshot',
		});
		expect(await filesForId(root, 'x00701')).toHaveLength(2);

		const result = await runProposalTransition(
			{ id: 'x00701', to: 'in-progress', reason: 'claim slice' },
			options,
		);
		const payload = payloadOf(result);

		expect(payload.ok).toBe(true);
		expect(payload.duplicateResolved).toContain('duplicate resolved');
		// Exactly one file survives, and it is the transitioned one — the
		// stale snapshot (and its marker) is gone.
		const survivors = await filesForId(root, 'x00701');
		expect(survivors).toEqual(['in-progress/x00701-dup.md']);
		const text = await readFile(join(root, survivors[0] ?? ''), 'utf8');
		expect(text).toContain('status: in-progress');
		expect(text).not.toContain('stale-snapshot');
		expect(source).toContain('ready');
	});

	it('resolves a same-id destination in favour of the existing, more advanced copy', async () => {
		await writeProposal(root, 'ready', 'x00702-dup.md', {
			id: 'x00702',
			status: 'ready',
			kind: 'fix',
		});
		// The destination is already at `review` — strictly further along
		// than the `in-progress` this transition is asking for.
		await writeProposal(root, 'in-progress', 'x00702-dup.md', {
			id: 'x00702',
			status: 'review',
			kind: 'fix',
			'shipped-in': 'abc1234',
		});

		const result = await runProposalTransition(
			{ id: 'x00702', to: 'in-progress', reason: 'claim slice' },
			options,
		);
		const payload = payloadOf(result);

		expect(payload.ok).toBe(true);
		expect(payload.duplicateResolved).toContain('duplicate resolved');
		const survivors = await filesForId(root, 'x00702');
		expect(survivors).toEqual(['in-progress/x00702-dup.md']);
		// The advanced copy was kept untouched — its evidence survives.
		const text = await readFile(join(root, survivors[0] ?? ''), 'utf8');
		expect(text).toContain('shipped-in: abc1234');
		expect(text).toContain('status: review');
	});

	it('still fails loudly when the destination holds a DIFFERENT id', async () => {
		await writeProposal(root, 'ready', 'x00703-mine.md', {
			id: 'x00703',
			status: 'ready',
			kind: 'fix',
		});
		await writeProposal(root, 'in-progress', 'x00703-mine.md', {
			id: 'x00999',
			status: 'ready',
			kind: 'fix',
		});

		await expect(
			runProposalTransition(
				{ id: 'x00703', to: 'in-progress', reason: 'claim slice' },
				options,
			),
		).rejects.toThrow(/DIFFERENT proposal \(x00999\)/);
		// Neither file was deleted: a real collision is a human's call.
		expect(await filesForId(root, 'x00703')).toHaveLength(1);
		expect(await filesForId(root, 'x00999')).toHaveLength(1);
	});

	it('still fails loudly when the two copies are not comparable', async () => {
		await writeProposal(root, 'ready', 'x00704-parked.md', {
			id: 'x00704',
			status: 'ready',
			kind: 'fix',
		});
		// `paused` is a parked state, not a point on the forward path:
		// nothing can say which copy is "further along".
		await writeProposal(root, 'in-progress', 'x00704-parked.md', {
			id: 'x00704',
			status: 'paused',
			kind: 'fix',
		});

		await expect(
			runProposalTransition(
				{ id: 'x00704', to: 'in-progress', reason: 'claim slice' },
				options,
			),
		).rejects.toThrow(/not comparable/);
		// Both copies are left exactly as they were for a human to judge.
		expect(await filesForId(root, 'x00704')).toHaveLength(2);
	});

	it('repairs the crash window: destination written, source not yet removed', async () => {
		// Exactly the half-applied state the audit found: the destination
		// already carries the post-transition frontmatter while the source
		// is still sitting in the old folder. Two files, one id, and
		// nothing on disk to say which one to believe.
		await writeProposal(root, 'ready', 'x00705-crash.md', {
			id: 'x00705',
			status: 'ready',
			kind: 'fix',
		});
		await writeProposal(root, 'in-progress', 'x00705-crash.md', {
			id: 'x00705',
			status: 'in-progress',
			kind: 'fix',
			'last-transition-id': 'interrupted-run',
		});
		expect(await filesForId(root, 'x00705')).toHaveLength(2);

		// Re-running the interrupted transition repairs it rather than
		// adding a third truth or throwing.
		const result = await runProposalTransition(
			{ id: 'x00705', to: 'in-progress', reason: 'retry after crash' },
			options,
		);
		const payload = payloadOf(result);

		expect(payload.ok).toBe(true);
		expect(payload.duplicateResolved).toContain('x00705');
		const survivors = await filesForId(root, 'x00705');
		expect(survivors).toEqual(['in-progress/x00705-crash.md']);
		const text = await readFile(join(root, survivors[0] ?? ''), 'utf8');
		expect(text).toContain('status: in-progress');
		// The completed half of the interrupted run is what survived.
		expect(text).toContain('last-transition-id: interrupted-run');
	});

	it('does not strand an advanced snapshot in the old folder when the move fails', async () => {
		await writeProposal(root, 'ready', 'x00706-nogit.md', {
			id: 'x00706',
			status: 'ready',
			kind: 'fix',
		});
		// The destination FOLDER is occupied by a regular file, so the
		// move cannot be created at all — a failure that strikes after
		// the source frontmatter has already been rewritten.
		await writeFile(join(root, 'in-progress'), 'not a directory\n', 'utf8');

		await expect(
			runProposalTransition(
				{ id: 'x00706', to: 'in-progress', reason: 'claim slice' },
				options,
			),
		).rejects.toThrow();
		// The source is still readable AND still says `ready`: the failed
		// transition rolled its frontmatter back rather than leaving a
		// half-advanced snapshot behind for the next sweep to trip over.
		const text = await readFile(
			join(root, 'ready', 'x00706-nogit.md'),
			'utf8',
		);
		expect(text).toContain('status: ready');
		expect(text).not.toContain('status: in-progress');
	});
});
