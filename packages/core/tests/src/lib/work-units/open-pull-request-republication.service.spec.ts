/**
 * open-pull-request-republication.service.spec.ts — publishing again
 * updates the open pull request of the same agent, proposal and slice
 * (x01085). The policy's choice and the forge are injected: no process.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	resolvePublicationTarget,
	unitPublicationPattern,
} from '@delendai/core/lib/work-units/open-pull-request-republication.service';
import type { IPublicationTargetRequest } from '@delendai/core/lib/contracts/interfaces/publication-target.interface';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const AGENT = 'claude-sonnet-5-5';
const OWN = `delendai/pr/implement/${AGENT}/x01079-all/work`;
const OLDER = `delendai/pr/create/${AGENT}/x01079-all-G2/proposal-readiness-lint`;
const TIP = 'a'.repeat(40);

const request: IPublicationTargetRequest = {
	root: '/repo',
	policy,
	remote: 'origin',
	agent: AGENT,
	proposal: 'x01079',
	slice: 'all',
	generation: 1,
	kind: 'implement',
	base: 'b'.repeat(40),
	workRef: `refs/heads/delendai/wip/implement/${AGENT}/x01079-all/work`,
};

const chooseOwn = () => ({
	unit: 'slice' as const,
	publicationRef: `refs/heads/${OWN}`,
	reason: 'alone',
});

interface IOpen {
	readonly number: number;
	readonly headRefName: string;
	readonly headRefOid: string;
}

const run = (input: {
	readonly open: readonly IOpen[] | 'unreadable';
	readonly ancestor?: boolean;
}) => {
	const calls: string[][] = [];
	const target = resolvePublicationTarget(
		request,
		{
			git: (args) => {
				calls.push([...args]);
				if (args[0] === 'rev-parse') return TIP;
				if (args[0] === 'merge-base') {
					return input.ancestor === false ? undefined : '';
				}
				return '';
			},
			gh: () =>
				input.open === 'unreadable'
					? undefined
					: JSON.stringify(input.open),
		},
		chooseOwn,
	);
	return { target, calls };
};

const notesOf = (
	target: ReturnType<typeof resolvePublicationTarget>,
): readonly string[] => ('notes' in target ? target.notes : []);

const openOlder = (headRefName = OLDER, number = 2311): readonly IOpen[] => [
	{ number, headRefName, headRefOid: 'c'.repeat(40) },
];

describe('resolvePublicationTarget', () => {
	it('[<20ms] updates the open pull request whose head the work contains', () => {
		const { target } = run({ open: openOlder() });
		expect(target).toMatchObject({
			publicationRef: `refs/heads/${OLDER}`,
			pullRequestNumber: 2311,
			notes: [],
		});
	});

	it('[<20ms] publishes to its own branch and names the older pull request when histories diverged', () => {
		const { target } = run({ open: openOlder(), ancestor: false });
		expect(target).toMatchObject({ publicationRef: `refs/heads/${OWN}` });
		const notes = notesOf(target);
		expect(notes).toHaveLength(1);
		expect(notes[0]).toContain('#2311');
		expect(notes[0]).toContain('superseded');
	});

	it("[<20ms] ignores another agent's open pull request without a word", () => {
		const { target } = run({
			open: openOlder('delendai/pr/create/gpt-6/x01079-all-G2/work'),
		});
		expect(target).toMatchObject({
			publicationRef: `refs/heads/${OWN}`,
			notes: [],
		});
	});

	it('[<20ms] ignores an open pull request of another slice', () => {
		const { target } = run({
			open: openOlder(`delendai/pr/create/${AGENT}/x01079-S2-G2/work`),
		});
		expect(target).toMatchObject({ notes: [] });
	});

	it('[<20ms] publishes to its own branch and says the check was skipped when the forge cannot be read', () => {
		const { target } = run({ open: 'unreadable' });
		expect(target).toMatchObject({ publicationRef: `refs/heads/${OWN}` });
		expect(notesOf(target)).toEqual([expect.stringContaining('skipped')]);
	});

	it("[<20ms] keeps the policy's choice when no pull request is open", () => {
		const { target } = run({ open: [] });
		expect(target).toEqual({ ...chooseOwn(), notes: [] });
	});

	it('[<20ms] updates the newest contained pull request and names the others', () => {
		const { target } = run({
			open: [
				...openOlder(OLDER, 2311),
				...openOlder(
					`delendai/pr/create/${AGENT}/x01079-all-G3/other`,
					2400,
				),
			],
		});
		expect(target).toMatchObject({ pullRequestNumber: 2400 });
		expect(notesOf(target)).toEqual([expect.stringContaining('#2311')]);
	});

	it('[<20ms] fetches a head the clone lacks before judging it', () => {
		const calls: string[][] = [];
		let fetched = false;
		resolvePublicationTarget(
			request,
			{
				git: (args) => {
					calls.push([...args]);
					if (args[0] === 'fetch') fetched = true;
					if (args[0] === 'cat-file') return fetched ? '' : undefined;
					return args[0] === 'rev-parse' ? TIP : '';
				},
				gh: () => JSON.stringify(openOlder()),
			},
			chooseOwn,
		);
		expect(calls.map((call) => call[0])).toContain('fetch');
	});

	it("[<20ms] keeps the policy's choice when the project does not land by pull request", () => {
		const direct = resolveDevelopmentPolicy({
			development: { profile: 'shared-checkout-merge' },
		});
		const target = resolvePublicationTarget(
			{ ...request, policy: direct },
			{ git: () => '', gh: () => '[]' },
			chooseOwn,
		);
		expect(target).toEqual({ ...chooseOwn(), notes: [] });
	});

	it("[<20ms] keeps the policy's choice when the work ref resolves to no commit", () => {
		const target = resolvePublicationTarget(
			request,
			{ git: () => undefined, gh: () => '[]' },
			chooseOwn,
		);
		expect(target).toEqual({ ...chooseOwn(), notes: [] });
	});

	it.each(['not json', '{"number":1}'])(
		'[<20ms] says the check was skipped when the forge answers %s',
		(answer) => {
			const { target } = {
				target: resolvePublicationTarget(
					request,
					{ git: () => TIP, gh: () => answer },
					chooseOwn,
				),
			};
			expect(notesOf(target)).toEqual([
				expect.stringContaining('skipped'),
			]);
		},
	);

	it('[<20ms] has no pattern for a project whose work has no work ref', () => {
		const direct = resolveDevelopmentPolicy({
			development: { profile: 'shared-direct' },
		});
		expect(
			unitPublicationPattern(direct, {
				agent: AGENT,
				proposal: 'x01079',
			}),
		).toBe(undefined);
	});

	it('[<20ms] passes a refusal through', () => {
		const refusal = { refusal: 'not under the prefix' };
		expect(
			resolvePublicationTarget(
				request,
				{ git: () => '', gh: () => '' },
				() => refusal,
			),
		).toBe(refusal);
	});
});
