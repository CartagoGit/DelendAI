/**
 * stale-build.service.ts — a built CLI does not apply rules older than
 * the checkout it runs in.
 *
 * A swarm of reviewers ran `packages/cli/dist/index.js` built hours before
 * the guards that were written for that very run merged: every refusal
 * added that day reached nobody, and agents in one repository applied
 * different versions of the rules. A build inside its own source checkout
 * can tell: the sources carry a commit newer than the build.
 *
 * Only that case is judged. An installed package has no sources beside
 * it, so it is never stale by this measure.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { IStaleBuild } from '../contracts/interfaces/stale-build.interface';

/** The built entry, relative to the repository it was built in. */
const BUILT_ENTRY = '/packages/cli/dist/index.js';

/** The source entry that carries the current rules. */
const SOURCE_ENTRY = 'packages/cli/src/index.ts';

/** What the build is made from; a commit there is newer rules. */
const BUILT_FROM: readonly string[] = ['packages', 'plugins'];

const MS_PER_SECOND = 1_000;

/**
 * Commands a stale build still answers: git hooks run `guard` and must
 * never be blocked by a build's age, and the rest only read.
 */
const ANSWERED_WHEN_STALE: ReadonlySet<string> = new Set([
	'guard',
	'doctor',
	'status',
	'overview',
	'help',
	'version',
	'--help',
	'-h',
	'--version',
	'-v',
]);

const modifiedMs = (path: string): number | undefined => {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return undefined;
	}
};

const newestSourceCommitMs = (root: string): number | undefined => {
	try {
		const seconds = execFileSync(
			'git',
			['log', '-1', '--format=%ct', '--', ...BUILT_FROM],
			{
				cwd: root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
			},
		).trim();
		return seconds.length === 0
			? undefined
			: Number(seconds) * MS_PER_SECOND;
	} catch {
		return undefined;
	}
};

/**
 * The build's age against its sources, or `undefined` when the entry is
 * not a build inside its own source checkout, or is not behind.
 */
export const staleBuildOf = (
	entryPath: string,
	probe: {
		readonly exists: (path: string) => boolean;
		readonly modifiedMs: (path: string) => number | undefined;
		readonly newestSourceCommitMs: (root: string) => number | undefined;
	} = { exists: existsSync, modifiedMs, newestSourceCommitMs },
): IStaleBuild | undefined => {
	const entry = entryPath.replaceAll('\\', '/');
	if (!entry.endsWith(BUILT_ENTRY)) return undefined;
	const root = entry.slice(0, -BUILT_ENTRY.length);
	const sourceEntry = join(root, SOURCE_ENTRY);
	if (!probe.exists(sourceEntry) || !probe.exists(join(root, '.git'))) {
		return undefined;
	}
	const builtAt = probe.modifiedMs(entry);
	const sourcesAt = probe.newestSourceCommitMs(root);
	if (builtAt === undefined || sourcesAt === undefined) return undefined;
	return sourcesAt > builtAt
		? { root, sourceEntry, builtAt, sourcesAt }
		: undefined;
};

/** Whether a stale build may still answer this command. */
export const answeredWhenStale = (command: string | undefined): boolean =>
	command === undefined || ANSWERED_WHEN_STALE.has(command);

/** What an agent running a stale build is told. */
export const describeStaleBuild = (
	stale: IStaleBuild,
	argv: readonly string[],
): string =>
	`this delendai was built ${new Date(stale.builtAt).toISOString()} and its sources changed ${new Date(stale.sourcesAt).toISOString()}: it would apply older rules than the checkout it runs in. Run \`bun ${stale.sourceEntry} ${argv.join(' ')}\`, or rebuild with \`bun run build\` in ${stale.root}.`;
