#!/usr/bin/env bun
/**
 * spec-timings.script.ts — write each spec file's duration, from the JSON
 * report a full run's merge produced, for the planner to split zones by.
 *
 *   bun tools/scripts/ci/spec-timings.script.ts --from=<report.json> --out=<timings.json>
 *
 * Run by the integration branch's full run, which uploads the result; the
 * pull requests' planner downloads the latest one. Nothing is committed:
 * a timings file every change rewrote would send pull requests back for a
 * file none of them meant to change.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { repoRoot } from '../lib/repo-root';
import { type IVitestJsonReport, timingsFromJsonReport } from './spec-timings';

const arg = (name: string): string | undefined =>
	process.argv
		.find((value) => value.startsWith(`--${name}=`))
		?.slice(name.length + 3);

const main = (): number => {
	const from = arg('from');
	const out = arg('out');
	if (from === undefined || out === undefined) {
		console.error(
			'spec-timings: --from=<report.json> --out=<timings.json> are required.',
		);
		return 2;
	}
	const timings = timingsFromJsonReport(
		JSON.parse(readFileSync(from, 'utf8')) as IVitestJsonReport,
		repoRoot(),
	);
	const count = Object.keys(timings).length;
	if (count === 0) {
		console.error(
			`spec-timings: ${from} holds no spec file with a duration.`,
		);
		return 1;
	}
	writeFileSync(out, `${JSON.stringify(timings)}\n`);
	console.log(
		`spec-timings: ${String(count)} spec file(s) timed, written to ${out}.`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
