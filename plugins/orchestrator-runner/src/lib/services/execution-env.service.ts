import type {
	IEnvironmentLogEntry,
	IEnvironmentRunOptions,
	IEnvironmentRunOutcome,
	ILifecycleEnvironment,
} from '../contracts/interfaces/execution-env-lifecycle.interface';

const reasonOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Run one slice inside an execution environment: prepare it, run the
 * slice, release it. When `prepare` fails or throws the slice is never
 * called, so no code changes before the environment is known to work.
 * `teardown` runs whenever `prepare` was attempted, including after the
 * slice failed, and each step's duration goes into the slice log.
 */
export const runInExecutionEnvironment = async <T>(
	environment: ILifecycleEnvironment,
	slice: () => Promise<T>,
	options: IEnvironmentRunOptions = {},
): Promise<IEnvironmentRunOutcome<T>> => {
	const now = options.now ?? Date.now;
	const log: IEnvironmentLogEntry[] = [];
	const record = (entry: IEnvironmentLogEntry): void => {
		log.push(entry);
		options.onLog?.(entry);
	};
	const timed = async (
		phase: IEnvironmentLogEntry['phase'],
		step: () => Promise<{ ok: boolean; reason?: string }>,
	): Promise<boolean> => {
		const started = now();
		let ok = false;
		let reason: string | undefined;
		try {
			const outcome = await step();
			ok = outcome.ok;
			reason = outcome.reason;
		} catch (error) {
			reason = reasonOf(error);
		}
		record({
			phase,
			environment: environment.id,
			ok,
			durationMs: now() - started,
			...(reason === undefined ? {} : { reason }),
		});
		return ok;
	};

	const prepared = await timed('prepare', () => environment.prepare());
	if (!prepared) {
		const failed = log[0];
		await timed('teardown', () => environment.teardown());
		return {
			started: false,
			failure: `environment ${environment.id} could not be prepared: ${failed?.reason ?? 'unknown reason'}`,
			log,
		};
	}
	let result: T | undefined;
	let failure: string | undefined;
	try {
		result = await slice();
	} catch (error) {
		failure = reasonOf(error);
	}
	const released = await timed('teardown', () => environment.teardown());
	if (!released && failure === undefined) {
		failure = `environment ${environment.id} could not be released: ${log.at(-1)?.reason ?? 'unknown reason'}`;
	}
	return {
		started: true,
		...(result === undefined ? {} : { result }),
		...(failure === undefined ? {} : { failure }),
		log,
	};
};
