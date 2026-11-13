#!/usr/bin/env bun
/**
 * bun-suite-has-a-ceiling.script.ts — a bun suite states its timeout.
 *
 * `bun test` defaults to FIVE SECONDS. The vitest projects each made a
 * deliberate decision and wrote it down — 30_000, because a spec that is
 * fast on an idle machine pays several times that under the contention
 * of a full run (x00542 S2). The bun suites inherited no such decision
 * and sat on the language default, so that reasoning covered one runner
 * out of two.
 *
 * Measured: `real-tree-projection` reconciles every markdown file under
 * `docs/delendai/proposals`. That tree was ~800 files when the spec was
 * written and is 968 now, and the run drifted from comfortably inside
 * the default to 5,398 ms against it. The suite failed on SIZE rather
 * than on a defect — and would have failed more often as the project did
 * exactly what it is supposed to do.
 *
 * `bunfig.toml` looks like the right home for it and is NOT: the
 * `[test] timeout` key is ignored by the bun in use here, which was
 * verified before relying on it. The ceiling therefore lives where the
 * suite is invoked, and this rule keeps it there.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	BUN_TEST_PATTERN,
	REQUIRED_TIMEOUT_FLAG,
} from './bun-suite-has-a-ceiling.constant';
import type { ICeilingFinding } from './bun-suite-has-a-ceiling.interface';

/** Every `bun test` script that does not state a timeout. */
export const findUncappedSuites = (
	scripts: Readonly<Record<string, string>>,
): readonly ICeilingFinding[] =>
	Object.entries(scripts)
		.filter(
			([, command]) =>
				BUN_TEST_PATTERN.test(command) &&
				!command.includes(REQUIRED_TIMEOUT_FLAG),
		)
		.map(([name, command]) => ({ script: name, command }));

if (import.meta.main) {
	const manifest = JSON.parse(
		readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
	) as { readonly scripts?: Record<string, string> };
	const findings = findUncappedSuites(manifest.scripts ?? {});
	if (findings.length === 0) {
		console.log(
			'✓ bun-suite-has-a-ceiling: every bun suite states its timeout.',
		);
		process.exit(0);
	}
	console.error(
		[
			`✖ bun-suite-has-a-ceiling: ${String(findings.length)} bun suite(s) run on the five-second default.`,
			'',
			...findings.map(
				(finding) => `  ${finding.script}: ${finding.command}`,
			),
			'',
			'  `bun test` defaults to 5s, and a suite that grows with the project',
			'  will eventually fail on size rather than on a defect.',
			'',
			`  fix: add \`${REQUIRED_TIMEOUT_FLAG} <ms>\`, matching the vitest ceiling`,
			'  unless there is a measurement saying otherwise.',
		].join('\n'),
	);
	process.exit(1);
}
