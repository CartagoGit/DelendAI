/**
 * rehearsal-forge-retry.helper.ts — the one retry of the rehearsal forge: a
 * read (GET) that fails with a gateway status or a connection reset or
 * timeout is asked again after each delay of `REHEARSAL_READ_RETRY`, waiting
 * through the injected port. Writes and every other failure throw at once;
 * after the last attempt the error names how many were made.
 */
import { REHEARSAL_READ_RETRY } from '../contracts/constants/rehearsal.constant';

interface IAnswer {
	readonly status: number;
	readonly text: string;
	/** Set when the call failed rather than answered. */
	readonly failed?: boolean;
	readonly transient?: boolean;
}

/** Whether a failed call is the kind a second ask can mend. */
export const isTransient = (status: number, reason: string): boolean =>
	(REHEARSAL_READ_RETRY.statuses as readonly number[]).includes(status) ||
	REHEARSAL_READ_RETRY.transientText.test(reason);

/** The answer of `call`, asked again while it fails transiently and the method is a read. */
export const readWithRetry = async (input: {
	readonly method: string;
	readonly call: () => Promise<IAnswer>;
	readonly wait: (ms: number) => Promise<void>;
}): Promise<{ readonly status: number; readonly text: string }> => {
	for (let attempt = 1; ; attempt += 1) {
		const answer = await input.call();
		if (answer.failed !== true) return answer;
		const delay = REHEARSAL_READ_RETRY.delaysMs[attempt - 1];
		if (
			input.method === 'GET' &&
			answer.transient === true &&
			delay !== undefined
		) {
			await input.wait(delay);
			continue;
		}
		throw new Error(
			attempt === 1
				? answer.text
				: `${answer.text} (${String(attempt)} attempts)`,
		);
	}
};
