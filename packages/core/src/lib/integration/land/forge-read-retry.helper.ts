/**
 * forge-read-retry.helper.ts — runs a forge read again when the server or
 * the connection failed transiently. Only an idempotent GET is retried; the
 * wait is a port, so the caller owns the clock.
 */
import type { ILandCommandRunner } from './land.interface';
import { FORGE_READ_RETRY } from '../../contracts/constants/forge-read-retry.constant';

type IForgeRunResult = Awaited<ReturnType<ILandCommandRunner>>;

const CONNECTION_FAILURE =
	/ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|connection reset|timed out|timeout/iu;

/** Whether a failed run was a transient server error or a dropped connection. */
export const isTransientForgeFailure = (result: IForgeRunResult): boolean => {
	if (result.exitCode === 0) return false;
	const text = `${result.stderr}\n${result.stdout}\n${result.spawnError ?? ''}`;
	const status = Number(/HTTP (\d{3})/u.exec(text)?.[1]);
	if (Number.isInteger(status))
		return (FORGE_READ_RETRY.statuses as readonly number[]).includes(
			status,
		);
	return CONNECTION_FAILURE.test(text);
};

/**
 * Runs `once`; for a GET that failed transiently, waits and runs it again up
 * to the delays the constant names. `exhausted` is true when the last
 * attempt was still transient, with the attempts made.
 */
export const runForgeRead = async (input: {
	readonly method: string;
	readonly once: () => Promise<IForgeRunResult>;
	readonly wait: (ms: number) => Promise<void>;
}): Promise<{
	readonly result: IForgeRunResult;
	readonly attempts: number;
	readonly exhausted: boolean;
}> => {
	let result = await input.once();
	if (input.method.toUpperCase() !== 'GET')
		return { result, attempts: 1, exhausted: false };
	let attempts = 1;
	for (const delay of FORGE_READ_RETRY.delaysMs) {
		if (!isTransientForgeFailure(result)) break;
		await input.wait(delay);
		result = await input.once();
		attempts += 1;
	}
	return { result, attempts, exhausted: isTransientForgeFailure(result) };
};
