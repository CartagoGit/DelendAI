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
 * Bypass: `git commit --no-verify` skips the hook entirely.
 */
import { copyFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
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