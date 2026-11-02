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
 * Exit codes:
 *   0 — no alert is open on the head branch.
 *   1 — at least one is, or the forge could not be asked (a gate that
 *       cannot run is not a pass).
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
	let rows: readonly IAlertRow[];
	try {
		rows = JSON.parse(
			execFileSync(
				'gh',
				[
					'api',
					'--paginate',
					`repos/${repository}/code-scanning/alerts?ref=refs/heads/${branch}&state=open&per_page=100`,
				],
				{ encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
			),
		) as readonly IAlertRow[];
	} catch (error) {
		console.error(
			`✖ promotion-alerts: the forge could not be asked for the alerts of ${branch} (${error instanceof Error ? error.message.split('\n')[0] : String(error)}), so nothing was checked.`,
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

if (import.meta.main) process.exit(main());
