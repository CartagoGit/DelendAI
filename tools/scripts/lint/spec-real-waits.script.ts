#!/usr/bin/env bun
/**
 * spec-real-waits — a spec outside the e2e tier does not wait for real
 * time and does not rebuild a repository per case (q00045 S1).
 *
 * Counts, per spec file, the lines that sleep, set a literal timer or run
 * `git init`, and compares them with `spec-real-waits.baseline.json`. A file
 * may not exceed its baselined count and a new file has none; the baseline
 * only shrinks (`--update` refuses to raise it). The fix is the shared test
 * kit: `useFakeClock`, `stubAbortSignalTimeout`, `skipLockPauses`,
 * `createGitRepoTemplate`, `createInMemoryGit` from `@delendai/test-kit`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareCodeUnits } from '@delendai/state';

import { repoRoot } from '../lib/monorepo-paths';
import {
	countBaselineGrowth,
	refuseBaselineGrowth,
} from './baseline-growth.helper';
import { countSlowSetup, isFastSpec } from './spec-real-waits.helper';

/** This lint's own spec quotes the patterns it looks for. */
const SELF_SPEC = 'tools/scripts/lint/spec-real-waits.helper.spec.ts';

const BASELINE = join(
	dirname(fileURLToPath(import.meta.url)),
	'spec-real-waits.baseline.json',
);

const main = (): number => {
	const root = repoRoot();
	const files = execFileSync('git', ['ls-files', '*.spec.ts', '*.spec.tsx'], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\n')
		.filter(
			(file) => file !== '' && isFastSpec(file) && file !== SELF_SPEC,
		);
	const current: Record<string, number> = {};
	for (const file of files) {
		const count = countSlowSetup(readFileSync(join(root, file), 'utf8'));
		if (count > 0) current[file] = count;
	}
	const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<
		string,
		number
	>;
	if (process.argv.includes('--update')) {
		const shrunk = Object.fromEntries(
			Object.entries(current).sort(([a], [b]) => compareCodeUnits(a, b)),
		);
		const refusal = refuseBaselineGrowth({
			gate: 'spec-real-waits',
			growth: countBaselineGrowth(current, baseline),
			argv: process.argv,
		});
		if (refusal !== undefined) {
			process.stderr.write(refusal);
			return 1;
		}
		writeFileSync(BASELINE, `${JSON.stringify(shrunk, null, '\t')}\n`);
		console.log(
			`spec-real-waits: baseline written (${String(Object.keys(shrunk).length)} files).`,
		);
		return 0;
	}
	const growth = countBaselineGrowth(current, baseline);
	if (growth.length > 0) {
		console.error(
			`✖ spec-real-waits: ${String(growth.length)} spec file(s) wait for real time or run \`git init\` outside the e2e tier:\n${growth.map((line) => `  ${line}`).join('\n')}\n  Use @delendai/test-kit: useFakeClock, stubAbortSignalTimeout, skipLockPauses, createGitRepoTemplate, createInMemoryGit — or name the spec *.e2e.spec.ts.`,
		);
		return 1;
	}
	console.log(
		`✓ spec-real-waits: ${String(files.length)} fast spec(s), none beyond the baseline (${String(Object.keys(baseline).length)} baselined).`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
