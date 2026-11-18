/**
 * job-reach.helper.ts — which check jobs a change reaches through their own
 * code, and which paths it adds or removes.
 *
 * A lint's verdict depends on what it reads and on the code that reads it.
 * What it reads is declared per job in `job-scope.constant.ts`. Its code is
 * the scripts its job runs, read out of `ci.yml` and `package.json`, and the
 * change reaches them when the symbol analysis the test plan uses
 * (`affected-specs.service.ts`) follows the change to one of them. A lint
 * importing a core barrel is then not run for every core change, only for
 * one that changes a name it uses.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

import { declaredBranches } from '../lib/declared-branches';
import { affectedFiles, repositorySince } from './affected-specs.service';
import { STATIC_CHECK_JOBS, staticChecksOf } from './ci-static-steps';

/** A file a command runs: a script path among its words. */
const SCRIPT_FILE = /^(?:\.\/)?[\w@.-][\w@./-]*\.(?:[cm]?[jt]s|tsx)$/u;

/**
 * The script files a command text runs, following `bun run <name>`, a
 * `--cwd` and a `cd <dir> &&` into the package scripts they name; `undefined`
 * when a named file is not there, which makes the job reached by any change
 * to code. Pure, given `scriptsAt` and `exists`.
 */
export const scriptFilesOf = (input: {
	readonly text: string;
	readonly scriptsAt: (dir: string) => Readonly<Record<string, string>>;
	readonly exists: (path: string) => boolean;
}): readonly string[] | undefined => {
	const files = new Set<string>();
	const seen = new Set<string>();
	let unresolved = false;
	const walk = (text: string, dir: string): void => {
		let cwd = dir;
		for (const segment of text.split(/&&|\|\||;|\n/u)) {
			const words = segment
				.replace(/["'`]/gu, ' ')
				.split(/\s+/u)
				.filter((word) => word.length > 0);
			const cdAt = words.indexOf('cd');
			if (cdAt >= 0 && words[cdAt + 1] !== undefined) {
				cwd = normalize(join(cwd, words[cdAt + 1] ?? '.'));
				continue;
			}
			let scriptsDir = cwd;
			for (const [index, word] of words.entries()) {
				if (word.startsWith('--cwd=')) {
					scriptsDir = normalize(join(cwd, word.slice(6)));
				} else if (word === '--cwd' && words[index + 1] !== undefined) {
					scriptsDir = normalize(join(cwd, words[index + 1] ?? '.'));
				}
			}
			const scripts = input.scriptsAt(scriptsDir);
			for (const word of words) {
				const named = scripts[word];
				if (named !== undefined) {
					const key = `${scriptsDir}#${word}`;
					if (!seen.has(key)) {
						seen.add(key);
						walk(named, scriptsDir);
					}
					continue;
				}
				if (!SCRIPT_FILE.test(word)) continue;
				const path = normalize(join(cwd, word));
				if (input.exists(path)) files.add(path);
				else unresolved = true;
			}
		}
	};
	walk(input.text, '.');
	return unresolved ? undefined : [...files].sort();
};

/** The script files each static check job runs, read from the repository. */
export const jobScriptFiles = (
	root: string,
): ReadonlyMap<string, readonly string[] | undefined> => {
	const scriptsAt = (dir: string): Readonly<Record<string, string>> => {
		try {
			return (
				(
					JSON.parse(
						readFileSync(join(root, dir, 'package.json'), 'utf8'),
					) as { readonly scripts?: Record<string, string> }
				).scripts ?? {}
			);
		} catch {
			return {};
		}
	};
	const checks = staticChecksOf(
		readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'),
		'HEAD',
		declaredBranches(root).integration,
	);
	return new Map(
		STATIC_CHECK_JOBS.map((job) => {
			const files = scriptFilesOf({
				text: checks.find((check) => check.job === job)?.script ?? '',
				scriptsAt,
				exists: (path) => existsSync(join(root, path)),
			});
			return [
				job,
				files === undefined ? undefined : withSpawned(root, files),
			];
		}),
	);
};

/** A script path written in a script's text: what it spawns by name. */
const SPAWNED =
	/["'`]((?:tools|packages|plugins|apps|extensions|scripts)\/[\w@./-]+\.(?:[cm]?[jt]s|tsx))["'`]/gu;

/** `files` and every script they name in their text, transitively. */
const withSpawned = (
	root: string,
	files: readonly string[],
): readonly string[] => {
	const all = new Set(files);
	const queue = [...files];
	for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
		let text = '';
		try {
			text = readFileSync(join(root, next), 'utf8');
		} catch {
			continue;
		}
		for (const match of text.matchAll(SPAWNED)) {
			const path = match[1];
			if (
				path !== undefined &&
				!all.has(path) &&
				existsSync(join(root, path))
			) {
				all.add(path);
				queue.push(path);
			}
		}
	}
	return [...all].sort();
};

/**
 * The jobs whose own scripts a change reaches by symbol. A job whose scripts
 * could not all be found is reached by any change to a script or module.
 * Pure, given the reached files.
 */
export const jobsReached = (input: {
	readonly reachedFiles: ReadonlySet<string>;
	readonly changed: readonly string[];
	readonly scripts: ReadonlyMap<string, readonly string[] | undefined>;
}): ReadonlySet<string> => {
	const anyCode = input.changed.some((file) =>
		/\.(?:[cm]?[jt]s|tsx)$/u.test(file),
	);
	return new Set(
		[...input.scripts.entries()]
			.filter(([, files]) =>
				files === undefined
					? anyCode
					: files.some((file) => input.reachedFiles.has(file)),
			)
			.map(([job]) => job),
	);
};

/** Paths a change since `base` adds or removes; a rename is both. */
export const structuralSince = (
	root: string,
	base: string,
): readonly string[] | undefined => {
	try {
		return execFileSync(
			'git',
			[
				'diff',
				'--name-only',
				'--no-renames',
				'--diff-filter=AD',
				`${base}...HEAD`,
			],
			{ cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
		)
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	} catch {
		// Unreadable: every changed path counts as added or removed.
		return undefined;
	}
};

/** The jobs a change since `base` reaches through their own code. */
export const jobsReachedSince = (
	root: string,
	base: string,
	changed: readonly string[],
): ReadonlySet<string> | undefined => {
	try {
		return jobsReached({
			reachedFiles: new Set(affectedFiles(repositorySince(root, base))),
			changed,
			scripts: jobScriptFiles(root),
		});
	} catch {
		// No analysis: every job counts as reached.
		return undefined;
	}
};
