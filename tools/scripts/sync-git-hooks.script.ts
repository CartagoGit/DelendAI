#!/usr/bin/env bun
/**
 * sync-git-hooks.script.ts — pre-`lefthook install` hygiene.
 *
 * Lefthook owns every git hook in this repo (`lefthook.yml` carries the
 * staged-file Biome formatter, the drift checks, and the push/commit
 * discipline). This script runs BEFORE `lefthook install` (see the
 * `prepare` script) and removes the legacy raw hooks that two retired
 * installers left behind, because `lefthook install` refuses to run
 * when it finds a foreign hook AND a stale `<hook>.old` backup:
 *
 *   - x00088-era `pre-commit` / `pre-commit.old`: the raw Biome
 *     formatter hook (previously installed by
 *     `install-formatter-hook.script.ts`, now a lefthook command). It
 *     silently clobbered lefthook's pre-commit, disabling every
 *     pre-commit check in `lefthook.yml`.
 *   - x00080-era `pre-push` / `pre-push.old`: the retired claim-guard,
 *     which blocked pushes with a confusing claim-ownership error.
 *
 * Only hooks whose content matches a known legacy signature are
 * removed; unknown user hooks are left alone (lefthook preserves them
 * as `<hook>.old` on install).
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const GIT_DIR = join(ROOT, '.git');

if (!existsSync(GIT_DIR)) {
	console.log('sync-git-hooks: no .git directory found, skipping.');
	process.exit(0);
}

const HOOKS_DIR = join(GIT_DIR, 'hooks');

/** Content markers that identify a hook we are allowed to delete. */
const LEGACY_SIGNATURES = [
	'staged-file formatter', // x00088 raw Biome formatter pre-commit
	'install-formatter-hook', // same installer, older docstring
	'claim-guard', // x00080 claim guard pre-push
	'is claimed by', // x00080 claim guard blocker message
] as const;

const isLegacyHook = (path: string): boolean => {
	try {
		const content = readFileSync(path, 'utf8');
		return LEGACY_SIGNATURES.some((signature) =>
			content.includes(signature),
		);
	} catch {
		return false;
	}
};

const CANDIDATES = [
	'pre-commit',
	'pre-commit.old',
	'pre-push',
	'pre-push.old',
] as const;

for (const name of CANDIDATES) {
	const path = join(HOOKS_DIR, name);
	if (!existsSync(path)) continue;
	if (!isLegacyHook(path)) continue;
	try {
		unlinkSync(path);
		console.log(`sync-git-hooks: removed legacy hook ${name}.`);
	} catch (e) {
		console.error(`sync-git-hooks: failed to remove ${name}:`, e);
	}
}
