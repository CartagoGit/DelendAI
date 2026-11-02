/**
 * unit-lease.store.ts — the durable leases, one file per unit, in the git
 * common directory: the one place every worktree and every session of a
 * clone can read, and the one that survives any single CLI process.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { withFileMutex } from '../shared/with-file-mutex';
import { writeFileAtomic } from '../shared/atomic-write';
import { UNIT_LEASE_DIRECTORY } from './unit-lease.constant';
import type { IUnitLease } from './unit-lease.interface';

const LEASE_FILE_SUFFIX = '.json';

const shortRef = (ref: string): string => ref.replace(/^refs\/heads\//u, '');

export const unitLeasePath = (gitCommonDir: string, ref: string): string =>
	join(
		gitCommonDir,
		UNIT_LEASE_DIRECTORY,
		`${createHash('sha256').update(shortRef(ref)).digest('hex').slice(0, 32)}${LEASE_FILE_SUFFIX}`,
	);

const isLease = (value: unknown): value is IUnitLease => {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Partial<IUnitLease>;
	return (
		typeof candidate.ref === 'string' &&
		typeof candidate.heartbeatAt === 'number' &&
		typeof candidate.enteredAt === 'number' &&
		typeof candidate.owner?.agent === 'string'
	);
};

const readLeaseFile = async (path: string): Promise<IUnitLease | undefined> => {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
		return isLease(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
};

export const readUnitLease = (
	gitCommonDir: string,
	ref: string,
): Promise<IUnitLease | undefined> =>
	readLeaseFile(unitLeasePath(gitCommonDir, ref));

/**
 * Read-modify-write one lease under its mutex. `change` returns the lease
 * to keep, or `undefined` to leave the file as it is.
 */
export const updateUnitLease = (
	gitCommonDir: string,
	ref: string,
	change: (current: IUnitLease | undefined) => IUnitLease | undefined,
): Promise<IUnitLease | undefined> => {
	const path = unitLeasePath(gitCommonDir, ref);
	return withFileMutex(path, async () => {
		const current = await readLeaseFile(path);
		const next = change(current);
		if (next === undefined) return current;
		await writeFileAtomic(path, `${JSON.stringify(next, null, '\t')}\n`);
		return next;
	});
};

export const removeUnitLease = (
	gitCommonDir: string,
	ref: string,
): Promise<void> => rm(unitLeasePath(gitCommonDir, ref), { force: true });

/** Every lease of the clone, keyed by short ref name. */
export const listUnitLeases = async (
	gitCommonDir: string,
): Promise<ReadonlyMap<string, IUnitLease>> => {
	const directory = join(gitCommonDir, UNIT_LEASE_DIRECTORY);
	const names = await readdir(directory).catch(() => [] as string[]);
	const leases = new Map<string, IUnitLease>();
	for (const name of names) {
		if (!name.endsWith(LEASE_FILE_SUFFIX)) continue;
		const lease = await readLeaseFile(join(directory, name));
		if (lease !== undefined) leases.set(shortRef(lease.ref), lease);
	}
	return leases;
};
