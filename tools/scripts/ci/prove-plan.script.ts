#!/usr/bin/env bun
/**
 * prove-plan.script.ts — prove a change before it is pushed, by the plan
 * CI will follow for it.
 *
 *   bun run prove [--base=<ref>]     (default base: origin/develop)
 *
 * The local proof used to be a second, bigger CI: every zone, every lint
 * preset, about 45 minutes a unit, and then the forge ran its own plan
 * anyway. This asks the zone planner for the same matrix CI reads, runs
 * what each job would run (the specs the imports reach, the specs that
 * read a changed file, or the zone unfiltered), then the typecheck and the
 * repository-wide gates every pull request runs. It prints the plan, the
 * time of each step and the verdict, and seals a passing proof of a clean
 * tree for the pull request to check (`./proof.ts`).
 */
import { execFileSync, spawnSync } from 'node:child_process';

import type { IProofStep } from './proof.interface';
import { planDigestOf, recordProof } from './proof';
import type { IProveJob } from './prove-plan.interface';

const arg = (name: string): string | undefined =>
	process.argv
		.find((value) => value.startsWith(`--${name}=`))
		?.slice(name.length + 3);

/** What one matrix job runs, as the vitest arguments CI would pass. */
export const vitestArgsOf = (
	job: IProveJob,
	base: string,
): readonly string[] | undefined => {
	if (!job.run) return undefined;
	if (job.filter === 'readers')
		return job.readers.split(/\s+/u).filter(Boolean);
	const paths = job.paths.split(/\s+/u).filter(Boolean);
	return job.filter === 'changed'
		? [...paths, `--shard=${job.shard}`, '--changed', base]
		: [...paths, `--shard=${job.shard}`];
};

/** The repository-wide gates every pull request runs, cheapest first. */
export const PROVE_GATES: readonly (readonly string[])[] = [
	['bun', 'run', 'typecheck'],
	['bun', 'tools/scripts/lint/biome-baseline.script.ts'],
	['bun', 'run', 'lint:architecture'],
	['bun', 'run', 'lint:proposals'],
];

const steps: IProofStep[] = [];

const step = (label: string, command: readonly string[]): boolean => {
	const started = Date.now();
	const [bin = 'bun', ...rest] = command;
	const result = spawnSync(bin, rest, {
		stdio: ['ignore', 'ignore', 'inherit'],
		env: { ...process.env, VITEST_CHANGED_RUN: 'true' },
	});
	const ok = result.status === 0;
	const seconds = Math.round((Date.now() - started) / 1000);
	steps.push({ name: label, ok, seconds });
	console.log(
		`prove: ${ok ? 'ok  ' : 'FAIL'} ${label} (${String(seconds)}s)`,
	);
	return ok;
};

const git = (args: readonly string[]): string =>
	execFileSync('git', args, { encoding: 'utf8' }).trim();

const main = (): number => {
	const base = execFileSync(
		'git',
		['merge-base', arg('base') ?? 'origin/develop', 'HEAD'],
		{ encoding: 'utf8' },
	).trim();
	const matrix = execFileSync(
		'bun',
		['tools/scripts/ci/test-zones.script.ts', '--matrix', `--base=${base}`],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
	);
	const jobs = JSON.parse(matrix) as readonly IProveJob[];
	const started = Date.now();
	let ok = true;
	for (const command of PROVE_GATES) {
		ok = step(command.slice(1).join(' '), command) && ok;
	}
	for (const job of jobs) {
		const args = vitestArgsOf(job, base);
		if (args === undefined) continue;
		ok =
			step(`tests: ${job.name} (${job.filter})`, [
				'npx',
				'vitest',
				'run',
				...args,
				'--passWithNoTests',
			]) && ok;
	}
	const seconds = Math.round((Date.now() - started) / 1000);
	console.log(
		`prove: ${ok ? 'PROVED' : 'NOT PROVED'} in ${String(seconds)}s against ${base.slice(0, 9)}`,
	);
	// The seal the pull request checks instead of running this again. A
	// dirty tree proves nothing about the commit, so it seals nothing.
	if (
		ok &&
		git(['status', '--porcelain']).length === 0 &&
		!process.argv.includes('--no-seal')
	) {
		const ref = recordProof({
			head: git(['rev-parse', 'HEAD']),
			tree: git(['rev-parse', 'HEAD^{tree}']),
			base,
			planDigest: planDigestOf(matrix),
			ok,
			steps,
			seconds,
			agent: process.env.DELENDAI_AGENT_ID ?? 'unknown',
			at: new Date().toISOString(),
		});
		console.log(`prove: sealed as ${ref}`);
	}
	return ok ? 0 : 1;
};

if (import.meta.main) process.exit(main());
