#!/usr/bin/env bun
/**
 * install-merge-drivers.script.ts — make the declaration in
 * `.gitattributes` mean something.
 *
 * `.gitattributes` says which files merge with the `delendai-generated`
 * driver, and that file is tracked. What the driver *is* lives in
 * `merge.delendai-generated.driver`, which lives in `.git/config` —
 * local, untracked, and, until this script, installed by nobody.
 *
 * So the declaration was true only on a machine where somebody had
 * configured it by hand. Everywhere else — a fresh clone, a CI runner,
 * a throwaway worktree — git silently fell back to a textual merge of a
 * generated file. That is the failure this whole cycle kept paying for:
 * EVERY candidate touches `AGENT-BOOTSTRAP.md` and the agent catalog,
 * so every pair of candidates conflicted, the refresh correctly refused
 * ("that is the author's call"), and a person resolved the same
 * generated-file conflict by hand over and over.
 *
 * Git resolves `merge.*` from the COMMON config, so installing it once
 * covers the pinned checkout and every worktree made from it.
 *
 * Idempotent, and safe to run from anywhere in the repository.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
	GENERATED_MERGE_DRIVER,
	MERGE_DRIVER_SCRIPT,
} from './install-merge-drivers.constant';
import type { IMergeDriverReport } from './install-merge-drivers.interface';

const git = (root: string, args: readonly string[]): string => {
	try {
		return execFileSync('git', [...args], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	} catch {
		return '';
	}
};

/** The pinned checkout, from wherever this runs. */
export const pinnedRoot = (cwd: string): string =>
	dirname(
		git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
	);

/** The command `.gitattributes` promises, spelled for this checkout. */
export const driverCommandFor = (root: string): string =>
	`${process.execPath} ${join(root, MERGE_DRIVER_SCRIPT)} %O %A %B %P`;

/** Which paths `.gitattributes` routes through the driver. */
export const declaredPaths = (root: string): readonly string[] => {
	const path = join(root, '.gitattributes');
	if (!existsSync(path)) return [];
	return readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line.includes(`merge=${GENERATED_MERGE_DRIVER}`))
		.map((line) => line.trim().split(/\s+/u)[0] ?? '')
		.filter((each) => each.length > 0);
};

/**
 * Install the driver if it is missing or points somewhere else.
 *
 * Returns what it found and what it did, so a caller can report rather
 * than guess — and so the check that this is installed can share the
 * same reading.
 */
export const installMergeDrivers = (input: {
	readonly cwd: string;
	readonly apply?: boolean;
}): IMergeDriverReport => {
	const root = pinnedRoot(input.cwd);
	const key = `merge.${GENERATED_MERGE_DRIVER}.driver`;
	const wanted = driverCommandFor(root);
	const found = git(root, ['config', '--get', key]);
	const paths = declaredPaths(root);
	const installed = found === wanted;
	if (installed || input.apply !== true) {
		return { root, key, wanted, found, installed, changed: false, paths };
	}
	git(root, ['config', key, wanted]);
	// `%P` is the pathname, which the driver needs to know WHICH
	// generated file it is regenerating. Git only passes it when the
	// driver declares it wants the extra placeholders.
	git(root, [
		'config',
		`merge.${GENERATED_MERGE_DRIVER}.name`,
		'regenerate a derived file instead of merging its text',
	]);
	return {
		root,
		key,
		wanted,
		found: git(root, ['config', '--get', key]),
		installed: true,
		changed: true,
		paths,
	};
};

if (import.meta.main) {
	const check = process.argv.includes('--check');
	const report = installMergeDrivers({ cwd: process.cwd(), apply: !check });
	if (report.paths.length === 0) {
		console.log(
			'install-merge-drivers: .gitattributes routes nothing through the generated driver; nothing to install.',
		);
		process.exit(0);
	}
	if (check && !report.installed) {
		console.error(
			[
				`✖ install-merge-drivers: ${String(report.paths.length)} path(s) in .gitattributes route through \`${GENERATED_MERGE_DRIVER}\`, and the driver is not installed.`,
				`  found:  ${report.found === '' ? '(nothing)' : report.found}`,
				`  wanted: ${report.wanted}`,
				'  Every merge of those files falls back to a TEXTUAL merge of generated output, which conflicts between any two branches that regenerated it.',
				'  fix: bun tools/scripts/git/install-merge-drivers.script.ts',
			].join('\n'),
		);
		process.exit(1);
	}
	console.log(
		check
			? `✓ install-merge-drivers: the generated merge driver is installed for ${String(report.paths.length)} declared path(s).`
			: `install-merge-drivers: ${report.changed ? 'installed' : 'already installed'} for ${String(report.paths.length)} declared path(s).`,
	);
}
