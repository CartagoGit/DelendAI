import { setPriority } from 'node:os';

/** The env var a sanctioned job (`work prove`) sets to run the whole suite. */
export const FULL_SUITE_ENV = 'DELENDAI_FULL_SUITE';

/** The env `work prove` gives its test steps: the sanctioned whole-suite run. */
export const SANCTIONED_SUITE_ENV: Readonly<Record<string, string>> = {
	[FULL_SUITE_ENV]: '1',
};

/** The env that marks a caller as an agent, not a person. */
const AGENT_ENVS = ['DELENDAI_AGENT_ID', 'CLAUDECODE', 'AI_AGENT'] as const;

/** The nice value an agent's test run takes, so it never starves the host. */
const AGENT_NICE = 19;

/** The line a refused run prints. */
export const REFUSAL =
	'delendai: an agent does not run the whole test suite; run `delendai work prove` (or name the spec files) instead.';

type Env = Readonly<Record<string, string | undefined>>;

const set = (env: Env, name: string): boolean => (env[name] ?? '') !== '';

/** Whether the caller is an agent (any identity env is set). Pure. */
export const isAgentRun = (env: Env): boolean =>
	AGENT_ENVS.some((name) => set(env, name));

const COMMANDS: ReadonlySet<string> = new Set(['run', 'watch', 'dev']);
const SCOPING_FLAGS = ['--project', '--changed', '--related', '--shard'];

/** Whether argv narrows the run: a file or pattern, or a scoping flag. Pure. */
export const hasFilter = (argv: readonly string[]): boolean =>
	argv.slice(2).some((arg) => {
		if (arg.startsWith('-')) {
			return SCOPING_FLAGS.some(
				(flag) => arg === flag || arg.startsWith(`${flag}=`),
			);
		}
		return !COMMANDS.has(arg);
	});

/** The refusal for an unfiltered agent run, or undefined when it may go on. Pure. */
export const fullSuiteRefusal = (
	argv: readonly string[],
	env: Env,
): string | undefined => {
	if (!isAgentRun(env)) return undefined;
	if (set(env, 'CI') || set(env, 'VITEST_WORKER_ID')) return undefined;
	if (env[FULL_SUITE_ENV] === '1') return undefined;
	return hasFilter(argv) ? undefined : REFUSAL;
};

/** Lower an agent's own priority; a host that refuses it is left as it is. */
export const lowerAgentPriority = (
	env: Env,
	apply: (pid: number, nice: number) => void = setPriority,
): void => {
	if (!isAgentRun(env) || set(env, 'VITEST_WORKER_ID')) return;
	try {
		apply(0, AGENT_NICE);
	} catch {
		// the platform may not allow it: the run goes on at its priority
	}
};

/** Guard one vitest start: lower priority, or exit with the refusal. */
export const guardFullSuite = (
	argv: readonly string[] = process.argv,
	env: Env = process.env,
	exit: (code: number) => never = process.exit,
): void => {
	const refusal = fullSuiteRefusal(argv, env);
	if (refusal !== undefined) {
		process.stderr.write(`${refusal}\n`);
		exit(1);
	}
	lowerAgentPriority(env);
};
