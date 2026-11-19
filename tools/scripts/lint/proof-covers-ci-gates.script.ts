#!/usr/bin/env bun

/**
 * lint:proof-covers-ci-gates — a gate a required CI job runs, and the local
 * proof does not, is a red pull request waiting to happen.
 *
 * MEASURED, 2026-11-18: a pull request needed three CI rounds because
 * `proposal-files-exist` (its baseline counted ignored local files) and
 * `test:budgets:check` (CI-measured timings) each failed only on the forge.
 * The proof reads the static checks out of `ci.yml`, so they cannot drift;
 * every other command a required job runs was left to luck.
 *
 * THE RULE: every `bun run <script>` / `bun tools/scripts/<file>.ts` that a
 * job `delendai-validate` requires runs is either
 *   - read by the proof from `ci.yml` (the static check families), or
 *   - a gate of the proof itself (`PROOF_GATES`), checked against the gates
 *     the proof really names, or
 *   - listed in `CI_ONLY_GATES` with the reason only the forge can run it.
 * A command in none of the three fails; so does a manifest entry CI no
 * longer runs, or one the proof now covers: a manifest that outlives its
 * gate hides the next one.
 *
 * Usage: bun tools/scripts/lint/proof-covers-ci-gates.script.ts
 */
import { readFileSync } from 'node:fs';

import { staticChecksOf } from '../ci/ci-static-steps';
import { gateNamesOf } from '../ci/prove-plan.script';
import { parseWorkflowYaml, type YamlValue } from '../ci/workflow-yaml';
import { lintRepoRoot, refuseMissingScanRoots } from './lib/scan-roots.lib';

const WORKFLOW = '.github/workflows/ci.yml';
const REQUIRED_JOB = 'delendai-validate';

/** Commands the proof runs itself, each with the gate of the proof that runs it. */
export const PROOF_GATES: Readonly<Record<string, string>> = {
	typecheck: 'typecheck',
	'test:shard': 'tests',
	'test:sqlite': 'tests',
};

const NEEDS_BUILD =
	'needs the built tree and the packed artefacts the forge builds in its own job; the proof does not rebuild them';
const LIVE_FORGE = 'asks the live forge, which no local checkout can answer';
const SHARD_PLUMBING =
	'plans or measures the forge test matrix; the proof selects its own specs';
const CI_MEASURED =
	'compares against timings CI measured (.vitest-reports of a full shard run); a local run measured nothing to compare';
const POST_BUILD_VERIFY =
	'verifies the built runtime after the forge build; the proof runs the specs of what changed instead';

/** Commands only the forge can run, each with why. Never silently skipped. */
export const CI_ONLY_GATES: Readonly<Record<string, string>> = {
	'tools/scripts/ci/job-scope.script.ts': SHARD_PLUMBING,
	'tools/scripts/ci/test-zones.script.ts': SHARD_PLUMBING,
	'tools/scripts/ci/test-budget-calibrate.script.ts': CI_MEASURED,
	'test:budgets:check': CI_MEASURED,
	'tools/scripts/ci/spec-timings.script.ts': CI_MEASURED,
	'lint:spec-duration-budget': CI_MEASURED,
	'verify:tools': POST_BUILD_VERIFY,
	'verify:plugin-wiring': POST_BUILD_VERIFY,
	'verify:security': POST_BUILD_VERIFY,
	'verify:cache': POST_BUILD_VERIFY,
	'verify:scaffolds': POST_BUILD_VERIFY,
	'verify:dev-bundles': POST_BUILD_VERIFY,
	'verify:host-capability-packs': POST_BUILD_VERIFY,
	'verify:external-install': NEEDS_BUILD,
	'tools/scripts/ci/rebuild-digest.script.ts': NEEDS_BUILD,
	'sqlite:cutover-ready': NEEDS_BUILD,
	'state:parity': NEEDS_BUILD,
	'build:clean': NEEDS_BUILD,
	build: NEEDS_BUILD,
	site: NEEDS_BUILD,
	'tools/scripts/smoke/cli.script.ts': NEEDS_BUILD,
	'tools/scripts/smoke/pack.script.ts': NEEDS_BUILD,
	'tools/scripts/smoke/installed-cli-plugins.script.ts': NEEDS_BUILD,
	'tools/scripts/metrics/get-baseline.script.ts': NEEDS_BUILD,
	'tools/scripts/metrics/collect-candidate.script.ts': NEEDS_BUILD,
	'tools/scripts/metrics/diff-snapshots.script.ts': NEEDS_BUILD,
	'tools/scripts/lint/branch-protection-guard.script.ts': LIVE_FORGE,
	'lint:ref-lifecycle': LIVE_FORGE,
	'lint:ref-kinds': LIVE_FORGE,
	'lint:namespace-ruleset': LIVE_FORGE,
};

