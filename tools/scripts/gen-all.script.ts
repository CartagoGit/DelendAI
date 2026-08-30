#!/usr/bin/env bun
/**
 * gen-all.script.ts — c00133 (AUD-P0-003).
 *
 * Orchestrates every code generator in `tools/scripts/generate/`
 * (and the token-budget dashboard) in a deterministic order so
 * downstream consumers always see fresh artifacts.
 *
 * Inputs:
 *   --check      Run every generator in real mode, then run
 *                `git diff --exit-code` against the working tree.
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

import { spawn } from 'node:child_process';

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

const runGitDiffExit = async (io: IGenAllIo): Promise<number> => {
	io.out(`▶ drift-check — git diff --exit-code`);
	return io.runCommand('git', ['diff', '--exit-code']);
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
		const code = await runGitDiffExit(io);
		if (code !== 0) {
			io.err(`gen-all: drift detected — see the diff above`);
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
