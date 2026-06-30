#!/usr/bin/env bun
/**
 * install-formatter-hook.script.ts — install the staged-file
 * Biome formatter as a real `.git/hooks/pre-commit` (x00088).
 *
 * This replaces the old "claim guard" installer (x00080). The hook
 * NEVER blocks a commit; its only job is to run `biome format --write`
 * on staged files and re-stage them, so every commit lands canonical
 * formatting regardless of whether the author ran the formatter.
 *
 * The installer ALSO defensively removes any legacy claim-guard
 * `pre-push` (x00080) left over in `.git/hooks/`. x00088 retired the
 * push-time claim check; if it is left in place, `git push` will
 * reject pushes with `pre-push: blocked — '...' is claimed by ...`.
 *
 * Bypass: `git commit --no-verify` skips the hook entirely.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	chmodSync,
	unlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const GIT_DIR = join(ROOT, '.git');

if (!existsSync(GIT_DIR)) {
	console.log(
		'install-formatter-hook: No .git directory found. Skipping hook installation.',
	);
	process.exit(0);
}

const HOOKS_DIR = join(GIT_DIR, 'hooks');
if (!existsSync(HOOKS_DIR)) {
	mkdirSync(HOOKS_DIR, { recursive: true });
}

const sourceHook = join(ROOT, 'tools/scripts/hooks/pre-commit.ts');
const targetHook = join(HOOKS_DIR, 'pre-commit');

if (!existsSync(sourceHook)) {
	console.error(
		`install-formatter-hook: source not found at ${sourceHook}. Skipping.`,
	);
	process.exit(0);
}

try {
	copyFileSync(sourceHook, targetHook);
	chmodSync(targetHook, 0o755);
	console.log('install-formatter-hook: Installed pre-commit formatter hook.');
} catch (e) {
	console.error('install-formatter-hook: Failed to install hook:', e);
}

// Defensive cleanup: remove any x00080-era claim-guard pre-push hook
// still sitting in `.git/hooks/`. x00088 retired it; if present, it
// blocks pushes with a confusing claim-ownership error.
const legacyHooks = [
	join(HOOKS_DIR, 'pre-push'),
	join(HOOKS_DIR, 'pre-push.old'),
];
for (const legacy of legacyHooks) {
	if (existsSync(legacy)) {
		try {
			unlinkSync(legacy);
			console.log(
				`install-formatter-hook: Removed legacy claim-guard hook at ${legacy}.`,
			);
		} catch (e) {
			console.error(
				`install-formatter-hook: Failed to remove ${legacy}:`,
				e,
			);
		}
	}
}
