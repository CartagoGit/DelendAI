#!/usr/bin/env bun
/**
 * pre-commit.ts — staged-file formatter (Biome, prettier-like).
 *
 * Runs as a real Git `pre-commit` hook (installed by
 * `tools/scripts/install-formatter-hook.script.ts`). For every staged
 * file supported by Biome, runs `biome format --write` and re-stages
 * the formatted bytes back into the index so the commit always lands
 * canonical formatting (indent, quotes, trailing commas, line endings).
 *
 * POLICY: this hook NEVER blocks a commit. If Biome fails on a file
 * it prints the diagnostic and proceeds (Biome's CI mode runs in
 * `bun run lint` and `bun run validate`, which are the actual
 * quality gates). Bypass with `git commit --no-verify`.
 *
 * History: x00088 relaxed the previous "agent-claim guard" policy
 * (x00080). Claims are now advisory only — see
 * `bun run lint:agent-claims` and `docs/mcp-vertex/AGENT-BOOTSTRAP.md`.
 */
import { execSync } from 'node:child_process';

const BIOME_EXTENSIONS = [
	'ts',
	'tsx',
	'js',
	'jsx',
	'mjs',
	'cjs',
	'json',
	'jsonc',
	'css',
	'scss',
	'html',
	'astro',
	'md',
	'mdx',
	'vue',
	'svelte',
	'yaml',
	'yml',
	'toml',
] as const;

const isBiomeSupported = (path: string): boolean => {
	const lastDot = path.lastIndexOf('.');
	if (lastDot === -1) return false;
	const ext = path.slice(lastDot + 1).toLowerCase();
	return (BIOME_EXTENSIONS as readonly string[]).includes(ext);
};

let stagedFilesStr = '';
try {
	stagedFilesStr = execSync(
		'git diff --cached --name-only --diff-filter=ACMR',
		{ encoding: 'utf8' },
	);
} catch {
	console.error(
		'pre-commit: failed to run git diff --cached. Proceeding without formatting.',
	);
	process.exit(0);
}

const stagedFiles = stagedFilesStr
	.split('\n')
	.map((f) => f.trim())
	.filter(Boolean);

const formattable = stagedFiles.filter(isBiomeSupported);

if (formattable.length === 0) {
	process.exit(0);
}

console.log(
	`pre-commit: formatting ${formattable.length} staged file${
		formattable.length === 1 ? '' : 's'
	} with Biome…`,
);

let biomeFailed = false;
try {
	execSync(
		[
			'bun',
			'x',
			'@biomejs/biome',
			'format',
			'--write',
			'--no-errors-on-unmatched',
			...formattable,
		].join(' '),
		{ stdio: 'inherit' },
	);
} catch {
	biomeFailed = true;
	console.warn(
		'pre-commit: Biome reported an error on at least one file. Proceeding with the commit; CI will re-check.',
	);
}

if (!biomeFailed) {
	// Re-stage the formatted bytes so the commit carries them.
	try {
		execSync('git add --', formattable, { stdio: 'ignore' });
	} catch (e) {
		console.warn(
			'pre-commit: failed to re-stage formatted files. Continuing — the commit may carry unformatted bytes.',
			e instanceof Error ? e.message : '',
		);
	}
}

process.exit(0);