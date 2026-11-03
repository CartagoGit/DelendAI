/**
 * compute-slot.service.ts — the one machine-wide slot for heavy compute.
 *
 * A machine has one set of cores however many agents work on it. Proofs,
 * typechecks and test runs that start together each spawn their own
 * workers: the load climbs, timing-sensitive specs fail, a proof takes an
 * hour. Whoever starts heavy compute takes this slot first and waits its
 * turn, saying who holds it; the slot is released when the work ends, and
 * a holder that dies without releasing it is reclaimed by the file mutex
 * (its process id is probed, so no timeout has to elapse).
 *
 * ONE MECHANISM: `tools/scripts/lib/with-compute-lock.script.ts` (every
 * `bun run test|typecheck|lint`) and the unit proof both come through
 * here. The slot is re-entrant across processes: while it is held, the
 * environment names it, so the commands a proof runs (which are wrapped by
 * the same script) run inside the turn instead of waiting for themselves.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { COMPUTE_SLOT_ENV } from '../contracts/constants/compute-slot.constant';
import type { IComputeSlotRequest } from '../contracts/interfaces/compute-slot.interface';
import { runGitCommand } from './git-command.helper';
import { withFileMutex } from './with-file-mutex';

/** A proof can outlast several peers' proofs: wait long before giving up. */
const WAIT_BUDGET_MS = 4 * 60 * 60 * 1000;

/**
 * A holder silent this long is judged by its process: dead is reclaimed,
 * alive keeps the slot however long a blocked event loop stays silent.
 */
const STALE_MS = 30 * 1000;

/** The wait notice appears only when the slot is not free at once. */
const WAIT_NOTICE_MS = 1_000;

/** Where the slot lives: in the git directory every worktree shares. */
export const computeSlotPath = (cwd: string): string | undefined => {
	const gitDir = runGitCommand(cwd, [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	return gitDir.ok && gitDir.out.length > 0
		? join(gitDir.out, 'delendai', 'heavy-compute.lock')
		: undefined;
};

const heldBy = (lockPath: string, pid: number): string =>
	`${lockPath}@${String(pid)}`;

const heldByAncestor = (lockPath: string): boolean => {
	const held = process.env[COMPUTE_SLOT_ENV];
	const prefix = `${lockPath}@`;
	if (held === undefined || !held.startsWith(prefix)) return false;
	const pid = Number(held.slice(prefix.length));
	return Number.isInteger(pid) && pid !== process.pid;
};

const ownerFile = (lockPath: string): string => `${lockPath}.owner`;

const holderOf = async (lockPath: string): Promise<string> => {
	try {
		const raw = await readFile(ownerFile(lockPath), 'utf8');
		const owner = JSON.parse(raw) as { label?: string; pid?: number };
		return `${owner.label ?? 'another run'} (pid ${String(owner.pid)})`;
	} catch {
		return 'another run';
	}
};

/** Run `request.run` once the machine's compute slot is this caller's. */
export const withComputeSlot = async <T>(
	request: IComputeSlotRequest<T>,
): Promise<T> => {
	const { lockPath, label } = request;
	// Held by an ancestor process (a proof running this very command): the
	// turn is already ours. Held by THIS process means another caller here.
	if (heldByAncestor(lockPath)) {
		return request.run();
	}
	const notify =
		request.notify ?? ((message: string) => console.error(message));
	await mkdir(dirname(lockPath), { recursive: true });
	let waiting = false;
	let notice: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
		waiting = true;
		void holderOf(lockPath).then((holder) => {
			if (waiting) {
				notify(
					`[compute-slot] "${label}" is waiting — ${holder} holds the machine's compute slot. Waiting my turn...`,
				);
			}
		});
	}, request.waitNoticeMs ?? WAIT_NOTICE_MS);
	return withFileMutex(
		lockPath,
		async () => {
			clearTimeout(notice);
			notice = undefined;
			if (waiting) notify(`[compute-slot] "${label}" got its turn.`);
			waiting = false;
			await writeFile(
				ownerFile(lockPath),
				JSON.stringify({ label, pid: process.pid }),
			);
			process.env[COMPUTE_SLOT_ENV] = heldBy(lockPath, process.pid);
			try {
				return await request.run();
			} finally {
				delete process.env[COMPUTE_SLOT_ENV];
				await rm(ownerFile(lockPath), { force: true });
			}
		},
		{
			timeoutMs: request.timeoutMs ?? WAIT_BUDGET_MS,
			staleMs: request.staleMs ?? STALE_MS,
			onContention: 'fail',
		},
	).finally(() => {
		waiting = false;
		if (notice !== undefined) clearTimeout(notice);
	});
};
