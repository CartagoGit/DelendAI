#!/usr/bin/env bun
/**
 * workflow-runner-bootstrap.script.ts
 *
 * A job may not run a command its runner cannot run.
 *
 * Two failures of the same shape, twice now, both of them silent until
 * a run went red for a reason that had nothing to do with the code:
 *
 *   - `delendai-validate` (2026-09-10) declared `runs-on: ubuntu-latest`
 *     and two `run: bun …` steps, with no checkout and no setup-bun. It
 *     exited 127 with `bun: command not found` on every run — and since
 *     it is the ONE required status check on `develop`, nothing could
 *     merge into develop at all for as long as it stood.
 *   - `develop-protection-live` (same day) checked out and installed
 *     Bun but ran a script whose import graph needed `node_modules`.
 *
 * The sibling gate `workflow-local-action-bootstrap.script.ts` catches
 * "a local composite action used before any checkout". This one catches
 * the more basic version: the toolchain the step's own command line
 * names is never installed, or the repo the command reads from is never
 * fetched. Both are one missing line of YAML, both produce an error
 * message that points nowhere near the cause, and neither is visible in
 * review because the job *looks* complete.
 *
 * The rules
 * ---------
 *   1. A `run:` step whose command invokes `bun`/`bunx` must be preceded,
 *      in the same job, by a step that installs Bun.
 *   2. A `run:` step whose command reads the repository (a `bun run`
 *      package script, or a path under a known top-level source
 *      directory) must be preceded, in the same job, by a checkout.
 *
 * "Preceded by" is positional on purpose. A checkout after the step
 * that needed it is not a checkout, in the same way that the composite
 * action's own internal checkout cannot bootstrap the composite action.
 *
 * Local composite actions (`uses: ./…`) are resolved: the action's own
 * `action.yml` is read and its steps contribute whatever they provide.
 * That is what lets `./.github/actions/setup-bun-repo` satisfy both
 * rules for the twenty jobs in `ci.yml` that use it, without this gate
 * having to hardcode that action's name.
 *
 * Architecture (SOLID / testability):
 *   - `analyseJobs(workflow, source, resolveLocalAction)` — pure.
 *   - `readLocalActionProvides(uses)` — the only I/O for resolution.
 *   - `main()` — CLI shell.
 *
 * Exit codes: 0 — every job can run what it declares. 1 — at least one
 * cannot.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseWorkflowYaml, type YamlValue } from '../ci/workflow-yaml';
import { repoRoot } from '../lib/repo-root';

export const WORKFLOWS_DIR = '.github/workflows';

/** What a step (or a resolved composite action) makes available. */
export interface IProvides {
	readonly checkout: boolean;
	readonly bun: boolean;
}

/** The tool a step needed and the job never installed. */
export type IMissingBootstrap = 'actions/checkout' | 'oven-sh/setup-bun';

export interface IRunnerBootstrapFinding {
	readonly workflow: string;
	readonly job: string;
	/** Step name, or `step #N` when the step is unnamed. */
	readonly step: string;
	readonly missing: IMissingBootstrap;
	/** The single command line that triggered the finding. */
	readonly command: string;
}

/** Resolves `uses: ./path` to what that composite action provides. */
export type ILocalActionResolver = (uses: string) => IProvides | undefined;

const CHECKOUT_RE = /^actions\/checkout(@|$)/u;
const SETUP_BUN_RE = /^oven-sh\/setup-bun(@|$)/u;

/**
 * `bun` or `bunx` in command position: at the start of the command, or
 * after a newline, pipe, `&&`, `||`, `;` or subshell paren. Requiring a
 * command position keeps `echo "bun run test"` and `# bun …` out of the
 * findings.
 */
