#!/usr/bin/env bun
/**
 * spec-duration-budget.script.ts — reads the spec durations a full CI run
 * recorded and fails any spec file over 5 s that is not in the e2e tier
 * by a margin (q00045 S1). Files over 1 s are reported.
 *
 *   bun tools/scripts/ci/spec-duration-budget.script.ts --timings=<spec-timings.json>
 *   ... --update    drop baseline entries that no longer need it (shrinks only)
 *
 *   ... --mode=pull-request   (default) exit 1 on a clearly slow spec
 *   ... --mode=integration    never fail: print the new offenders, write them
 *                             to --report-out=<file> for the issue step
 *   ... --history=a.json,b.json  earlier runs' timings; the median is judged
 *
 * The baseline (spec-duration-budget.baseline.json) lists the offenders the
 * gate started with. It only shrinks: `--update` never adds a path.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	CLEAR_MS,
	FAIL_MS,
	judgeSpecDurations,
	REPORT_MS,
} from './spec-duration-budget';

const BASELINE = join(
	dirname(fileURLToPath(import.meta.url)),
	'spec-duration-budget.baseline.json',
);

const arg = (name: string): string | undefined =>
	process.argv
		.find((value) => value.startsWith(`--${name}=`))
		?.slice(name.length + 3);

const readBaseline = (): readonly string[] =>
	JSON.parse(readFileSync(BASELINE, 'utf8')) as string[];

const main = (): number => {
	const from = arg('timings');
	if (from === undefined) {
		console.error('spec-duration-budget: --timings=<file> is required.');
		return 2;
	}
	const timings = JSON.parse(readFileSync(from, 'utf8')) as Record<
		string,
		number
	>;
	const baseline = readBaseline();
	const history = (arg('history') ?? '')
		.split(',')
		.filter((file) => file !== '' && existsSync(file))
		.map(
			(file) =>
				JSON.parse(readFileSync(file, 'utf8')) as Record<
					string,
					number
				>,
		);
	const integration = arg('mode') === 'integration';
	const verdict = judgeSpecDurations(timings, new Set(baseline), history);
	console.log(
		`spec-duration-budget: ${String(verdict.slow.length)} spec file(s) over ${String(REPORT_MS)} ms.`,
	);
	for (const { path, ms } of verdict.slow.slice(0, 20)) {
		console.log(`  ${String(ms)} ms  ${path}`);
	}
	if (process.argv.includes('--update')) {
		const stale = new Set(verdict.stale);
		writeFileSync(
			BASELINE,
			`${JSON.stringify(
				baseline.filter((path) => !stale.has(path)),
				null,
				'\t',
			)}\n`,
		);
		console.log(
			`spec-duration-budget: ${String(stale.size)} baseline entr${stale.size === 1 ? 'y' : 'ies'} dropped.`,
		);
		return 0;
	}
	for (const path of verdict.stale) {
		console.warn(
			`  baseline entry no longer needed (run --update): ${path}`,
		);
	}
	if (integration) {
		// Runner noise on code already merged must not turn develop red:
		// report, and let the workflow open or refresh the issue.
		const lines = verdict.offenders.map(
			({ path, ms }) => `- \`${path}\`: ${String(ms)} ms`,
		);
		for (const line of lines) console.warn(`::warning::${line}`);
		const out = arg('report-out');
		if (out !== undefined) {
			writeFileSync(
				out,
				lines.length === 0
					? ''
					: `Spec files over ${String(FAIL_MS)} ms outside the e2e tier and the baseline:\n\n${lines.join('\n')}\n\nMake them fast (in-memory fakes, fake timers, one shared repo) or name them *.e2e.spec.ts.\n`,
			);
		}
		return 0;
	}
	for (const { path, ms } of verdict.failures) {
		console.error(
			`✖ ${path}: ${String(ms)} ms is over ${String(CLEAR_MS)} ms. Make it fast (in-memory fakes, fake timers, one shared repo) or name it *.e2e.spec.ts.`,
		);
	}
	return verdict.failures.length === 0 ? 0 : 1;
};

if (import.meta.main) process.exit(main());
