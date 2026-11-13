#!/usr/bin/env bun
/**
 * parity-sampler — random operations through the in-memory and the SQLite
 * state registries, and a report of where they part.
 *
 * The facade samples parity while a process runs; this is the same
 * question asked on its own, at a size no test wants to pay on every
 * push, with the three kinds of divergence counted apart (see
 * `parity-sampler.interface.ts` in `@delendai/state`).
 *
 *   bun tools/scripts/state/parity-sampler.script.ts \
 *     [--runs=20] [--operations=50] [--seed=<n>] [--out=<file>] [--strict]
 *
 * Writes `state-parity-report.json` (under the cache, unless `--out`) and
 * prints one line. Exits 0 unless `--strict` and something diverged.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { defineInMemoryStateRegistry, sampleParity } from '@delendai/state';
import { defineSqliteStateRegistry } from '@delendai/state-sqlite';

import { repoRoot } from '../lib/repo-root';
import { diverged, numberArg, REPORT_FILE, summarise } from './parity-report';

const DEFAULT_RUNS = 20;
const DEFAULT_OPERATIONS = 50;

const main = (): number => {
	const argv = process.argv.slice(2);
	const report = sampleParity({
		runs: numberArg(argv, 'runs', DEFAULT_RUNS),
		operationsPerRun: numberArg(argv, 'operations', DEFAULT_OPERATIONS),
		seed: numberArg(argv, 'seed', Math.floor(Date.now() / 1000)),
		primary: defineInMemoryStateRegistry,
		// A private store per registry: nothing reads it back.
		shadow: (options) =>
			defineSqliteStateRegistry({ ...options, path: ':memory:' }),
	});
	const named = argv.find((arg) => arg.startsWith('--out='))?.slice(6);
	const out =
		named === undefined
			? join(repoRoot(), '.cache', 'delendai', REPORT_FILE)
			: resolve(named);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(report, null, '\t')}\n`);
	console.log(`${summarise(report)} Report: ${out}`);
	return argv.includes('--strict') && diverged(report) ? 1 : 0;
};

if (import.meta.main) process.exit(main());
