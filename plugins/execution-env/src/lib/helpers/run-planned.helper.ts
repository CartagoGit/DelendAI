import type { IExecResult } from '../contracts/interfaces/execution-env-types.interface';
import type { IRunPlannedInput } from '../contracts/interfaces/run-planned.interface';

/**
 * Perform a host command, or in a dry run only report what would have
 * been performed. The dry-run branch never touches the runner, so no
 * adapter can start a process by forgetting to check its own flag.
 */
export const runPlanned = async (
	input: IRunPlannedInput,
): Promise<IExecResult> => {
	const now = input.now ?? Date.now;
	const started = now();
	if (input.dryRun) {
		return {
			exitCode: 0,
			stdout: '',
			stderr: '',
			dryRun: true,
			plannedArgv: input.argv,
			durationMs: 0,
		};
	}
	const result = await input.runner.run(input.argv, input.options);
	return {
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
		dryRun: false,
		plannedArgv: input.argv,
		durationMs: now() - started,
	};
};
