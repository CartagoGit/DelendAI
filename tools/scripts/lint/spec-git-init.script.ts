#!/usr/bin/env bun
/**
 * spec-git-init — a spec outside the e2e tier does not run `git init` per
 * case (q00045 S1). Real waits are `no-sleep-in-specs`.
 *
 * Counts, per spec file, the `git init` lines and compares them with
 * `spec-git-init.baseline.json`. A file may not exceed its baselined count
 * and a new file has none; the baseline only shrinks (`--update` refuses to
 * raise it). The fix is `createGitRepoTemplate` (one build per file, a
 * cheap copy per case) or `createInMemoryGit` from `@delendai/test-kit`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareCodeUnits } from '@delendai/state';

import { repoRoot } from '../lib/monorepo-paths';
import { refuseMissingScanRoots } from './lib/scan-roots.lib';
import {
	countBaselineGrowth,
	refuseBaselineGrowth,
} from './baseline-growth.helper';
import {
	countGitInits,
	isFastSpec,
	isFastTestSupport,
} from './spec-git-init.helper';

/** This lint's own spec quotes the patterns it looks for. */
const SELF_SPEC = 'tools/scripts/lint/spec-git-init.helper.spec.ts';

const BASELINE = join(
	dirname(fileURLToPath(import.meta.url)),
	'spec-git-init.baseline.json',
);

const main = (): number => {
	const root = repoRoot();
	if (
		refuseMissingScanRoots('spec-git-init', root, [
			'packages',
			'plugins',
			'tools',
		])
	)
		return 1;
	const files = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\n')
		.filter(
			(file) =>
				file !== '' &&
				(isFastSpec(file) || isFastTestSupport(file)) &&
				file !== SELF_SPEC,
		);
	const current: Record<string, number> = {};
	for (const file of files) {
		const count = countGitInits(readFileSync(join(root, file), 'utf8'));
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
			gate: 'spec-git-init',
			growth: countBaselineGrowth(current, baseline),
			argv: process.argv,
		});
		if (refusal !== undefined) {
			process.stderr.write(refusal);
			return 1;
		}
		writeFileSync(BASELINE, `${JSON.stringify(shrunk, null, '\t')}\n`);
		console.log(
			`spec-git-init: baseline written (${String(Object.keys(shrunk).length)} files).`,
		);
		return 0;
	}
	const growth = countBaselineGrowth(current, baseline);
	if (growth.length > 0) {
		console.error(
			`✖ spec-git-init: ${String(growth.length)} spec file(s) wait for real time or run \`git init\` outside the e2e tier:\n${growth.map((line) => `  ${line}`).join('\n')}\n  Use createGitRepoTemplate or createInMemoryGit from @delendai/test-kit — or name the spec *.e2e.spec.ts.`,
		);
		return 1;
	}
	console.log(
		`✓ spec-git-init: ${String(files.length)} fast spec(s), none beyond the baseline (${String(Object.keys(baseline).length)} baselined).`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
