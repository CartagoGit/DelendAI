/**
 * release-checkout.script.ts — give the shared checkout back once the
 * work it was holding has been published.
 *
 * Under a pinned shared checkout the tree is supposed to match the
 * integration branch: work lives on refs, not in the working directory.
 * In practice an agent edits files, publishes a candidate built from
 * them, and then leaves the edits sitting there — where the next agent
 * sees a dirty tree it did not make, and where a later publication can
 * sweep them into an unrelated candidate.
 *
 * WHY THIS CANNOT SIMPLY `git checkout -- .`. That is the blunt
 * instrument that has already destroyed a human's uncommitted edit in
 * this repository once. Restoring a path is only safe when the working
 * tree's content is PROVABLY the content that was published, so that is
 * the test: hash the file, compare it with the blob the publication ref
 * actually carries, and restore only on a byte-for-byte match. Anything
 * that differs is somebody's unpublished work and is left exactly where
 * it is, named in the report rather than silently kept or silently lost.
 */

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/repo-root';

import type {
	IReleasePlan,
	IReleaseVerdict,
} from './release-checkout.interface';

export type {
	IReleasePlan,
	IReleaseVerdict,
} from './release-checkout.interface';

const git = (args: readonly string[], cwd = repoRoot()): string => {
	const result = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
	return result.status === 0 ? result.stdout.trim() : '';
};

/**
 * Decides, per path, whether the checkout may be released.
 *
 * Pure so the decision can be tested without a repository: the caller
 * supplies what the publication carries and what the tree holds.
 */
export const planRelease = (
	paths: readonly string[],
	publishedBlob: (path: string) => string | undefined,
	workingBlob: (path: string) => string | undefined,
): IReleasePlan => {
	const release: string[] = [];
	const keep: string[] = [];
	for (const path of paths) {
		const published = publishedBlob(path);
		const working = workingBlob(path);
		// Absent from the working tree: nothing to release, nothing at
		// risk. Absent from the publication: never published, so it is
		// not this candidate's to touch.
		if (published === undefined || working === undefined) {
			keep.push(path);
			continue;
		}
		if (published === working) release.push(path);
		else keep.push(path);
	}
	return { release, keep };
};

/** Renders the verdict an operator reads. */
export const renderVerdict = (verdict: IReleaseVerdict): string =>
	[
		`release-checkout: ${String(verdict.released.length)} path(s) returned to ${verdict.integration}.`,
		...(verdict.kept.length === 0
			? []
			: [
					`release-checkout: ${String(verdict.kept.length)} path(s) LEFT ALONE — their content is not what was published:`,
					...verdict.kept.map((path) => `  - ${path}`),
				]),
	].join('\n');

const main = (): void => {
	const args = process.argv.slice(2);
	const refArg = args.find((arg) => arg.startsWith('--ref='));
	const integration =
		args.find((arg) => arg.startsWith('--integration='))?.slice(14) ??
		'origin/develop';
	const dryRun = args.includes('--dry-run');

	if (refArg === undefined) {
		process.stderr.write(
			'release-checkout: --ref=<publication ref> is required. Refusing to guess which publication to release against.\n',
		);
		process.exitCode = 1;
		return;
	}
	const ref = refArg.slice(6);

	const paths = git(['diff', '--name-only', integration, ref])
		.split('\n')
		.filter((path) => path.length > 0);
	if (paths.length === 0) {
		process.stdout.write(
			`release-checkout: ${ref} changes nothing against ${integration}; nothing to release.\n`,
		);
		return;
	}

	const plan = planRelease(
		paths,
		(path) => {
			const blob = git(['rev-parse', `${ref}:${path}`]);
			return blob.length === 0 ? undefined : blob;
		},
		(path) => {
			const blob = git(['hash-object', path]);
			return blob.length === 0 ? undefined : blob;
		},
	);

	// A path the integration branch does not have cannot be restored
	// FROM it — releasing a newly added file means removing it from the
	// tree, not checking it out. Getting this wrong makes the whole
	// command fail on exactly the candidates that add something, which
	// is most of them.
	const existsInIntegration = (path: string): boolean =>
		spawnSync('git', ['cat-file', '-e', `${integration}:${path}`], {
			cwd: repoRoot(),
		}).status === 0;

	if (!dryRun) {
		const restore = plan.release.filter(existsInIntegration);
		const remove = plan.release.filter(
			(path) => !existsInIntegration(path),
		);
		if (restore.length > 0)
			git(['checkout', integration, '--', ...restore]);
		for (const path of remove)
			rmSync(join(repoRoot(), path), { force: true });
	}

	process.stdout.write(
		`${renderVerdict({
			integration,
			released: plan.release,
			kept: plan.keep,
		})}\n`,
	);
};

if (import.meta.main) main();
