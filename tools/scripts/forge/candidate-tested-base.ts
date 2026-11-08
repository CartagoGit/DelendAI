/**
 * candidate-tested-base.ts — the integration commit a candidate's checks
 * already ran on.
 *
 * A pull request's run tests the forge's merge ref: the candidate on top of
 * the integration branch as it stood when the run started. Counting what
 * the integration branch gained since the candidate left it sent green
 * candidates back for changes their checks had already seen: #1597 was
 * tested against the very tip it was then told to come forward to.
 */
import { execFileSync } from 'node:child_process';

/** The merge ref is built just before the run: a margin for that gap. */
const MERGE_REF_MARGIN_MS = 120_000;

const read = (
	command: string,
	args: readonly string[],
	cwd: string,
): string | undefined => {
	try {
		return execFileSync(command, [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

/**
 * The instant to read the integration branch at, for a run created at
 * `createdAt`. Undefined when the instant does not parse.
 */
export const testedInstant = (createdAt: string): string | undefined => {
	const time = Date.parse(createdAt);
	return Number.isNaN(time)
		? undefined
		: new Date(time - MERGE_REF_MARGIN_MS).toISOString();
};

/**
 * The integration commit the latest pull-request run of `headSha` saw, or
 * undefined when that cannot be told: the caller then counts from where
 * the candidate left, which is the cautious answer.
 */
export const testedAgainst = (input: {
	readonly root: string;
	readonly remote: string;
	readonly integration: string;
	readonly headSha: string;
	readonly base: string;
}): string | undefined => {
	const created = read(
		'gh',
		[
			'api',
			`repos/{owner}/{repo}/actions/runs?head_sha=${input.headSha}&event=pull_request&per_page=20`,
			'--jq',
			'[.workflow_runs[] | select(.path == ".github/workflows/ci.yml")][0].created_at // empty',
		],
		input.root,
	);
	const instant =
		created === undefined || created === ''
			? undefined
			: testedInstant(created);
	if (instant === undefined) return undefined;
	const tip = read(
		'git',
		[
			'rev-list',
			'-1',
			'--first-parent',
			`--before=${instant}`,
			`${input.remote}/${input.integration}`,
		],
		input.root,
	);
	if (tip === undefined || tip === '') return undefined;
	// Only forward of where the candidate left: an older commit says less.
	return read(
		'git',
		['merge-base', '--is-ancestor', input.base, tip],
		input.root,
	) === undefined
		? undefined
		: tip;
};
