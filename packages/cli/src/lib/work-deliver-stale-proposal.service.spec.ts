import { describe, expect, it } from 'vitest';
import {
	dropStaleProposalCopies,
	staleProposalCopies,
} from './work-deliver-stale-proposal.service';

const base = 'docs/delendai/proposals';

describe('staleProposalCopies', () => {
	it('[<20ms] names the earlier folder of a file held in two', () => {
		expect(
			staleProposalCopies([
				`${base}/ready/fixes/x01123-a.md`,
				`${base}/review/fixes/x01123-a.md`,
				`${base}/ready/fixes/x9-b.md`,
			]),
		).toEqual([`${base}/ready/fixes/x01123-a.md`]);
	});

	it('[<20ms] names nothing for a tie or for a single copy', () => {
		expect(
			staleProposalCopies([
				`${base}/ready/a/x1-a.md`,
				`${base}/ready/b/x1-a.md`,
				`${base}/done/x2-a.md`,
			]),
		).toEqual([]);
	});
});

describe('dropStaleProposalCopies', () => {
	const stale = `${base}/ready/x1-a.md`;
	const kept = `${base}/review/x1-a.md`;
	/** blobs: spec -> id; a spec absent from it does not resolve. */
	const gitOf = (blobs: Record<string, string>, tracked = [stale, kept]) => {
		const ran: string[][] = [];
		const git = (args: readonly string[]) => {
			ran.push([...args]);
			const out =
				args[0] === 'ls-files'
					? tracked.join('\n')
					: args[0] === 'merge-base'
						? 'base'
						: args[0] === 'rev-parse'
							? (blobs[args[args.length - 1] ?? ''] ?? '')
							: '';
			const ok = args[0] !== 'rev-parse' || out !== '';
			return { ok, out } as ReturnType<
				Parameters<typeof dropStaleProposalCopies>[0]
			>;
		};
		return { git, ran };
	};
	const verbs = (ran: string[][]) => ran.map((args) => args[0]);

	it('[<20ms] removes and commits a copy unchanged since the merge-base', () => {
		const { git, ran } = gitOf({
			[`HEAD:${stale}`]: 'a',
			[`HEAD:${kept}`]: 'b',
			[`base:${stale}`]: 'a',
		});
		expect(dropStaleProposalCopies(git)).toEqual({ dropped: [stale] });
		expect(verbs(ran)).toContain('commit');
	});

	it('[<20ms] removes a copy that equals the kept one', () => {
		const { git } = gitOf({
			[`HEAD:${stale}`]: 'a',
			[`HEAD:${kept}`]: 'a',
		});
		expect(dropStaleProposalCopies(git).dropped).toEqual([stale]);
	});

	it('[<20ms] removes nothing and names both paths when the stale copy holds edits', () => {
		const { git, ran } = gitOf({
			[`HEAD:${stale}`]: 'edited',
			[`HEAD:${kept}`]: 'b',
			[`base:${stale}`]: 'a',
		});
		const outcome = dropStaleProposalCopies(git);
		expect(outcome.dropped).toEqual([]);
		expect(outcome.refusal).toContain(
			`carry the edits of ${stale} into ${kept}, then deliver again`,
		);
		expect(verbs(ran)).not.toContain('rm');
		expect(verbs(ran)).not.toContain('commit');
	});

	it('[<20ms] runs no write when there is no stale copy', () => {
		const { git, ran } = gitOf({}, [kept]);
		expect(dropStaleProposalCopies(git)).toEqual({ dropped: [] });
		expect(verbs(ran)).toEqual(['ls-files']);
	});
});
