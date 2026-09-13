#!/usr/bin/env bun

/**
 * clone-hygiene.script.ts — configure the clone so it cannot accumulate
 * refs nobody owns.
 *
 * THE COMPLAINT this answers, in the user's words: *"las ramas siguen en
 * local, llenándose de ramas el local"*. Measured on this clone at the
 * time: ten remote-tracking refs for seven live branches. The three
 * extra ones were `delendai/pr/one-mutation-receipt`,
 * `delendai/pr/test-what-changed` and a Dependabot branch — all three
 * already DELETED on the forge. The forge was tidy. The clone was not,
 * because `git fetch` without `--prune` keeps a remote-tracking ref
 * forever after the branch it mirrors is gone.
 *
 * WHY config and not a cleanup command. A cleanup command already
 * exists (`bun run sync:workspace`) and it does prune — nobody ran it.
 * That is the whole lesson of this working model: a rule that depends on
 * somebody remembering is a rule that holds until the first busy day,
 * and a swarm has no un-busy days. `fetch.prune` makes EVERY fetch
 * prune, by any agent, any tool, any human, forever, including the
 * fetches that happen inside other commands.
 *
 * WHY it is safe. `--local` scope: this repository only, nothing
 * global, nothing in a shell profile. Pruning a remote-tracking ref
 * deletes no commits and no local branch — it removes this clone's
 * stale mirror of a branch the forge has already deleted. Work that
 * exists only locally is untouched, which is precisely the distinction
 * `reclaim-local` was built around.
 *
 * Runs from `prepare`, so a fresh clone is correct before its first
 * fetch rather than after somebody notices.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { ICloneSetting } from './clone-hygiene.interface';

const ROOT = resolve(__dirname, '../../..');

/**
 * Each setting carries the failure it prevents. A config line with no
 * stated reason is one nobody dares remove later.
 */
export const CLONE_SETTINGS: readonly ICloneSetting[] = [
	{
		key: 'fetch.prune',
		value: 'true',
		because:
			'a remote-tracking ref outlives the branch it mirrors, and the clone fills up with branches the forge deleted days ago',
	},
	{
		key: 'fetch.pruneTags',
		value: 'false',
		because:
			'tags are releases; a deleted tag is a decision somebody made and must not be mirrored automatically',
	},
];

/**
 * Decide what to change. Pure: the caller does the reading and writing,
 * so the decision is testable without a git repository.
 */
export const settingsToApply = (
	settings: readonly ICloneSetting[],
	current: (key: string) => string | undefined,
): readonly ICloneSetting[] =>
	settings.filter((setting) => current(setting.key) !== setting.value);

const read = (key: string): string | undefined => {
	try {
		return execFileSync('git', ['config', '--local', '--get', key], {
			cwd: ROOT,
			encoding: 'utf8',
		}).trim();
	} catch {
		return undefined;
	}
};

const main = (): number => {
	if (!existsSync(join(ROOT, '.git'))) {
		console.log('clone-hygiene: no .git directory found, skipping.');
		return 0;
	}
	const pending = settingsToApply(CLONE_SETTINGS, read);
	if (pending.length === 0) {
		console.log('clone-hygiene: clone already configured ✓');
		return 0;
	}
	for (const setting of pending) {
		execFileSync('git', ['config', '--local', setting.key, setting.value], {
			cwd: ROOT,
		});
		console.log(
			`clone-hygiene: set ${setting.key}=${setting.value} — ${setting.because}`,
		);
	}
	return 0;
};

if (import.meta.main) {
	process.exit(main());
}
