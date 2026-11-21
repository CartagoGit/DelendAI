/**
 * validate-journal.ts — the one writer of the validate journal the
 * closing tools read (`VALIDATE_LOG_RELATIVE_PATH`).
 *
 * It lived in this repository's own `record-validate-evidence` script,
 * so only a project with that script could ever produce evidence: in any
 * other project no reviewer could close a proposal (x00712). Writer and
 * reader now sit side by side, and every runner — this repository's
 * script, `delendai validate` — journals through here.
 */
import { dirname, join } from 'node:path';

import { VALIDATE_LOG_RELATIVE_PATH } from '../contracts/constants/proposal-paths.constant';
import { createAutoTransitionRepairDeps } from '../services/auto-transition';
import type {
	IValidateJournalDeps,
	IValidateJournalEntry,
} from '../contracts/interfaces/validate-journal.interface';

/** The entry for a finished run: `pass` exactly when it exited 0. */
export const buildValidateJournalEntry = (input: {
	readonly exitCode: number;
	readonly timestamp: string;
	readonly logPath: string;
	readonly command: string;
	readonly failedSteps?: readonly string[];
}): IValidateJournalEntry => ({
	result: input.exitCode === 0 ? 'pass' : 'fail',
	timestamp: input.timestamp,
	exitCode: input.exitCode,
	logPath: input.logPath,
	command: input.command,
	// Only on a failing run, and only when there is something to name: an
	// empty array would read as "red for no reason".
	...(input.exitCode !== 0 &&
	input.failedSteps !== undefined &&
	input.failedSteps.length > 0
		? { failedSteps: [...input.failedSteps] }
		: {}),
});

/**
 * Append one entry, read-modify-write under the file mutex the proposals
 * plugin uses, so a concurrent agent's run cannot truncate another's.
 */
export const appendValidateJournalEntry = async (input: {
	readonly workspaceRoot: string;
	readonly entry: IValidateJournalEntry;
	readonly deps?: IValidateJournalDeps;
}): Promise<string> => {
	const deps = input.deps ?? createAutoTransitionRepairDeps();
	const path = join(input.workspaceRoot, VALIDATE_LOG_RELATIVE_PATH);
	const write = async () => {
		const existing = await deps.readText(path);
		const prefix =
			existing === '' || existing.endsWith('\n')
				? existing
				: `${existing}\n`;
		await deps.writeText(path, `${prefix}${JSON.stringify(input.entry)}\n`);
	};
	await deps.ensureDir(dirname(path));
	if (deps.withLock !== undefined) {
		await deps.withLock(path, write);
	} else {
		await write();
	}
	return path;
};
