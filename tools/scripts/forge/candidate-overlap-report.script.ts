#!/usr/bin/env bun
/**
 * candidate-overlap-report.script.ts — what sent merged pull requests back
 * for another run: the merges of the integration branch into them, and
 * the files each one shared with what it brought.
 *
 *   bun tools/scripts/forge/candidate-overlap-report.script.ts [--since=YYYY-MM-DD] [--limit=40]
 *
 * Every merge into a published unit re-runs its whole forge run. Measured
 * on 2026-10-29 over 40 pull requests: 74 such merges, 7 of which shared a
 * single file with the integration branch — the rest bought nothing. This
 * says, for a period, how many there were, how many overlapped, and which
 * files, derived (`.gitattributes` `merge=delendai-generated`) or authored.
 */
import { execFileSync } from 'node:child_process';

import { repoRoot } from '../lib/repo-root';
import { derivedPaths } from '../git/refresh-candidate-artifacts.script';

/** One merge of the integration branch into a pull request. */
export interface IIntegrationMerge {
	readonly pullRequest: number;
	/** The files both sides changed since their merge base. */
	readonly shared: readonly string[];
}

/** The report over a set of merges. */
export const overlapReport = (
	merges: readonly IIntegrationMerge[],
	isDerived: (path: string) => boolean,
): {
	readonly merges: number;
	readonly overlapping: number;
	readonly pullRequests: number;
	readonly files: readonly {
		readonly path: string;
		readonly times: number;
		readonly derived: boolean;
	}[];
} => {
	const times = new Map<string, number>();
	for (const merge of merges) {
		for (const path of new Set(merge.shared)) {
			times.set(path, (times.get(path) ?? 0) + 1);
		}
	}
	return {
		merges: merges.length,
		overlapping: merges.filter((merge) => merge.shared.length > 0).length,
		pullRequests: new Set(merges.map((merge) => merge.pullRequest)).size,
		files: [...times]
			.map(([path, count]) => ({
				path,
				times: count,
				derived: isDerived(path),
			}))
			.sort((a, b) => b.times - a.times || a.path.localeCompare(b.path)),
	};
};

const run = (command: string, args: readonly string[]): string =>
	execFileSync(command, [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim();

const lines = (text: string): string[] => text.split('\n').filter(Boolean);

const arg = (name: string): string | undefined =>
	process.argv
		.find((value) => value.startsWith(`--${name}=`))
		?.slice(name.length + 3);

/** The integration merges of one pull request, with what each shared. */
const mergesOf = (pullRequest: number): readonly IIntegrationMerge[] =>
	lines(
		run('gh', [
			'api',
			`repos/{owner}/{repo}/pulls/${String(pullRequest)}/commits?per_page=100`,
			'--jq',
			'.[] | select(.parents | length == 2) | select(.commit.message | test("^Merge .*develop")) | .sha',
		]),
	).flatMap((sha) => {
		try {
			const ours = run('git', ['rev-parse', `${sha}^1`]);
			const theirs = run('git', ['rev-parse', `${sha}^2`]);
			const base = run('git', ['merge-base', ours, theirs]);
			const mine = new Set(
				lines(run('git', ['diff', '--name-only', base, ours])),
			);
			const shared = lines(
				run('git', ['diff', '--name-only', base, theirs]),
			).filter((path) => mine.has(path));
			return [{ pullRequest, shared }];
		} catch {
			// A merge this clone does not hold (fetch it to count it).
			return [];
		}
	});

const main = (): number => {
	const since =
		arg('since') ??
		new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
	// `{owner}/{repo}` is expanded in an endpoint, not in a query.
	const repository = run('gh', [
		'repo',
		'view',
		'--json',
		'nameWithOwner',
		'--jq',
		'.nameWithOwner',
	]);
	const numbers = lines(
		run('gh', [
			'api',
			'-X',
			'GET',
			'search/issues',
			'-f',
			`q=repo:${repository} is:pr is:merged merged:>=${since}`,
			'-f',
			`per_page=${arg('limit') ?? '40'}`,
			'--jq',
			'.items[].number',
		]),
	).map(Number);
	const merges = numbers.flatMap(mergesOf);
	const paths = [...new Set(merges.flatMap((merge) => merge.shared))];
	const derived = derivedPaths(repoRoot(), paths);
	const report = overlapReport(merges, (path) => derived.has(path));
	console.log(
		`candidate-overlap-report: since ${since}, ${String(report.pullRequests)} pull request(s) took ${String(report.merges)} merge(s) of the integration branch; ${String(report.overlapping)} shared a file with what they brought.`,
	);
	for (const file of report.files) {
		console.log(
			`  ${String(file.times).padStart(3)}  ${file.path}${file.derived ? '  (derived)' : ''}`,
		);
	}
	return 0;
};

if (import.meta.main) process.exit(main());
