/**
 * candidate-footprint.ts — what a range of commits touches, read with the
 * same planner that decides which test zones a pull request runs (f00755).
 */
import { execFileSync } from 'node:child_process';

import { gitDiffChanges } from '../ci/affected.script';
import { zoneReach } from '../ci/test-zones.script';
import type { IChangeFootprint } from './independent-candidates.interface';

/**
 * Whether `from...to` adds a file that existed nowhere before: an added
 * path whose name no deleted path carries. A document moved between two
 * folders is added and deleted under one name, and creates nothing.
 */
const createsFiles = (root: string, from: string, to: string): boolean => {
	const nameOf = (path: string): string => path.split('/').at(-1) ?? path;
	const lines = execFileSync(
		'git',
		['diff', '--name-status', '--no-renames', `${from}...${to}`],
		{ cwd: root, encoding: 'utf8' },
	)
		.split('\n')
		.map((line) => line.split('\t'))
		.filter((parts) => parts.length >= 2);
	const deleted = new Set(
		lines
			.filter(([status]) => status === 'D')
			.map(([, path = '']) => nameOf(path)),
	);
	return lines.some(
		([status, path = '']) => status === 'A' && !deleted.has(nameOf(path)),
	);
};

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
	const reach = zoneReach({ base: from, head: to, rootDir: root });
	return reach === undefined
		? { zones: 'everything', files }
		: {
				zones: reach.zones,
				files,
				readOnly: reach.readOnly,
				creates: createsFiles(root, from, to),
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
