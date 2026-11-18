#!/usr/bin/env bun
/**
 * promotion-alerts.script.ts — a promotion carries no open code scanning
 * alert into the release branch.
 *
 * The pull request's own `CodeQL` check fails only from a severity
 * threshold up, so alerts below it land on the integration branch one at
 * a time: on 2026-10-10 four had opened there since the last promotion,
 * every pull request green. Whether they reach the release branch used to
 * depend on somebody counting them before promoting. The release gate
 * counts them: the head of a promotion is the integration branch, and the
 * forge reports what is open on it.
 *
 * A branch whose tip no completed analysis covers (neither the tip nor a
 * descendant of it was analysed) has unknown alerts, so it is refused too:
 * the answer "none open" would be about an older tree.
 *
 * `--latest-analysed` (the hourly upkeep watch only) judges the open alerts
 * at the latest analysed commit when the tip is not analysed yet, and says
 * so; the release gate never passes it.
 *
 * Exit codes:
 *   0 — no alert is open on the head branch, and an analysis covers its tip.
 *   1 — at least one is, no analysis covers the tip, or the forge could not
 *       be asked (a gate that cannot run is not a pass).
 */
import { execFileSync } from 'node:child_process';

export interface IOpenAlert {
	readonly number: number;
	readonly rule: string;
	readonly path: string;
	readonly line: number;
}

interface IAlertRow {
	readonly number: number;
	readonly rule?: { readonly id?: string };
	readonly most_recent_instance?: {
		readonly location?: {
			readonly path?: string;
			readonly start_line?: number;
		};
	};
}

/** The forge's alert rows, reduced to what a person needs to find each. */
export const openAlertsOf = (
	rows: readonly IAlertRow[],
): readonly IOpenAlert[] =>
	rows.map((row) => ({
		number: row.number,
		rule: row.rule?.id ?? 'unknown rule',
		path: row.most_recent_instance?.location?.path ?? 'unknown file',
		line: row.most_recent_instance?.location?.start_line ?? 0,
	}));

/** What the gate says about a branch with these alerts open. */
export const promotionAlertReport = (
	branch: string,
	alerts: readonly IOpenAlert[],
): { readonly ok: boolean; readonly lines: readonly string[] } =>
	alerts.length === 0
		? {
				ok: true,
				lines: [
					`✓ promotion-alerts: code scanning reports no open alert on ${branch}.`,
				],
			}
		: {
				ok: false,
				lines: [
					`✖ promotion-alerts: ${String(alerts.length)} code scanning alert(s) are open on ${branch}; a promotion carries none.`,
					...alerts.map(
						(alert) =>
							`  #${String(alert.number)} ${alert.rule} — ${alert.path}:${String(alert.line)}`,
					),
					'  Fix each on the integration branch (or dismiss it there with its reason), then promote.',
				],
			};

/** What `compare/<tip>...<analysed>` says: the tip is the analysed commit or one of its ancestors. */
export const analysisCoversTip = (compareStatus: string): boolean =>
	compareStatus === 'identical' || compareStatus === 'ahead';

/** The line a branch gets when no completed analysis covers its tip. */
export const uncoveredReport = (
	branch: string,
	tip: string,
	analysed: string | undefined,
): string =>
	`✖ promotion-alerts: no completed code scanning analysis covers ${branch} at ${tip.slice(0, 12)} (${analysed === undefined ? 'none yet' : `latest is ${analysed.slice(0, 12)}`}); its open alerts are unknown. Wait for the push-started scan.`;

/** Answers a forge API path of one repository with its raw JSON. */
export type TForgeAsk = (path: string, paginate?: boolean) => string;

const ghAsk =
	(repository: string): TForgeAsk =>
	(path, paginate = false) =>
		execFileSync(
			'gh',
			[
				'api',
				...(paginate ? ['--paginate'] : []),
				`repos/${repository}/${path}`,
			],
			{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
		);

/** The line printed when the tip is not analysed yet and the watch judges the latest analysed commit. */
export const judgedAtLatestReport = (tip: string, analysed: string): string =>
	`promotion-alerts: ${tip.slice(0, 12)} is not analysed yet; judged at the latest analysed commit ${analysed.slice(0, 12)}`;

/**
 * Whether a completed analysis covers `branch`'s tip; the refusal line when
 * not. With `latestAnalysed`, a tip behind the latest analysis is judged at
 * that analysis instead (one line says so); no analysis at all still refuses.
 */
const coverageRefusal = (
	ask: TForgeAsk,
	branch: string,
	latestAnalysed: boolean,
): string | undefined => {
	const tip = (JSON.parse(ask(`commits/${branch}`)) as { sha: string }).sha;
	const [latest] = JSON.parse(
		ask(`code-scanning/analyses?ref=refs/heads/${branch}&per_page=1`),
	) as readonly { commit_sha: string }[];
	if (latest === undefined) return uncoveredReport(branch, tip, undefined);
	const status = (
		JSON.parse(ask(`compare/${tip}...${latest.commit_sha}`)) as {
			status: string;
		}
	).status;
	if (analysisCoversTip(status)) return undefined;
	if (!latestAnalysed) return uncoveredReport(branch, tip, latest.commit_sha);
	console.log(judgedAtLatestReport(tip, latest.commit_sha));
	return undefined;
};

/** Judges `branch` with the forge answers `ask` gives; the exit code. */
export const judge = (
	branch: string,
	ask: TForgeAsk,
	latestAnalysed: boolean,
): number => {
	let rows: readonly IAlertRow[];
	try {
		rows = JSON.parse(
			ask(
				`code-scanning/alerts?ref=refs/heads/${branch}&state=open&per_page=100`,
				true,
			),
		) as readonly IAlertRow[];
	} catch (error) {
		console.error(
			`✖ promotion-alerts: the forge could not be asked for the alerts of ${branch} (${error instanceof Error ? error.message.split('\n')[0] : String(error)}), so nothing was checked.`,
		);
		return 1;
	}
	try {
		const refusal = coverageRefusal(ask, branch, latestAnalysed);
		if (refusal !== undefined) {
			console.error(refusal);
			return 1;
		}
	} catch (error) {
		console.error(
			`✖ promotion-alerts: the forge could not be asked which analysis covers ${branch} (${error instanceof Error ? error.message.split('\n')[0] : String(error)}), so nothing was checked.`,
		);
		return 1;
	}
	const report = promotionAlertReport(branch, openAlertsOf(rows));
	for (const line of report.lines) {
		if (report.ok) console.log(line);
		else console.error(line);
	}
	return report.ok ? 0 : 1;
};

export const main = (): number => {
	const repository = process.env.GITHUB_REPOSITORY;
	const branch =
		process.argv.find((arg) => arg.startsWith('--branch='))?.slice(9) ??
		process.env.GITHUB_HEAD_REF;
	if (
		repository === undefined ||
		branch === undefined ||
		branch.length === 0
	) {
		console.error(
			'✖ promotion-alerts: the repository or the head branch is not known here (GITHUB_REPOSITORY, GITHUB_HEAD_REF or --branch=), so nothing was checked.',
		);
		return 1;
	}
	return judge(
		branch,
		ghAsk(repository),
		process.argv.includes('--latest-analysed'),
	);
};

if (import.meta.main) process.exit(main());
