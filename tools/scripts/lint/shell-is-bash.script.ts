#!/usr/bin/env bun
/**
 * shell-is-bash.script.ts — gate for AGENT-BOOTSTRAP §6.
 *
 * The bootstrap states the rule for every host and every runner: code
 * that shells out uses `bash`, never `sh` or `zsh`. The reasons are
 * concrete, not stylistic — `sh` is `dash` on Debian/Ubuntu/WSL, `ash`
 * on Alpine and an old `bash` on macOS, so the same command silently
 * means different things per machine; and `zsh` runs the user's init
 * files, where p10k's instant prompt opens the alternate screen buffer
 * and breaks wrappers that read stdout.
 *
 * The rule was prose only, and it had already drifted once:
 * `quality-policy`'s settlement runner shelled the whole `validate`
 * command through `sh -c`. This gate is what keeps the rule true.
 *
 * Scope: first-party source that runs in production — `packages/`,
 * `plugins/`, `apps/`, `tools/scripts/`. Specs are scanned too: a test
 * that asserts `sh` would lock in the behaviour this forbids.
 *
 * Usage:
 *   bun tools/scripts/lint/shell-is-bash.script.ts
 *   bun tools/scripts/lint/shell-is-bash.script.ts --root <dir>
 */
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const SCAN_ROOTS: readonly string[] = [
	'packages',
	'plugins',
	'apps',
	'tools/scripts',
];

const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'coverage',
	'.cache',
	'.git',
]);

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

/**
 * A spawn of `sh` or `zsh` as the command itself.
 *
 * Anchored on the CALL, not on the string: `'sh'` on its own is
 * ordinary data in this repo — a language id in the search engine's
 * extension table, a framework name in the rules presets — and a gate
 * that flagged those would be noise nobody reads. What is forbidden is
 * handing that string to a process spawn.
 */
const FORBIDDEN_SHELL =
	/\b(exec|execSync|execFile|execFileSync|execFileAsync|spawn|spawnSync)\s*\(\s*(['"`])(\/bin\/)?(sh|zsh)\2/gu;

/** `shell: 'sh'` / `shell: "/bin/zsh"` in a spawn options object. */
const FORBIDDEN_SHELL_OPTION = /shell\s*:\s*(['"`])(\/bin\/)?(sh|zsh)\1/gu;

export interface IShellViolation {
	readonly relPath: string;
	readonly line: number;
	readonly snippet: string;
}

const walk = async (dir: string, out: string[]): Promise<void> => {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			await walk(abs, out);
			continue;
		}
		const dot = entry.name.lastIndexOf('.');
		if (dot === -1) continue;
		if (SCAN_EXTENSIONS.has(entry.name.slice(dot))) out.push(abs);
	}
};

/** Pure: given file contents, the offending lines. */
export const findShellViolations = (
	relPath: string,
	contents: string,
): readonly IShellViolation[] => {
	const violations: IShellViolation[] = [];
	const lines = contents.split('\n');
	for (const [index, line] of lines.entries()) {
		// A line that names the rule (a comment, this gate's own
		// patterns) is documentation, not a spawn.
		const trimmed = line.trim();
		if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
		FORBIDDEN_SHELL.lastIndex = 0;
		FORBIDDEN_SHELL_OPTION.lastIndex = 0;
		if (FORBIDDEN_SHELL.test(line) || FORBIDDEN_SHELL_OPTION.test(line)) {
			violations.push({
				relPath,
				line: index + 1,
				snippet: trimmed,
			});
		}
	}
	return violations;
};

export const scanForShellViolations = async (
	root: string,
): Promise<readonly IShellViolation[]> => {
	const files: string[] = [];
	for (const scanRoot of SCAN_ROOTS) {
		await walk(join(root, scanRoot), files);
	}
	const found: IShellViolation[] = [];
	for (const abs of files) {
		const rel = relative(root, abs).split('\\').join('/');
		if (rel.includes('shell-is-bash')) continue; // this gate's own patterns
		found.push(...findShellViolations(rel, await readFile(abs, 'utf8')));
	}
	return found.sort((left, right) =>
		left.relPath === right.relPath
			? left.line - right.line
			: left.relPath.localeCompare(right.relPath),
	);
};

const main = async (argv: readonly string[]): Promise<number> => {
	const rootFlag = argv.indexOf('--root');
	const root =
		rootFlag === -1 ? process.cwd() : (argv[rootFlag + 1] ?? process.cwd());
	const violations = await scanForShellViolations(root);
	if (violations.length === 0) {
		process.stdout.write('✓ shell-is-bash: every shell-out uses bash.\n');
		return 0;
	}
	process.stderr.write(
		`✖ shell-is-bash: ${violations.length.toString()} shell-out(s) use sh or zsh instead of bash:\n`,
	);
	for (const violation of violations) {
		process.stderr.write(
			`  ${violation.relPath}:${violation.line.toString()}  ${violation.snippet}\n`,
		);
	}
	process.stderr.write(
		'\n  AGENT-BOOTSTRAP §6: `sh` is dash on Debian/Ubuntu/WSL, ash on Alpine\n' +
			'  and an old bash on macOS, so the same command means different things\n' +
			'  per machine. `zsh` runs the user init files. Use `bash -c`.\n',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
