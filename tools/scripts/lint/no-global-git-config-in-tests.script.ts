#!/usr/bin/env bun
/**
 * no-global-git-config-in-tests.script.ts
 *
 * A test may not write to the developer's machine.
 *
 * `git config --global ...` writes to `~/.gitconfig`. A fixture in
 * `plugins/commit-policy` did exactly that, and it caused two failures
 * on this repo:
 *
 *   - parallel test files raced for the config lock, and one died with
 *     `could not lock config file /home/<user>/.gitconfig: File exists`
 *     — a whole validate run red for a reason unrelated to any change;
 *   - far worse, the machine's real git identity was silently replaced
 *     with the fixture's `cartago@example.com`, and commits made outside
 *     commit-policy's explicit-author path were authored under it. Five
 *     commits in this repo's history carry that address.
 *
 * A fixture that genuinely needs a global config — `identity: { mode:
 * 'global' }` is a real behaviour to test — must point
 * `GIT_CONFIG_GLOBAL` at a file in its own temp directory. That gives it
 * the config it needs, isolates parallel runs, and leaves the machine
 * alone. See `plugins/commit-policy/tests/src/e2e/_fixtures/dogfood-repo.ts`.
 *
 * So `--global` is allowed here, but only in a file that also sets
 * `GIT_CONFIG_GLOBAL`.
 */
import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../..');

const GLOBAL_FLAG = /['"`]--global['"`]|\bgit\s+config\s+--global\b/u;
const REDIRECT = /GIT_CONFIG_GLOBAL/u;

interface IViolation {
	readonly file: string;
	readonly line: number;
	readonly text: string;
}

const collectTestFiles = async (dir: string): Promise<string[]> => {
	const out: string[] = [];
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === 'dist') {
				continue;
			}
			out.push(...(await collectTestFiles(full)));
		} else if (entry.name.endsWith('.ts')) {
			out.push(full);
		}
	}
	return out;
};

const testRoots = async (): Promise<string[]> => {
	const roots: string[] = [];
	for (const group of ['plugins', 'packages']) {
		for (const entry of await readdir(join(ROOT, group), {
			withFileTypes: true,
		}).catch(() => [])) {
			if (entry.isDirectory()) {
				roots.push(join(ROOT, group, entry.name, 'tests'));
			}
		}
	}
	return roots;
};

export const findGlobalGitConfigWrites = async (): Promise<
	readonly IViolation[]
> => {
	const violations: IViolation[] = [];
	for (const root of await testRoots()) {
		for (const file of await collectTestFiles(root)) {
			const content = await readFile(file, 'utf8').catch(() => '');
			// A file that redirects GIT_CONFIG_GLOBAL has done the right
			// thing; its `--global` writes land in its own temp dir.
			if (REDIRECT.test(content)) continue;
			content.split('\n').forEach((line, index) => {
				if (!GLOBAL_FLAG.test(line)) return;
				violations.push({
					file: relative(ROOT, file),
					line: index + 1,
					text: line.trim(),
				});
			});
		}
	}
	return violations;
};

const main = async (): Promise<number> => {
	const violations = await findGlobalGitConfigWrites();
	if (violations.length === 0) {
		console.log(
			'✓ no-global-git-config-in-tests: no test writes the machine-wide git config.',
		);
		return 0;
	}
	console.log(
		`✖ no-global-git-config-in-tests: ${violations.length} test write(s) to the machine-wide git config:`,
	);
	for (const violation of violations) {
		console.log(`  ${violation.file}:${violation.line}  ${violation.text}`);
	}
	console.log(
		'\n  `git config --global` writes to ~/.gitconfig — it races other test files for',
	);
	console.log(
		"  the config lock and silently replaces the developer's real git identity.",
	);
	console.log(
		"  Point GIT_CONFIG_GLOBAL at a file in the fixture's own temp directory instead",
	);
	console.log(
		'  (see plugins/commit-policy/tests/src/e2e/_fixtures/dogfood-repo.ts).',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
