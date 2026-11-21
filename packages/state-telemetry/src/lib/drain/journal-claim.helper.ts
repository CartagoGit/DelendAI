/**
 * journal-claim.helper.ts — taking a journal for one drain, and only one.
 *
 * A drain claims a journal by renaming it. A claim named only
 * `<journal>.draining` belonged to nobody: a second drain took up the
 * claim of a live one as a crashed leftover and both consumed the same
 * lines, and a drain that renamed a fresh journal onto a leftover claim
 * replaced the lines it held. So a claim carries its owner's pid and a
 * unique token: a live owner's claim is never taken, a dead owner's (or
 * an unowned one from before) is adopted by renaming it to the adopter's
 * own name, and a new claim never lands on an existing file.
 */
import { randomUUID } from 'node:crypto';
import { readdir, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const CLAIMED_SUFFIX = '.draining';

/** Whether a process is alive on this machine; `kill(pid, 0)` only asks. */
export const isProcessAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

/** The owner pid a claim's name carries; `undefined` for an unowned one. */
const ownerOf = (
	claimName: string,
	journalName: string,
): number | undefined => {
	const rest = claimName.slice(`${journalName}${CLAIMED_SUFFIX}`.length);
	const match = /^\.(\d+)\.[0-9a-f-]+$/u.exec(rest);
	return match === null ? undefined : Number(match[1]);
};

/**
 * Claim `journalPath` for this drain: an abandoned claim first, so no line
 * a crashed drain held is lost, else the live journal. `undefined` when
 * there is nothing to take.
 */
export const claimJournal = async (
	journalPath: string,
	isAlive: (pid: number) => boolean = isProcessAlive,
): Promise<string | undefined> => {
	const dir = dirname(journalPath);
	const journalName = basename(journalPath);
	const mine = `${journalPath}${CLAIMED_SUFFIX}.${process.pid}.${randomUUID()}`;
	const names = await readdir(dir).catch(() => [] as string[]);
	for (const name of names) {
		if (!name.startsWith(`${journalName}${CLAIMED_SUFFIX}`)) continue;
		const owner = ownerOf(name, journalName);
		const unowned = name === `${journalName}${CLAIMED_SUFFIX}`;
		if (!unowned && (owner === undefined || isAlive(owner))) continue;
		try {
			await rename(join(dir, name), mine);
			return mine;
		} catch {
			// Another drain adopted it first.
		}
	}
	try {
		await rename(journalPath, mine);
		return mine;
	} catch {
		return undefined;
	}
};