const asRecord = (value: YamlValue | undefined): Record<string, YamlValue> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, YamlValue>)
		: {};

/** The gate a command line runs: a package script, or a script file. */
export const gateOfCommand = (line: string): string | undefined => {
	const match =
		/^bun run ([\w:.-]+)/u.exec(line.trim()) ??
		/^bun (tools\/[\w/.-]+\.ts)/u.exec(line.trim());
	return match?.[1];
};

const gatesOfScript = (script: string): readonly string[] =>
	script
		.split('\n')
		.map(gateOfCommand)
		.filter((gate): gate is string => gate !== undefined);

/** Every gate the jobs `delendai-validate` requires run, in workflow order. */
export const requiredGatesOf = (workflowText: string): readonly string[] => {
	const jobs = asRecord(parseWorkflowYaml(workflowText).jobs);
	const needs = asRecord(jobs[REQUIRED_JOB]).needs;
	const required = Array.isArray(needs) ? needs : [];
	return [
		...new Set(
			required.flatMap((job) => {
				const steps = asRecord(jobs[String(job)]).steps;
				return (Array.isArray(steps) ? steps : []).flatMap((step) => {
					const run = asRecord(step).run;
					return typeof run === 'string' ? gatesOfScript(run) : [];
				});
			}),
		),
	];
};

/** The gates the proof reads out of the workflow's static check families. */
export const staticGatesOf = (workflowText: string): ReadonlySet<string> =>
	new Set(
		staticChecksOf(workflowText, 'BASE', 'develop').flatMap((check) =>
			gatesOfScript(check.script),
		),
	);

/** What the proof, the manifest and the workflow say, judged. Pure. */
export const judgeProofCoverage = (input: {
	readonly required: readonly string[];
	readonly staticGates: ReadonlySet<string>;
	readonly proofGateNames: readonly string[];
	readonly proofGates?: Readonly<Record<string, string>>;
	readonly ciOnly?: Readonly<Record<string, string>>;
}): readonly string[] => {
	const proofGates = input.proofGates ?? PROOF_GATES;
	const ciOnly = input.ciOnly ?? CI_ONLY_GATES;
	const required = new Set(input.required);
	const problems: string[] = [];
	for (const gate of input.required) {
		if (input.staticGates.has(gate) || gate in proofGates) continue;
		if (gate in ciOnly) continue;
		problems.push(
			`${gate}: a required CI job runs it and the proof has no step for it. Add a proof step, or list it in CI_ONLY_GATES with the reason only the forge can run it.`,
		);
	}
	for (const [gate, name] of Object.entries(proofGates)) {
		if (!input.proofGateNames.includes(name)) {
			problems.push(
				`${gate}: PROOF_GATES says the proof runs it as gate \`${name}\`, which the proof does not name.`,
			);
		}
	}
	for (const [gate, reason] of Object.entries(ciOnly)) {
		if (reason.trim().length === 0) {
			problems.push(`${gate}: a CI-only gate carries no reason.`);
		}
		if (!required.has(gate)) {
			problems.push(
				`${gate}: listed as CI-only but no required CI job runs it; drop the entry.`,
			);
		} else if (input.staticGates.has(gate) || gate in proofGates) {
			problems.push(
				`${gate}: listed as CI-only but the proof runs it; drop the entry.`,
			);
		}
	}
	return problems;
};

const main = (): number => {
	const text = readFileSync(WORKFLOW, 'utf8');
	const problems = judgeProofCoverage({
		required: requiredGatesOf(text),
		staticGates: staticGatesOf(text),
		proofGateNames: gateNamesOf(['packages/core/src/x.ts'], false, 'BASE'),
	});
	if (problems.length > 0) {
		process.stderr.write(
			`✖ proof-covers-ci-gates: ${String(problems.length)} gate(s) the proof and CI disagree on:\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
		);
		return 1;
	}
	process.stderr.write(
		'✓ proof-covers-ci-gates: every gate a required CI job runs is in the proof or listed CI-only with its reason.\n',
	);
	return 0;
};

if (import.meta.main) {
	if (
		refuseMissingScanRoots(
			'proof-covers-ci-gates',
			lintRepoRoot(import.meta.url),
			['.github/workflows'],
		)
	)
		process.exit(1);
	process.exit(main());
}
