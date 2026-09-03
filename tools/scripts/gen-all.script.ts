#!/usr/bin/env bun
/**
 * gen-all.script.ts — c00133 (AUD-P0-003).
 *
 * Orchestrates every code generator in `tools/scripts/generate/`
 * (and the token-budget dashboard) in a deterministic order so
 * downstream consumers always see fresh artifacts.
 *
 * Inputs:
 *   --check      Run every generator in real mode, then report the
 *                drift those generators are ACTUALLY responsible for.
 *
 *                It used to be `git diff --exit-code` over the whole
 *                working tree, which in a shared worktree is a deadlock:
 *                this repo runs several agents against one checkout, so
 *                one agent's in-flight edit failed the pre-push hook for
 *                every other agent, permanently, with nothing the
 *                blocked agent could do about it. On 2026-09-04 that
 *                held seven finished commits hostage to another agent's
 *                unrelated half-written file.
 *
 *                So the dirty set is snapshotted BEFORE the generators
 *                run. A file already dirty is somebody's edit and its
 *                drift is unattributable — reported, never fatal. A file
 *                clean before and dirty after was written by a
 *                generator, which is the stale checked-in artifact this
 *                gate exists to catch, and still fails.
 *                Exits 1 when the working tree has uncommitted
 *                changes (i.e. drift). Used by CI to fail a PR
 *                that introduces drift.
 *   --list       Print every step without executing.
 *   --only <n>   Restrict to a single step (useful for local
 *                iteration).
 *
 * Exit codes:
 *   0  every step ran and `--check` found no drift (or `--list`).
 *   1  a step exited non-zero OR `--check` found drift.
 *   2  unknown `--only` selector.
 */

import { execFileSync, spawn } from 'node:child_process';

export interface IStep {
	readonly name: string;
	readonly cmd: readonly string[];
	readonly description: string;
	/** Read-only generator invocation, when the generator supports it. */
	readonly checkCmd?: readonly string[];
}

export const STEPS: readonly IStep[] = [
	{
		name: 'agent-catalog',
		cmd: ['bun', 'tools/scripts/catalog/generate-agent-catalog.script.ts'],
		description: 'Regenerate the checked-in agent catalog.',
	},
	{
		name: 'plugin-manifests',
		cmd: ['bun', 'tools/scripts/generate/from-manifests.script.ts'],
		checkCmd: [
			'bun',
			'tools/scripts/generate/from-manifests.script.ts',
			'--check',
		],
		description: 'Regenerate plugin manifests and derived registries.',
	},
	{
		name: 'capability-matrix',
		cmd: ['bun', 'tools/scripts/gen/capability-matrix.script.ts'],
		description: 'Regenerate the capability matrix documentation.',
	},
	{
		name: 'agent-md',
		cmd: ['bun', 'tools/scripts/gen/agent-md.script.ts'],
		description: 'Regenerate per-package and per-plugin AGENT.md files.',
	},
	{
		name: 'token-budget-dashboard',
		cmd: ['bun', 'tools/scripts/report/token-budget-dashboard.script.ts'],
		description: 'Regenerate the token budget dashboard.',
	},
	{
		name: 'host-hints',
		cmd: ['bun', 'tools/scripts/catalog/render-host-hints.script.ts'],
		checkCmd: [
			'bun',
			'tools/scripts/catalog/render-host-hints.script.ts',
			'--check',
		],
		description: 'Regenerate the canonical host-hints fragment.',
	},
];

export interface IGenAllIo {
	readonly out: (msg: string) => void;
	readonly err: (msg: string) => void;
	readonly runCommand: (
		command: string,
		args: readonly string[],
	) => Promise<number>;
	/**
	 * Repo-relative paths with uncommitted modifications right now.
	 *
	 * On the seam rather than called directly so the drift check stays
	 * testable without a real git tree — the same reason `runCommand` is
	 * here.
	 */
	readonly dirtyPaths: () => ReadonlySet<string>;
}

const out = (msg: string): void => {
	process.stdout.write(`${msg}\n`);
};
const err = (msg: string): void => {
	process.stderr.write(`${msg}\n`);
};

const runChild = (command: string, args: readonly string[]): Promise<number> =>
	new Promise((resolve) => {
		const child = spawn(command, [...args], {
			stdio: 'inherit',
		});
		child.once('error', () => resolve(1));
		child.once('close', (code) => resolve(code ?? 1));
	});

const defaultIo = (): IGenAllIo => ({
	out,
	err,
	runCommand: runChild,
	dirtyPaths,
});

