#!/usr/bin/env bun

/**
 * lint:candidate-delivers — a pull request must change something.
 *
 * THE INCIDENT. GitHub recorded #100 as:
 *
 *     merged: true
 *     changed_files: 0
 *     additions: 0
 *     deletions: 0
 *
 * under a title and body describing a twenty-two file CI redesign —
 * named test zones, scoped validation, changed-file coverage, the
 * removal of `tier1.yml`. None of it is on `develop`. The eight shards
 * it replaced still are. Every check was green, because there was
 * nothing to be red about.
 *
 * The cause was a shell one, and it is worth naming so nobody looks for
 * a cleverer explanation: zsh does not word-split an unquoted `$PATHS`,
 * so twenty-three paths arrived at the publisher as ONE argument, and
 * `git update-index --force-remove` on a path the index has never heard
 * of exits zero. No command failed. The tree came out byte-identical to
 * the integration branch and the push reported success.
 *
 * WHY THE CHECK LIVES HERE TOO. `forge:publish` now refuses to build
 * such a tree, and that is the better place to stop it — at the moment
 * it happens, with the author still present. But a candidate can be
 * emptied by anything that writes a ref: another tool, a refresh, a
 * force-push, a person. This check asks the only question that matters
 * at the merge boundary, of whatever actually arrived:
 *
 *     does this pull request deliver anything at all?
 *
 * It is deliberately not a diff-digest comparison. A receipt that
 * records what the candidate was meant to be is the stronger property
 * and it is coming; this is the one-line version that cannot be
 * satisfied by an empty tree, costs a second, and would have blocked
 * #100 outright.
 */

import { execFileSync } from 'node:child_process';

import { repoRoot } from '../lib/monorepo-paths';
import type { IDeliveryVerdict } from './candidate-delivers.interface';

export type { IDeliveryVerdict } from './candidate-delivers.interface';

/**
 * Decide from the changed-path list alone, so the verdict is testable
 * without a forge or a second branch.
 */
export const judgeDelivery = (
	changed: readonly string[],
	base: string,
	head: string,
): IDeliveryVerdict =>
	changed.length > 0
		? { kind: 'delivers', changed: changed.length }
		: {
				kind: 'empty',
				reason: `${head} is byte-identical to ${base}: this pull request would merge and deliver nothing. That is how #100 landed a twenty-two file CI redesign as zero files.`,
			};

const git = (args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});

const arg = (name: string): string | undefined => {
	const hit = process.argv.find((each) => each.startsWith(`--${name}=`));
	return hit?.slice(name.length + 3);
};

/**
 * The first base ref that this clone can actually resolve.
 *
 * CI checks out shallow, so `origin/develop` is frequently not an object
 * the runner has — the first version of this check died on
 * `git diff origin/develop...HEAD` with a raw `Command failed`. A gate
 * that cannot run must say so in those words: reporting NOT_EXECUTABLE
 * as PASS is the failure mode this repository has a tri-state verdict
 * to avoid.
 */
export const firstResolvable = (
	candidates: readonly string[],
	resolves: (ref: string) => boolean,
): string | undefined => candidates.find((ref) => ref !== '' && resolves(ref));

const main = (): number => {
	const head = arg('head') ?? 'HEAD';
	const resolves = (ref: string): boolean => {
		try {
			git(['rev-parse', '--verify', `${ref}^{commit}`]);
			return true;
		} catch {
			return false;
		}
	};
	const base = firstResolvable(
		[
			arg('base') ?? '',
			process.env.GITHUB_BASE_SHA ?? '',
			`origin/${process.env.GITHUB_BASE_REF ?? ''}`,
			process.env.GITHUB_BASE_REF ?? '',
			'origin/develop',
		],
		resolves,
	);
	if (base === undefined) {
		process.stderr.write(
			[
				'✗ candidate-delivers: NOT EXECUTABLE — no base ref this clone can resolve.',
				'',
				'  Tried --base, GITHUB_BASE_SHA, GITHUB_BASE_REF and origin/develop.',
				'  A shallow checkout has none of them unless the job asks for',
				'  them, and a check that cannot run must not report success.',
				'',
				'next-action:',
				'  pass --base=<sha the runner has>, e.g.',
				'  `github.event.pull_request.base.sha`.',
				'',
			].join('\n'),
		);
		return 1;
	}
	// `-z` and NUL splitting: a path may contain a space, a quote or a
	// newline, and reconstructing git's quoting by hand is the bug class
	// that produced this check in the first place.
	const changed = git(['diff', '--name-only', '-z', `${base}...${head}`])
		.split('\0')
		.filter((path) => path !== '');
	const verdict = judgeDelivery(changed, base, head);
	if (verdict.kind === 'delivers') {
		process.stdout.write(
			`✓ candidate-delivers: ${String(verdict.changed)} changed path(s) against ${base}\n`,
		);
		return 0;
	}
	process.stderr.write(
		[
			'✗ candidate-delivers: this pull request delivers nothing.',
			'',
			`  ${verdict.reason}`,
			'',
			'next-action:',
			'  republish the candidate with `bun run forge:publish`, which',
			'  refuses to build a tree identical to the integration branch,',
			'  and check the path list it prints before you push.',
			'',
		].join('\n'),
	);
	return 1;
};

if (import.meta.main) {
	process.exit(main());
}
