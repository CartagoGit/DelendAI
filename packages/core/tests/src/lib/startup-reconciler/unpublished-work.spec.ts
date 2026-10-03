/**
 * unpublished-work.spec.ts — x00551.
 *
 * Starting the server deleted a local work branch carrying five commits.
 * The fetch phase mirrored the work namespace onto LOCAL refs of the same
 * name inside a pruned fetch, and `--prune` removes every ref in a
 * mirrored namespace the remote does not have — which is precisely what a
 * unit of work nobody has published yet looks like.
 *
 * Against a real bare origin and two clones, because the claim is about
 * what `git fetch --prune` does to refs.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { runFetchPhase } from '@delendai/core/lib/startup-reconciler/phases/fetch-refs';

import { testPolicy } from './fakes';
import {
	createStartupOrigin,
	INTEGRATION_BRANCH,
	type IStartupOrigin,
} from './startup-workspace';

const POLICY = testPolicy();
const WORK_PREFIX = POLICY.branches.workRefPrefix;
const PUBLICATION_PREFIX = POLICY.branches.publicationRefPrefix;
const workRef = (name: string): string => `refs/${WORK_PREFIX}${name}`;

let origin: IStartupOrigin | undefined;
afterEach(() => {
	origin?.cleanup();
	origin = undefined;
});

describe('the fetch phase and refs nobody published', () => {
	it('leaves a local work branch alone, and still mirrors what the remote has', async () => {
		origin = createStartupOrigin();
		// Another machine publishes a work ref.
		const laptop = origin.clone('laptop');
		const published = laptop.git('rev-parse', 'HEAD').trim();
		laptop.git('update-ref', workRef('laptop/x1-S1-g1'), published);
		laptop.push(
			`${workRef('laptop/x1-S1-g1')}:${workRef('laptop/x1-S1-g1')}`,
		);

		// This machine has its own, unpublished.
		const office = origin.clone('office');
		office.write('src/mine.ts', 'export const mine = 1;\n');
		office.git('add', '-A');
		office.git(
			'commit',
			'--quiet',
			'--no-verify',
			'-m',
			'work in progress',
		);
		const mine = office.git('rev-parse', 'HEAD').trim();
		office.git('update-ref', workRef('office/x2-S1-g1'), mine);
		office.git('reset', '--quiet', '--hard', 'HEAD~1');

		const result = await runFetchPhase({
			git: office.seam,
			integrationBranch: INTEGRATION_BRANCH,
			workRefPrefix: WORK_PREFIX,
			publicationRefPrefix: PUBLICATION_PREFIX,
		});

		// The unpublished work is untouched...
		expect(office.git('rev-parse', workRef('office/x2-S1-g1')).trim()).toBe(
			mine,
		);
		// ...and the other machine's ref was observed, under its own name.
		const observed = result.refs.map((ref) => ref.name);
		expect(observed).toContain(workRef('laptop/x1-S1-g1'));
		expect(observed).toContain(workRef('office/x2-S1-g1'));
	});

	it('stops observing a work ref once the remote drops it', async () => {
		origin = createStartupOrigin();
		const laptop = origin.clone('laptop-drop');
		const published = laptop.git('rev-parse', 'HEAD').trim();
		laptop.git('update-ref', workRef('laptop/x3-S1-g1'), published);
		laptop.push(
			`${workRef('laptop/x3-S1-g1')}:${workRef('laptop/x3-S1-g1')}`,
		);

		const office = origin.clone('office-drop');
		const first = await runFetchPhase({
			git: office.seam,
			integrationBranch: INTEGRATION_BRANCH,
			workRefPrefix: WORK_PREFIX,
			publicationRefPrefix: PUBLICATION_PREFIX,
		});
		expect(first.refs.map((ref) => ref.name)).toContain(
			workRef('laptop/x3-S1-g1'),
		);

		laptop.git(
			'push',
			'--quiet',
			'origin',
			`:${workRef('laptop/x3-S1-g1')}`,
		);
		const second = await runFetchPhase({
			git: office.seam,
			integrationBranch: INTEGRATION_BRANCH,
			workRefPrefix: WORK_PREFIX,
			publicationRefPrefix: PUBLICATION_PREFIX,
		});
		expect(second.refs.map((ref) => ref.name)).not.toContain(
			workRef('laptop/x3-S1-g1'),
		);
	});
});