const BUN_INVOCATION_RE = /(?:^|[\n;&|(])[ \t]*(bunx?)\b/u;

/**
 * Top-level directories whose presence in a command means the command
 * reads the checked-out repository. Kept explicit rather than derived
 * from the tree so that adding a directory is a deliberate edit.
 */
const REPO_DIRS: readonly string[] = [
	'tools',
	'packages',
	'plugins',
	'apps',
	'extensions',
	'docs',
	'scripts',
	'.github',
];

/**
 * `true` when the command can only work against a checked-out repo:
 * either it runs a package.json script (`bun run …`, `npm run …`) or it
 * names a path under one of the repo's source directories.
 */
const readsRepository = (command: string): boolean => {
	if (
		/(?:^|[\n;&|(])[ \t]*(?:bun|npm|pnpm|yarn)[ \t]+run[ \t]/u.test(command)
	)
		return true;
	if (/(?:^|[\n;&|(])[ \t]*bun[ \t]+install\b/u.test(command)) return true;
	for (const dir of REPO_DIRS) {
		const escaped = dir.replace(/\./gu, '\\.');
		if (new RegExp(`(?:^|[\\s'"(])\\.?/?${escaped}/`, 'u').test(command))
			return true;
	}
	return false;
};

/** The first line of `command` that matches `probe`, for the message. */
const offendingLine = (command: string, probe: RegExp): string => {
	for (const raw of command.split('\n')) {
		const line = raw.trim();
		if (line.length === 0 || line.startsWith('#')) continue;
		if (probe.test(`\n${line}`)) return line;
	}
	return command.split('\n')[0]?.trim() ?? command;
};

const asRecord = (value: YamlValue | undefined): Record<string, YamlValue> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, YamlValue>)
		: {};

const asString = (value: YamlValue | undefined): string | undefined =>
	typeof value === 'string' ? value : undefined;

/**
 * Fold one step into the running "what has this job got so far" state.
 * A local action contributes whatever the resolver says it contributes;
 * an unresolvable one contributes nothing, which is the conservative
 * direction (it can only produce a finding the author must look at).
 */
const providedByStep = (
	uses: string,
	resolveLocalAction: ILocalActionResolver,
): IProvides => {
	if (CHECKOUT_RE.test(uses)) return { checkout: true, bun: false };
	if (SETUP_BUN_RE.test(uses)) return { checkout: false, bun: true };
	if (uses.startsWith('./'))
		return resolveLocalAction(uses) ?? { checkout: false, bun: false };
	return { checkout: false, bun: false };
};

/**
 * Walk a workflow's jobs in step order and report every `run:` step
 * that needs a toolchain the job has not installed yet.
 */
export const analyseJobs = (
	workflow: string,
	source: string,
	resolveLocalAction: ILocalActionResolver = () => undefined,
): readonly IRunnerBootstrapFinding[] => {
	let doc: Record<string, YamlValue>;
	try {
		doc = parseWorkflowYaml(source);
	} catch {
		// Unparseable YAML is `lint:workflow-yaml`'s gate, not this one.
		return [];
	}
	const jobs = asRecord(doc['jobs']);
	const findings: IRunnerBootstrapFinding[] = [];

	for (const [jobName, rawJob] of Object.entries(jobs)) {
		const job = asRecord(rawJob);
		const steps = Array.isArray(job['steps']) ? job['steps'] : [];
		let hasCheckout = false;
		let hasBun = false;

		steps.forEach((rawStep, index) => {
			const step = asRecord(rawStep as YamlValue);
			const uses = asString(step['uses']);
			if (uses !== undefined) {
				const provides = providedByStep(uses, resolveLocalAction);
				hasCheckout = hasCheckout || provides.checkout;
				hasBun = hasBun || provides.bun;
				return;
			}
			const command = asString(step['run']);
			if (command === undefined) return;
			const label =
				asString(step['name']) ?? `step #${String(index + 1)}`;

			if (!hasBun && BUN_INVOCATION_RE.test(`\n${command}`)) {
				findings.push({
					workflow,
					job: jobName,
					step: label,
					missing: 'oven-sh/setup-bun',
					command: offendingLine(command, BUN_INVOCATION_RE),
				});
			}
			if (!hasCheckout && readsRepository(command)) {
				findings.push({
					workflow,
					job: jobName,
					step: label,
					missing: 'actions/checkout',
					command: offendingLine(command, BUN_INVOCATION_RE),
				});
			}
		});
	}
	return findings;
};

/**
 * Read a local composite action's `action.yml` and report what its own
 * steps provide. Returns `undefined` when the action cannot be read —
 * the caller then assumes it provides nothing.
 */
export const readLocalActionProvides = (
	root: string,
	uses: string,
): IProvides | undefined => {
	const rel = uses.replace(/^\.\//u, '').split('@')[0] ?? '';
	for (const file of ['action.yml', 'action.yaml']) {
		let source: string;
		try {
			source = readFileSync(join(root, rel, file), 'utf8');
		} catch {
			continue;
		}
		let doc: Record<string, YamlValue>;
		try {
			doc = parseWorkflowYaml(source);
		} catch {
			return undefined;
		}
		const runs = asRecord(doc['runs']);
		const steps = Array.isArray(runs['steps']) ? runs['steps'] : [];
		let checkout = false;
		let bun = false;
		for (const rawStep of steps) {
			const inner = asString(asRecord(rawStep as YamlValue)['uses']);
			if (inner === undefined) continue;
			if (CHECKOUT_RE.test(inner)) checkout = true;
			if (SETUP_BUN_RE.test(inner)) bun = true;
		}
		return { checkout, bun };
	}
	return undefined;
};

const HINT: Record<IMissingBootstrap, string> = {
	'actions/checkout':
		'add `- uses: actions/checkout@v7` before it (the command reads files from this repo)',
	'oven-sh/setup-bun':
		'add `- uses: oven-sh/setup-bun@v2` with `bun-version: 1.4.2` before it (the runner image has no bun)',
};

export const formatReport = (
	findings: readonly IRunnerBootstrapFinding[],
): string => {
	const lines = [
		`✖ workflow-runner-bootstrap: ${String(findings.length)} step(s) run a command their job never bootstrapped:`,
		'',
	];
	for (const f of findings) {
		lines.push(
			`  ${f.workflow} → job "${f.job}" → step "${f.step}"`,
			`      runs:    ${f.command}`,
			`      missing: ${f.missing} — ${HINT[f.missing]}`,
			'',
		);
	}
	lines.push(
		'  A job that cannot run its own command does not fail with a useful',
		'  message: it exits 127, or dies resolving a module. Both look like the',
		'  code broke. Neither did.',
	);
	return lines.join('\n');
};

export const main = (): number => {
	const root = repoRoot();
	const dir = join(root, WORKFLOWS_DIR);
	const cache = new Map<string, IProvides | undefined>();
	const resolve: ILocalActionResolver = (uses) => {
		if (!cache.has(uses))
			cache.set(uses, readLocalActionProvides(root, uses));
		return cache.get(uses);
	};

	let entries: readonly string[];
	try {
		entries = readdirSync(dir);
	} catch {
		console.error(
			`✖ workflow-runner-bootstrap: cannot read ${WORKFLOWS_DIR}. A gate that cannot read its subject has not verified anything.`,
		);
		return 1;
	}

	const findings: IRunnerBootstrapFinding[] = [];
	const names = entries
		.filter((e) => e.endsWith('.yml') || e.endsWith('.yaml'))
		.sort();
	for (const name of names) {
		findings.push(
			...analyseJobs(
				name,
				readFileSync(join(dir, name), 'utf8'),
				resolve,
			),
		);
	}

	if (findings.length === 0) {
		console.log(
			`✓ workflow-runner-bootstrap: ${String(names.length)} workflow(s) — every job installs what its steps run.`,
		);
		return 0;
	}
	console.error(formatReport(findings));
	return 1;
};

if (import.meta.main) {
	process.exit(main());
}
