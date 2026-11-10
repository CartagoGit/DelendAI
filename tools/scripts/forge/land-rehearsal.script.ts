#!/usr/bin/env bun
/**
 * land-rehearsal.script.ts — rehearse a land batch before it is live.
 *
 *   bun run forge:rehearse-land [-- --heads=<sha,sha> --timeout=<s> --keep-going]
 *
 * Builds the batch of `--heads` (default: HEAD) on the integration tip the
 * way `land` does (scratch worktree, shared dependencies linked, merges,
 * one regeneration), without pushing, then runs on it:
 *
 *   - the installed pre-push hooks, with the batch ref on stdin as git
 *     writes it, in a CI environment (no agent markers);
 *   - the static and governance lint jobs the plan selects for the batch.
 *
 * Every failure is reported in one pass. Nothing reaches the remote.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

import {
	batchRefOf,
	isAgentEnvironmentVariable,
	landConfigFromPolicy,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { STATIC_CHECK_JOBS, staticChecksOf } from '../ci/ci-static-steps';
import { jobMustRun, planInputSince } from '../ci/job-scope.script';
import {
	declaredBranches,
	declaredIntegrationRef,
} from '../lib/declared-branches';
import { readDevelopmentConfig } from './land-policy';
import { assembleTrain, discardTrain, regenerateWith } from './train-assembly';
import {
	GENERATED_REFRESH_COMMANDS,
	REGENERATED_PROJECTIONS,
} from './land-derived.constant';
import { prePushStdin, rehearseGates, reportOf } from './land-rehearsal';
import { throwawayClone } from './land-rehearsal-clone';
import type { IRehearsalGate } from './land-rehearsal.interface';

/**
 * The jobs rehearsed: the static and governance lints. `quality-gate` and
 * the token measurement build the whole repository (minutes); the batch's
 * own run proves them, and a rehearsal that costs as much as the run is
 * not run.
 */
const REHEARSED_JOBS: ReadonlySet<string> = new Set(
	STATIC_CHECK_JOBS.filter(
		(job) => job !== 'quality-gate' && job !== 'tokens-budget-real',
	),
);

const arg = (name: string): string | undefined =>
	process.argv
		.find((value) => value.startsWith(`--${name}=`))
		?.slice(name.length + 3);

const git = (cwd: string, args: readonly string[]): string =>
	execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();

/** A CI job's environment: the agent's markers are not in it. */
const ciEnvironment = (): NodeJS.ProcessEnv => {
	const env: NodeJS.ProcessEnv = { ...process.env, CI: 'true' };
	for (const name of Object.keys(env)) {
		if (isAgentEnvironmentVariable(name)) delete env[name];
	}
	return env;
};

const main = async (): Promise<number> => {
	const root = process.cwd();
	const started = Date.now();
	const policy = resolveDevelopmentPolicy(readDevelopmentConfig());
	const tipRef = declaredIntegrationRef();
	const tipSha = git(root, ['rev-parse', tipRef]);
	const heads = (arg('heads') ?? 'HEAD')
		.split(',')
		.filter((head) => head.length > 0)
		.map((head) => git(root, ['rev-parse', head]));
	const members = heads.map((headSha, index) => ({
		number: index + 1,
		headRef: `rehearsal/${String(index + 1)}`,
		headSha,
	}));
	const ref = batchRefOf(
		landConfigFromPolicy(policy).batchPrefix,
		members.map((member) => member.number),
	);
	const timeoutMs = (Number(arg('timeout')) || 900) * 1000;
	// Its own clone: nothing it builds lands in the one it was run from.
	const clone = throwawayClone(root, heads);
	const built = assembleTrain({
		root: clone.dir,
		remote: clone.dir,
		tipSha,
		ref,
		members,
		derived: REGENERATED_PROJECTIONS,
		regenerate: regenerateWith(GENERATED_REFRESH_COMMANDS),
		rehearsal: true,
	});
	const { scratch } = built;
	if (
		scratch === undefined ||
		built.conflicting.length > 0 ||
		built.pushFailure !== undefined
	) {
		console.error(
			`rehearse-land: the batch could not be built: ${built.pushFailure ?? (built.conflicting.length > 0 ? `${built.conflicting.map((n) => `#${String(n)}`).join(', ')} conflict` : 'no worktree')}`,
		);
		clone.dispose();
		return 1;
	}
	try {
		const trainSha = git(scratch, ['rev-parse', 'HEAD']);
		// Detached, and no branch: a rehearsal is a scratch, and the owner
		// keeps machine refs out of local clones. The batch's name still
		// reaches the pre-push gate through its stdin below.
		process.chdir(scratch);
		const plan = planInputSince(tipSha);
		const checks = staticChecksOf(
			readFileSync('.github/workflows/ci.yml', 'utf8'),
			tipSha,
			declaredBranches().integration,
		).filter(
			(check) =>
				REHEARSED_JOBS.has(check.job) &&
				jobMustRun({ ...plan, job: check.job }),
		);
		// The hooks and the remote of the clone the rehearsal stands in for.
		const hook = git(root, [
			'rev-parse',
			'--path-format=absolute',
			'--git-path',
			'hooks/pre-push',
		]);
		const remote = git(root, ['remote', 'get-url', 'origin']);
		const gates: IRehearsalGate[] = [
			{
				label: 'pre-push hooks',
				script: `"${hook}" origin "${remote}"`,
				stdin: prePushStdin(ref, trainSha),
			},
			...checks.map((check) => ({
				label: check.job,
				script: check.script,
			})),
		];
		const results = await rehearseGates({
			gates,
			cwd: scratch,
			env: ciEnvironment(),
			limit: Math.max(
				1,
				Number(process.env.PROVE_PARALLEL) ||
					Math.floor(availableParallelism() / 2),
			),
			timeoutMs,
		});
		for (const line of reportOf(results, ref)) console.log(line);
		console.log(
			`rehearse-land: ${String(results.length)} gate(s) in ${String(Math.round((Date.now() - started) / 1000))}s`,
		);
		return results.every((result) => result.ok) ? 0 : 1;
	} finally {
		process.chdir(root);
		discardTrain(clone.dir, scratch);
		clone.dispose();
	}
};

if (import.meta.main) process.exit(await main());
