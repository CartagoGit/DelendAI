import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';
import { repairDevelopRed } from '@delendai/core/lib/integration/land/land-repair.helper';
import type {
	ILandCheck,
	ILandForge,
	ILandPullRequest,
} from '@delendai/core/lib/integration/land/land.interface';
import type {
	ILandCiRun,
	ILandRevertBuild,
} from '@delendai/core/lib/integration/land/land-revert.interface';

const scene = (input: {
	runs: ILandCiRun[];
	tip?: string;
	build?: ILandRevertBuild;
}) => {
	const opened: string[] = [];
	const pushed: string[] = [];
	const labels: [number, string][] = [];
	const forge = fakePartial<ILandForge>({
		integrationTip: () => Promise.resolve(input.tip ?? 'r'),
		checks: () =>
			Promise.resolve<ILandCheck[]>([
				{ name: 'zone-a', conclusion: 'failure' },
				{ name: 'lint', conclusion: 'success' },
			]),
		openPullRequests: () =>
			Promise.resolve(
				opened.map(
					(head, i): ILandPullRequest => ({
						number: 900 + i,
						headRef: head,
						headSha: 's',
						draft: false,
						state: 'open',
						merged: false,
						labels: [],
						body: '',
						testedBase: 't',
					}),
				),
			),
		openPullRequest: ({ head }) => {
			opened.push(head);
			return Promise.resolve(899 + opened.length);
		},
		addLabel: (n, l) => {
			labels.push([n, l]);
			return Promise.resolve();
		},
		pullRequest: (n) =>
			Promise.resolve<ILandPullRequest>({
				number: n,
				headRef: 'h',
				headSha: 's',
				draft: false,
				state: 'closed',
				merged: true,
				labels: [],
				body: '',
				testedBase: 't',
			}),
		comments: () => Promise.resolve([]),
		comment: () => Promise.resolve(),
	});
	return {
		opened,
		pushed,
		labels,
		ports: {
			forge,
			git: {
				revertMerge: ({ ref }: { ref: string }) => {
					const built = input.build ?? { kind: 'built', sha: 'x' };
					if (built.kind === 'built') pushed.push(ref);
					return built;
				},
			},
			recentRuns: () => Promise.resolve(input.runs),
			sectionOfCheck: (name: string) =>
				name === 'zone-a' ? 'a' : undefined,
			repairPrefix: 'p/repair/',
			note: () => undefined,
			develop: {
				mergesBetween: () =>
					Promise.resolve([
						{ number: 4, sha: 'm4' },
						{ number: 5, sha: 'm5' },
					]),
				footprintOf: (merge: { number: number }) =>
					Promise.resolve({
						files: new Set([`f${String(merge.number)}`]),
						zones: new Set(merge.number === 5 ? ['a'] : ['b']),
					}),
				recordKnownFailing: () => Promise.resolve(),
			},
		},
	};
};

const RED: ILandCiRun[] = [
	{ commit: 'r', conclusion: 'failure' },
	{ commit: 'g', conclusion: 'success' },
];

describe('repairDevelopRed', () => {
	it('[<50ms] reverts the culprit of a red tip once, labelled as a repair', async () => {
		const { ports, opened, labels } = scene({ runs: RED });
		const out = await repairDevelopRed(ports);
		expect(out).toEqual({ kind: 'opened', number: 900 });
		expect(opened).toEqual(['p/repair/revert-5']);
		expect(labels).toContainEqual([900, 'delendai:repair']);
		expect(labels).toContainEqual([5, 'delendai:needs-update']);
	});

	it('[<50ms] run twice, opens no second revert', async () => {
		const { ports, opened } = scene({ runs: RED });
		await repairDevelopRed(ports);
		const again = await repairDevelopRed(ports);
		expect(again.kind).toBe('exists');
		expect(opened).toHaveLength(1);
	});

	it('[<50ms] does nothing when the latest run is green, stale, or has no green baseline', async () => {
		const green = scene({ runs: [{ commit: 'r', conclusion: 'success' }] });
		expect((await repairDevelopRed(green.ports)).kind).toBe('nothing');
		const stale = scene({ runs: RED, tip: 'later' });
		expect((await repairDevelopRed(stale.ports)).kind).toBe('nothing');
		const none = scene({ runs: [RED[0] as ILandCiRun] });
		expect((await repairDevelopRed(none.ports)).kind).toBe('nothing');
		expect(
			green.opened.length + stale.opened.length + none.opened.length,
		).toBe(0);
	});

	it('[<50ms] reports a conflicting revert as needing a person and pushes nothing', async () => {
		const { ports, pushed, opened } = scene({
			runs: RED,
			build: { kind: 'conflict' },
		});
		expect((await repairDevelopRed(ports)).kind).toBe('needs-person');
		expect(pushed).toHaveLength(0);
		expect(opened).toHaveLength(0);
	});
});
