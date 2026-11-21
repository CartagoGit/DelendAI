#!/usr/bin/env bun
/**
 * vitest-no-mock-without-isolation — a spec does not `vi.mock` a module in
 * a vitest project that shares one module graph (`isolate: false`) (x01123 S2).
 *
 * With `isolate: false` a mock registered in one file outlives it and leaks
 * into every later file of the worker, so a spec passes or fails depending on
 * its neighbours. The refusal is reported where the mock is written
 * (`file:line`). The fix is dependency injection: take the collaborator as a
 * parameter and pass a fake. `vi.spyOn` is not refused.
 *
 * A zone is the folder of a vitest config that spells `isolate: false`. Calls
 * already there are counted per file in
 * `vitest-no-mock-without-isolation.baseline.json`, which only shrinks.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareCodeUnits } from '@delendai/state';

import { repoRoot } from '../lib/monorepo-paths';
import {
	countBaselineGrowth,
	refuseBaselineGrowth,
} from './baseline-growth.helper';
import { refuseMissingScanRoots } from './lib/scan-roots.lib';

const BASELINE = join(
	dirname(fileURLToPath(import.meta.url)),
	'vitest-no-mock-without-isolation.baseline.json',
);

/** Spec files only; this lint's own spec quotes the call it looks for. */
const SELF_SPEC =
	'tools/scripts/lint/vitest-no-mock-without-isolation.script.spec.ts';

/** Does a vitest config switch module isolation off (comments ignored)? */
export const configDisablesIsolation = (source: string): boolean =>
	/^[^\n/]*\bisolate\s*:\s*false\b/mu.test(source);

/** Folders (repo-relative, posix) whose vitest config disables isolation. */
export const nonIsolatedZones = (
	configs: ReadonlyMap<string, string>,
): readonly string[] =>
	[...configs]
		.filter(([, source]) => configDisablesIsolation(source))
		.map(([file]) => posix.dirname(file))
		.sort(compareCodeUnits);

/** Is `file` a spec inside one of `zones`? */
export const isZoneSpec = (file: string, zones: readonly string[]): boolean =>
	/\.spec\.tsx?$/u.test(file) &&
	zones.some((zone) => file.startsWith(zone === '.' ? '' : `${zone}/`));

/** 1-based lines holding a `vi.mock(` call; `vi.spyOn` and comments do not. */
export const mockCallLines = (source: string): readonly number[] =>
	source
		.split('\n')
		.flatMap((line, index) =>
			/^[^\n/]*\bvi\.mock\s*\(/u.test(line) ? [index + 1] : [],
		);

const main = (): number => {
	const root = repoRoot();
	if (
		refuseMissingScanRoots('vitest-no-mock-without-isolation', root, [
			'packages',
			'plugins',
			'tools',
		])
	)
		return 1;
	const tracked = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\n')
		.filter((file) => file !== '');
	const configs = new Map(
		tracked
			.filter((file) => /(^|\/)vitest[^/]*\.config\.ts$/u.test(file))
			.map(
				(file) =>
					[file, readFileSync(join(root, file), 'utf8')] as const,
			),
	);
	const zones = nonIsolatedZones(configs);
	const current: Record<string, number> = {};
	const where: Record<string, readonly number[]> = {};
	for (const file of tracked) {
		if (file === SELF_SPEC || !isZoneSpec(file, zones)) continue;
		const lines = mockCallLines(readFileSync(join(root, file), 'utf8'));
		if (lines.length === 0) continue;
		current[file] = lines.length;
		where[file] = lines;
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
			gate: 'vitest-no-mock-without-isolation',
			growth: countBaselineGrowth(current, baseline),
			argv: process.argv,
		});
		if (refusal !== undefined) {
			process.stderr.write(refusal);
			return 1;
		}
		writeFileSync(BASELINE, `${JSON.stringify(shrunk, null, '\t')}\n`);
		console.log(
			`vitest-no-mock-without-isolation: baseline written (${String(Object.keys(shrunk).length)} files).`,
		);
		return 0;
	}
	const growth = Object.keys(current).filter(
		(file) => current[file] > (baseline[file] ?? 0),
	);
	if (growth.length > 0) {
		const report = growth.flatMap((file) =>
			(where[file] ?? []).map((line) => `  ${file}:${String(line)}`),
		);
		console.error(
			`✖ vitest-no-mock-without-isolation: vi.mock in a zone with isolate:false leaks into later files:\n${report.join('\n')}\n  Inject the collaborator as a parameter and pass a fake (dependency injection); vi.spyOn is fine.`,
		);
		return 1;
	}
	console.log(
		`✓ vitest-no-mock-without-isolation: ${String(zones.length)} non-isolated zone(s), no vi.mock beyond the baseline (${String(Object.keys(baseline).length)} baselined).`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
