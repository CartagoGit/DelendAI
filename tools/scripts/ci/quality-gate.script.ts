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
 *                       `STEPS` below.
 *   --real             run for real (default is dry-run when the
 *                       script is called from the local CLI; CI
 *                       passes `--real` explicitly).
 *
 * Exit codes:
 *   0  every selected step exited 0.
 *   1  at least one step exited non-zero.
 *   2  unknown --only selector.
 *
 * Adding a step:
 *   Append an entry to `STEPS`. The workflow picks it up
 *   automatically because both call this script.
 */

interface IStep {
	readonly name: string;
	readonly cmd: readonly string[];
	readonly description: string;
}

const STEPS: readonly IStep[] = [
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
		name: 'tokens-dashboard',
		cmd: ['bun', 'run', 'tokens:dashboard:check'],
		description: 'Token-budget dashboard within budget.',
	},
	{
		name: 'tokens-preset-gate',
		cmd: ['bun', 'run', 'tokens:gate'],
		description: 'Preset gate (token budget per preset).',
	},
	{
		name: 'check-generated',
		cmd: ['bun', 'run', 'check:generated'],
		description: 'Generated artifacts are in sync with their sources.',
	},
	{
		name: 'lint-architecture',
		cmd: ['bun', 'run', 'lint:architecture-readfile-via-safe-reader'],
		description: 'Architecture lint (SOLID, file conventions).',
	},
	{
		name: 'lint-privacy',
		cmd: ['bun', 'run', 'lint:privacy'],
		description: 'Privacy lint (R1.1–R1.10 invariants).',
	},
	{
		name: 'lint-proposals',
		cmd: ['bun', 'run', 'lint:proposals'],
		description: 'Proposals lint (status, ids, drift).',
	},
	{
		name: 'lint-agents',
		cmd: ['bun', 'run', 'lint:agents'],
		description: 'Agents + skills lint (no stale paths).',
	},
	{
		name: 'lint-skills',
		cmd: ['bun', 'run', 'lint:skills'],
		description: 'Skills drift against the live tool catalog.',
	},
	{
		name: 'test',
		cmd: ['bun', 'run', 'test'],
		description: 'Vitest suite.',
	},
];

const out = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

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

/**
 * Run a single step. Returns the child's exit code. Streams
 * stdout + stderr to the parent terminal so failures are visible
 * inline.
 */
const runStep = async (step: IStep): Promise<number> => {
	out(`▶ ${step.name} — ${step.description}`);
	const proc = Bun.spawn(step.cmd as string[], {
		stdout: 'inherit',
		stderr: 'inherit',
	});
	const exit = await proc.exited;
	out(`  ${step.name} exited ${exit}`);
	return exit;
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const dryRun = hasFlag(argv, 'dry-run') || !hasFlag(argv, 'real');
	const only = flag(argv, 'only');
	const steps =
		only !== undefined ? STEPS.filter((s) => s.name === only) : STEPS;
	if (steps.length === 0) {
		err(`quality-gate: unknown --only "${only}"`);
		err(
			`quality-gate: valid names: ${STEPS.map((s) => s.name).join(', ')}`,
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

	let worstExit = 0;
	for (const step of steps) {
		const code = await runStep(step);
		if (code !== 0) worstExit = code;
	}
	if (worstExit !== 0) {
		err(`quality-gate: at least one step failed (exit=${worstExit})`);
		return 1;
	}
	out(`quality-gate: all ${steps.length} step(s) passed ✓`);
	return 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