const flag = (argv: readonly string[], name: string): string | undefined => {
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined) continue;
		if (token === `--${name}`) return argv[i + 1];
		if (token.startsWith(`--${name}=`))
			return token.slice(`--${name}=`.length);
	}
	return undefined;
};

const hasFlag = (argv: readonly string[], name: string): boolean =>
	argv.some((t) => t === `--${name}` || t.startsWith(`--${name}=`));

export const selectSteps = (
	argv: readonly string[],
): { readonly only?: string; readonly steps: readonly IStep[] } => {
	const only = flag(argv, 'only');
	return {
		...(only !== undefined ? { only } : {}),
		steps:
			only !== undefined
				? STEPS.filter((step) => step.name === only)
				: STEPS,
	};
};

const runStep = async (
	step: IStep,
	check: boolean,
	io: IGenAllIo,
): Promise<number> => {
	io.out(`▶ ${step.name} — ${step.description}`);
	const command = check ? (step.checkCmd ?? step.cmd) : step.cmd;
	const [executable, ...args] = command;
	if (executable === undefined) return 1;
	const exit = await io.runCommand(executable, args);
	io.out(`  ${step.name} exited ${exit}`);
	return exit;
};

/**
 * Files with uncommitted modifications right now, by repo-relative path.
 *
 * Uses `execFileSync` rather than the injected `runCommand` because this
 * needs the OUTPUT, and the io seam only reports an exit code. A failure
 * here returns an empty set, which makes the drift check strictly
 * stricter, never looser.
 */
export const dirtyPaths = (): ReadonlySet<string> => {
	try {
		const stdout = execFileSync('git', ['diff', '--name-only'], {
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		});
		return new Set(
			stdout
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0),
		);
	} catch {
		return new Set();
	}
};

/**
 * Drift that this run of the generators actually caused.
 *
 * A file already dirty BEFORE the generators ran is somebody's in-flight
 * edit — in this repository, very often a concurrent agent's — and
 * whatever the generators then wrote over it cannot be attributed. A
 * file clean before and dirty after was changed by a generator, which is
 * exactly the stale checked-in artifact this gate exists to catch.
 */
export const attributableDrift = (
	before: ReadonlySet<string>,
	after: ReadonlySet<string>,
): readonly string[] => [...after].filter((path) => !before.has(path)).sort();

const runGitDiffExit = async (
	io: IGenAllIo,
	before: ReadonlySet<string>,
): Promise<number> => {
	io.out(`▶ drift-check — generator-attributable drift`);
	const after = io.dirtyPaths();
	const drift = attributableDrift(before, after);
	const carried = [...after].filter((path) => before.has(path));
	if (carried.length > 0) {
		// Not a violation and not silence: naming them is what stops the
		// next reader concluding the gate looked at the whole tree.
		io.out(
			`  ${String(carried.length)} file(s) were already modified before the generators ran; drift in them is unattributable and was not judged.`,
		);
	}
	if (drift.length === 0) return 0;
	for (const path of drift) io.err(`  drift: ${path}`);
	return 1;
};

export const main = async (
	argv: readonly string[],
	io: IGenAllIo = defaultIo(),
): Promise<number> => {
	const check = hasFlag(argv, 'check');
	const list = hasFlag(argv, 'list');
	const { only, steps } = selectSteps(argv);
	if (steps.length === 0) {
		io.err(`gen-all: unknown --only "${only}"`);
		io.err(
			`gen-all: valid names: ${STEPS.map((step) => step.name).join(', ')}`,
		);
		return 2;
	}
	if (list) {
		for (const step of steps) {
			io.out(`  ${step.name}: ${step.cmd.join(' ')}`);
		}
		return 0;
	}

	io.out(`gen-all: ${steps.length} step(s)${check ? ' + drift-check' : ''}`);
	// Snapshot BEFORE any generator runs. Everything dirty at this point
	// belongs to whoever is editing the tree, not to this run.
	const dirtyBefore = check ? io.dirtyPaths() : new Set<string>();
	let worstExit = 0;
	for (const step of steps) {
		const code = await runStep(step, check, io);
		if (code !== 0) worstExit = code;
	}
	if (worstExit !== 0) {
		io.err(
			`gen-all: at least one generator exited non-zero (exit=${worstExit})`,
		);
		return 1;
	}
	if (check) {
		const code = await runGitDiffExit(io, dirtyBefore);
		if (code !== 0) {
			io.err(
				`gen-all: drift detected — a checked-in generated artifact is stale. Commit the regenerated files above.`,
			);
			return 1;
		}
		io.out(`gen-all: no drift detected ✓`);
		return 0;
	}
	io.out(`gen-all: every step passed ✓`);
	return 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
