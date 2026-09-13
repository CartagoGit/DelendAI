#!/usr/bin/env bun

/**
 * lint:lints-reach-ci — a rule nothing runs is not a rule.
 *
 * MEASURED, three times over, each found by accident:
 *
 *   - `lint:no-duplicate-implementation` was FAILING on `develop` while
 *     every check was green. It lives in the `validate:run` chain, which
 *     CI does not invoke.
 *   - `lint:core-public-surface-budget` was over its own budget by six
 *     on `develop`, likewise unseen.
 *   - `lint:types-in-contracts` ran in CI but not in the local
 *     pre-flight, so a candidate passed here and failed there.
 *
 * Each was fixed on its own and the pattern kept recurring, which is the
 * signal that the pattern is the bug. There are 125 `lint:*` scripts in
 * this repository; counting them by hand is how you get 57 that nobody
 * has run in months.
 *
 * REACHABILITY, not mention. A workflow that runs `bun run
 * lint:architecture` reaches all seventeen lints that script chains, so
 * the answer is a transitive closure over `package.json` script bodies
 * starting from every command the workflows invoke — not a grep for the
 * lint's own name, which would call an umbrella's members unreachable
 * and its umbrella reachable.
 *
 * A RATCHET, not a wall. Fifty-seven unreachable scripts is a real
 * finding and not a thing to fix in one change; some of them are
 * legitimately not CI's business (`lint:fix` is a fixer, the pre-push
 * gates run in `lefthook.yml`, `:warn` variants are advisory). The
 * baseline records today's set. A NEW unreachable lint fails the gate,
 * and one that starts running in CI is reported so the win can be
 * locked in. The number may only go down by default.
 *
 * Usage:
 *   bun run lint:lints-reach-ci
 *   bun run lint:lints-reach-ci -- --update   # rewrite the baseline
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';
import type { IReachabilityReport } from './lints-reach-ci.interface';

export type {
	ILintReachability,
	IReachabilityReport,
} from './lints-reach-ci.interface';

const BASELINE_REL = 'tools/scripts/lint/lints-reach-ci.baseline.json';
const WORKFLOWS_REL = '.github/workflows';

/** Every `bun run <script>` a text invokes. */
const invocations = (text: string): readonly string[] =>
	[...text.matchAll(/bun run ([a-z0-9:@._-]+)/gu)].map(
		(match) => match[1] ?? '',
	);

/**
 * The lint scripts CI can reach. Pure over the two inputs, so the rule
 * is testable without a workflow directory.
 */
export const reachableLints = (
	scripts: Readonly<Record<string, string>>,
	workflowText: string,
): ReadonlySet<string> => {
	const reached = new Set<string>();
	const queue = [...invocations(workflowText)];
	const seen = new Set<string>();
	while (queue.length > 0) {
		const name = queue.pop();
		if (name === undefined || seen.has(name)) continue;
		seen.add(name);
		const body = scripts[name];
		if (body === undefined) continue;
		if (name.startsWith('lint:')) reached.add(name);
		queue.push(...invocations(body));
	}
	return reached;
};

/** Compare today's reachability against the recorded baseline. */
export const judgeReachability = (
	scripts: Readonly<Record<string, string>>,
	workflowText: string,
	baseline: readonly string[],
): IReachabilityReport => {
	const lints = Object.keys(scripts).filter((name) =>
		name.startsWith('lint:'),
	);
	const reached = reachableLints(scripts, workflowText);
	const unreachable = lints.filter((name) => !reached.has(name));
	const recorded = new Set(baseline);
	return {
		total: lints.length,
		reachable: lints
			.filter((name) => reached.has(name))
			.map((script) => ({ script })),
		unreachable,
		newlyUnreachable: unreachable.filter((name) => !recorded.has(name)),
		nowReachable: baseline.filter((name) => reached.has(name)),
	};
};

const readScripts = (): Readonly<Record<string, string>> =>
	(
		JSON.parse(readFileSync(join(repoRoot(), 'package.json'), 'utf8')) as {
			readonly scripts: Record<string, string>;
		}
	).scripts;

const readWorkflows = (): string => {
	const dir = join(repoRoot(), WORKFLOWS_REL);
	return readdirSync(dir)
		.filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
		.map((name) => readFileSync(join(dir, name), 'utf8'))
		.join('\n');
};

const main = (): number => {
	const baselinePath = join(repoRoot(), BASELINE_REL);
	const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
		readonly unreachable: readonly string[];
	};
	const report = judgeReachability(
		readScripts(),
		readWorkflows(),
		baseline.unreachable,
	);

	if (process.argv.includes('--update')) {
		writeFileSync(
			baselinePath,
			`${JSON.stringify({ unreachable: [...report.unreachable].sort() }, null, '\t')}\n`,
		);
		process.stdout.write(
			`lints-reach-ci: baseline updated — ${String(report.unreachable.length)} of ${String(report.total)} lint script(s) unreachable from CI.\n`,
		);
		return 0;
	}

	if (report.newlyUnreachable.length > 0) {
		process.stderr.write(
			[
				`✖ lints-reach-ci: ${String(report.newlyUnreachable.length)} lint script(s) no workflow can reach:`,
				...report.newlyUnreachable.map((name) => `  ${name}`),
				'',
				'  A rule nothing runs is not a rule. Add it to a job in',
				'  `.github/workflows/`, or to a script such a job already runs',
				'  (`lint:architecture` is chained into `lint-architecture`).',
				'',
				'  If it genuinely is not CI’s business — a fixer, a pre-push',
				'  gate, an advisory `:warn` variant — record it with',
				'  `bun run lint:lints-reach-ci -- --update`.',
				'',
			].join('\n'),
		);
		return 1;
	}

	const win =
		report.nowReachable.length > 0
			? ` ${String(report.nowReachable.length)} baselined script(s) now run in CI — run --update to lock that in.`
			: '';
	process.stdout.write(
		`✓ lints-reach-ci: ${String(report.total - report.unreachable.length)}/${String(report.total)} lint script(s) reachable from CI (${String(report.unreachable.length)} baselined).${win}\n`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(main());
}
