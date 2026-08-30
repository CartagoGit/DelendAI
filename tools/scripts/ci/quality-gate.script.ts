#!/usr/bin/env bun
/**
 * quality-gate.script.ts — c00132 (AUD-P0-002).
 *
 * Runs the same checks the GitHub Actions `quality-gate` job runs
 * so a developer can verify locally before pushing. The CI workflow
 * (`/.github/workflows/quality-gate.yml`) shells into this script
 * with `--real` to fail the merge when any step fails.
 *
 * Inputs:
 *   --dry-run          print every step without executing.
 *   --only <name>      run a single step. Names are the keys of
 *                       the generated step list below. Lint steps accept
 *                       either `lint:<name>` or the bare `<name>`.
 *   --real             run for real (default is dry-run when the
 *                       script is called from the local CLI; CI
 *                       passes `--real` explicitly).
 *
 * Exit codes:
 *   0  every selected step exited 0.
 *   N  the first non-zero exit code reported by a selected step.
 *   2  unknown --only selector.
 *
 * Adding a step:
 *   Append an entry to `STATIC_STEPS`, or add a new lint script under
 *   `tools/scripts/lint/*.script.ts`. The workflow picks it up
 *   automatically because both call this script.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface IStep {
	readonly name: string;
	readonly cmd: readonly string[];
	readonly description: string;
	readonly aliases?: readonly string[];
}

interface IMainOptions {
	readonly cwd?: string;
	readonly out?: (msg: string) => void;
	readonly err?: (msg: string) => void;
	readonly loadSteps?: (cwd: string) => Promise<readonly IStep[]>;
	readonly runStep?: (step: IStep, cwd: string) => Promise<number>;
}

const STATIC_STEPS: readonly IStep[] = [
	{
		name: 'typecheck',
		cmd: ['bun', 'run', 'typecheck'],
		description: 'TypeScript no-emit pass over the whole repo.',
	},
	{
		name: 'lint',
		cmd: ['bun', 'run', 'lint'],
		description: 'Biome lint + format check.',
	},
	{
		name: 'validate',
		cmd: ['bun', 'run', 'validate'],
		description: 'Integrated pre-merge validation chain.',
	},
	{
		name: 'tokens-dashboard',
		cmd: ['bun', 'run', 'tokens:dashboard:check'],
		description: 'Token-budget dashboard within budget.',
	},
	{
		name: 'tokens-preset-gate',
		cmd: ['bun', 'run', 'tokens:gate'],
		description: 'Preset gate (token budget per preset).',
		aliases: ['tokens:gate'],
	},
	{
		name: 'test',
		cmd: ['bun', 'run', 'test'],
		description: 'Vitest suite.',
	},
];

const defaultOut = (msg: string) => process.stdout.write(`${msg}\n`);
const defaultErr = (msg: string) => process.stderr.write(`${msg}\n`);

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

const matchesSelector = (step: IStep, selector: string): boolean =>
	step.name === selector || step.aliases?.includes(selector) === true;

const listLintSteps = async (cwd: string): Promise<readonly IStep[]> => {
	const lintDir = join(cwd, 'tools/scripts/lint');
	const files = await readdir(lintDir, { withFileTypes: true });
	return files
		.filter((entry) => entry.isFile() && entry.name.endsWith('.script.ts'))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right))
		.map((fileName) => {
			const lintName = fileName.replace(/\.script\.ts$/u, '');
			return {
				name: `lint:${lintName}`,
				aliases: [lintName],
				cmd: ['bun', `tools/scripts/lint/${fileName}`],
				description: `Lint script ${fileName}.`,
			} satisfies IStep;
		});
};

export const loadDefaultSteps = async (
	cwd: string = process.cwd(),
): Promise<readonly IStep[]> => [
	...STATIC_STEPS,
	...(await listLintSteps(cwd)),
];

/**
 * Run a single step. Returns the child's exit code. Streams
 * stdout + stderr to the parent terminal so failures are visible
 * inline.
 */
const runStep = async (step: IStep, cwd: string): Promise<number> => {
	defaultOut(`▶ ${step.name} — ${step.description}`);
	const proc = Bun.spawn(step.cmd as string[], {
		cwd,
		stdout: 'inherit',
		stderr: 'inherit',
	});
	const exit = await proc.exited;
	defaultOut(`  ${step.name} exited ${exit}`);
	return exit;
};

export const main = async (
	argv: readonly string[],
	options: IMainOptions = {},
): Promise<number> => {
	const cwd = options.cwd ?? process.cwd();
	const out = options.out ?? defaultOut;
	const err = options.err ?? defaultErr;
	const executeStep = options.runStep ?? runStep;
	const availableSteps = await (options.loadSteps ?? loadDefaultSteps)(cwd);
	const dryRun = hasFlag(argv, 'dry-run') || !hasFlag(argv, 'real');
	const only = flag(argv, 'only');
	const steps =
		only !== undefined
			? availableSteps.filter((step) => matchesSelector(step, only))
			: availableSteps;
	if (steps.length === 0) {
		err(`quality-gate: unknown --only "${only}"`);
		err(
			`quality-gate: valid names: ${availableSteps
				.map((step) => step.name)
				.join(', ')}`,
		);
		return 2;
	}

	out(
		`quality-gate: ${steps.length} step(s), mode=${dryRun ? 'dry-run' : 'real'}`,
	);
	if (dryRun) {
		for (const step of steps) {
			out(`  [dry-run] ${step.name}: ${step.cmd.join(' ')}`);
		}
		return 0;
	}

	for (const step of steps) {
		const code = await executeStep(step, cwd);
		if (code !== 0) {
			err(`quality-gate: step ${step.name} failed (exit=${code})`);
			return code;
		}
	}
	out(`quality-gate: all ${steps.length} step(s) passed ✓`);
	return 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
