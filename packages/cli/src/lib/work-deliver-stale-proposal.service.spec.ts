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
	const gitOf = (tracked: string[]) => {
		const ran: string[][] = [];
		const git = (args: readonly string[]) => {
			ran.push([...args]);
			return {
				ok: true,
				out: args[0] === 'ls-files' ? tracked.join('\n') : '',
			} as ReturnType<Parameters<typeof dropStaleProposalCopies>[0]>;
		};
		return { git, ran };
	};

	it('[<20ms] removes and commits the stale copy', () => {
		const { git, ran } = gitOf([
			`${base}/ready/x1-a.md`,
			`${base}/review/x1-a.md`,
		]);
		expect(dropStaleProposalCopies(git)).toEqual([`${base}/ready/x1-a.md`]);
		expect(ran.map((args) => args[0])).toEqual([
			'ls-files',
			'rm',
			'commit',
		]);
	});

	it('[<20ms] runs no write when there is no stale copy', () => {
		const { git, ran } = gitOf([`${base}/review/x1-a.md`]);
		expect(dropStaleProposalCopies(git)).toEqual([]);
		expect(ran.map((args) => args[0])).toEqual(['ls-files']);
	});
});
