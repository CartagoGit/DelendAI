/**
 * candidate-footprint.ts — what a range of commits touches, read with the
 * same planner that decides which test zones a pull request runs (f00755).
 */
import { execFileSync } from 'node:child_process';

import { gitDiffChanges } from '../ci/affected.script';
import { reachableZones } from '../ci/test-zones.script';
import type { IChangeFootprint } from './independent-candidates.interface';

/** The zones and files `from...to` changes, in the checkout at `root`. */
export const footprintBetween = (
	root: string,
	from: string,
	to: string,
): IChangeFootprint => {
	const files = new Set(
		gitDiffChanges(from, to, root).map((change) => change.path),
	);
	if (files.size === 0) return { zones: new Set(), files };
	return {
		zones:
			reachableZones({ base: from, head: to, rootDir: root }) ??
			'everything',
		files,
	};
};

/** Where `a` and `b` last shared history, or `undefined`. */
export const mergeBaseOf = (
	root: string,
	a: string,
	b: string,
): string | undefined => {
	try {
		return execFileSync('git', ['merge-base', a, b], {
			cwd: root,
			encoding: 'utf8',
		}).trim();
	} catch {
		return undefined;
	}
};
