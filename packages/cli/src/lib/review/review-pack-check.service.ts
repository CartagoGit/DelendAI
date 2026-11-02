/**
 * review-pack-check.service.ts — a pack that cannot land is refused
 * before it is published, not after.
 *
 * The rules are the proposals plugin's (`packRefusals`), the ones
 * `closed-with-independent-approval` applies in CI; this reads the pack's
 * own commits the way that gate reads a pull request.
 */
import { readGit } from '@delendai/core/runtime';

import { packRefusals } from '@delendai/proposals/public';

/** The directory the gate reads a pack's changes in. */
const PROPOSALS_DIR = 'docs/delendai/proposals/';

const gitOut = (cwd: string, args: readonly string[]): string | undefined =>
	readGit(cwd, args);

/**
 * Why the pack in `path`, by `agent`, would be refused once published;
 * empty when it can land, or when there is no integration branch to read
 * it against.
 */
export const packRefusalsIn = (
	path: string,
	integration: string,
	agent: string,
): readonly string[] => {
	const tip = [
		`refs/remotes/origin/${integration}`,
		`refs/heads/${integration}`,
	].find(
		(ref) =>
			gitOut(path, ['rev-parse', '--verify', '--quiet', ref]) !==
			undefined,
	);
	if (tip === undefined) return [];
	const base = gitOut(path, ['merge-base', tip, 'HEAD']);
	if (base === undefined) return [];
	const diff =
		gitOut(path, ['diff', base, 'HEAD', '--', PROPOSALS_DIR]) ?? '';
	const changed =
		gitOut(path, [
			'diff',
			'--name-only',
			'--no-renames',
			base,
			'HEAD',
			'--',
			PROPOSALS_DIR,
		]) ?? '';
	const claimed =
		gitOut(path, [
			'log',
			'--format=%(trailers:key=Claims,valueonly,separator=%x2C)',
			`${base}..HEAD`,
		]) ?? '';
	return packRefusals({
		author: agent,
		diff,
		changedPaths: changed.split('\n').filter((line) => line.length > 0),
		claimed: claimed.split(/[\n,]/u),
	});
};

/**
 * Whether the pack in `path` changed anything over the integration
 * branch; `undefined` when it cannot be told (no remote to compare with).
 * A claim is a commit with no change: a unit holding only claims has
 * nothing to publish. A unit that changed something has, whatever it
 * still claims.
 */
export const packHasVerdicts = (
	path: string,
	integration: string,
): boolean | undefined => {
	const changed = gitOut(path, [
		'diff',
		'--name-only',
		`origin/${integration}...HEAD`,
	]);
	return changed === undefined ? undefined : changed.length > 0;
};
