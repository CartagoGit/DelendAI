#!/usr/bin/env bun
/**
 * pre-commit.ts — staged-file formatter (Biome, prettier-like).
 *
 * Runs as the `format-staged` lefthook pre-commit command (see
 * `lefthook.yml`; it used to be a raw `.git/hooks/pre-commit` that
 * clobbered lefthook's hook). For every staged file supported by
 * Biome, runs `biome format --write` and re-stages the formatted
 * bytes back into the index so the commit always lands canonical
 * formatting (indent, quotes, trailing commas, line endings).
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
import { spawnSync } from 'node:child_process';

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

const diff = spawnSync(
	'git',
	['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
	{ encoding: 'utf8' },
);
if (diff.status !== 0) {
	console.error(
		'pre-commit: failed to run git diff --cached. Proceeding without formatting.',
	);
	process.exit(0);
}
const stagedFilesStr = diff.stdout;

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
const format = spawnSync(
	'bun',
	[
		'x',
		'@biomejs/biome',
		'format',
		'--write',
		'--no-errors-on-unmatched',
		...formattable,
	],
	{ stdio: 'inherit' },
);
if (format.status !== 0) {
	biomeFailed = true;
	console.warn(
		'pre-commit: Biome reported an error on at least one file. Proceeding with the commit; CI will re-check.',
	);
}

if (!biomeFailed) {
	// Re-stage the formatted bytes so the commit carries them.
	const add = spawnSync('git', ['add', '--', ...formattable], {
		stdio: 'ignore',
	});
	if (add.status !== 0) {
		console.warn(
			'pre-commit: failed to re-stage formatted files. Continuing — the commit may carry unformatted bytes.',
		);
	}
}

process.exit(0);
