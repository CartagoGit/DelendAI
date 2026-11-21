/**
 * work-deliver-lock.service.ts — one `work deliver` per unit at a time.
 *
 * Two deliveries of one unit transition, prove, commit and publish in the
 * same worktree and collide on its git index. The first takes a lock file
 * naming its pid; a second finds that pid alive and is refused at once,
 * naming it. A lock left by a dead pid is taken over. Nothing waits, so no
 * clock is involved.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type {
	IDeliverLock,
	IDeliverLockOptions,
} from '../contracts/interfaces/deliver-lock.interface';

const run = promisify(execFile);

/**
 * The directory every worktree of the repository shares for these locks:
 * inside its git common dir, never a world-writable temporary directory.
 */
const lockDirOf = async (
	checkout: string | undefined,
): Promise<string | undefined> => {
	if (checkout === undefined) return undefined;
	try {
		const { stdout } = await run(
			'git',
			['rev-parse', '--path-format=absolute', '--git-common-dir'],
			{ cwd: checkout },
		);
		const common = stdout.trim();
		return common === ''
			? undefined
			: join(common, 'delendai-deliver-locks');
	} catch {
		return undefined;
	}
};

const processIsAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: the process exists but is not ours to signal.
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

const pidIn = async (path: string): Promise<number | undefined> => {
	try {
		const pid = Number.parseInt(await readFile(path, 'utf8'), 10);
		return Number.isInteger(pid) && pid > 0 ? pid : undefined;
	} catch {
		return undefined;
	}
};

const created = async (path: string, pid: number): Promise<boolean> => {
	try {
		await writeFile(path, `${pid}\n`, { flag: 'wx' });
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
		throw error;
	}
};

/** Takes the unit's delivery lock, or says which live pid already holds it. */
export const acquireDeliverLock = async (
	unitKey: string,
	options: IDeliverLockOptions = {},
): Promise<IDeliverLock> => {
	const dir = options.dir ?? (await lockDirOf(options.checkout));
	// Without a repository to hold it there is nothing to collide on.
	if (dir === undefined)
		return { held: true, release: async () => undefined };
	const pid = options.pid ?? process.pid;
	const alive = options.isAlive ?? processIsAlive;
	const path = join(
		dir,
		`${createHash('sha1').update(unitKey).digest('hex')}.lock`,
	);
	await mkdir(dir, { recursive: true });
	const release = async (): Promise<void> => {
		if ((await pidIn(path)) === pid) await rm(path, { force: true });
	};
	for (let attempt = 0; attempt < 3; attempt += 1) {
		if (await created(path, pid)) return { held: true, release };
		const holder = await pidIn(path);
		if (holder !== undefined && alive(holder)) {
			return { held: false, pid: holder };
		}
		// A dead (or unreadable) holder: move its lock aside atomically, so only
		// one of several takers removes it, then try to create it afresh.
		const aside = `${path}.${pid}.${attempt}`;
		try {
			await rename(path, aside);
			await rm(aside, { force: true });
		} catch {
			// Someone else took it over first; the next attempt reads its pid.
		}
	}
	return { held: false, pid: (await pidIn(path)) ?? 0 };
};
