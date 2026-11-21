// effect-boundary-authorized: seat and Phase A markers are created exclusively inside a contained audit dir
/**
 * Seats and Phase A of the audit protocol. A seat is claimed with an exclusive
 * create (`wx`), so two reviewers cannot hold one; a reviewer's Phase A file is
 * committed (hashed) before the others' reports may be read.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, readdir } from 'node:fs/promises';
import path from 'node:path';

import { SafeWorkspaceReader } from '@delendai/core/runtime';

import {
	AUDIT_NAME_RE,
	AUDIT_PHASE_A_SUBDIR,
	AUDIT_PROTOCOL_DIR,
	AUDIT_SEATS_SUBDIR,
} from '../contracts/constants/audit-protocol.constant';
import type {
	IPhaseACommit,
	ISeatClaim,
	ISeatClaimResult,
} from '../contracts/interfaces/audit-protocol.interface';

const protocolDir = (auditDir: string, sub: string): string =>
	path.join(auditDir, AUDIT_PROTOCOL_DIR, sub);

const sha256 = (text: string): string =>
	createHash('sha256').update(text).digest('hex');

const readText = async (auditDir: string, rel: string): Promise<string> =>
	(await new SafeWorkspaceReader(auditDir).readText(rel)).content;

/** Create the file only if it does not exist (`wx`); EEXIST when it does. */
const createExclusive = async (
	file: string,
	content: string,
): Promise<void> => {
	const handle = await open(file, 'wx');
	try {
		await handle.writeFile(content, 'utf8');
	} finally {
		await handle.close();
	}
};

const isExists = (err: unknown): boolean =>
	(err as NodeJS.ErrnoException).code === 'EEXIST';

export const claimSeat = async (
	auditDir: string,
	seat: string,
	reviewer: string,
): Promise<ISeatClaimResult> => {
	if (!AUDIT_NAME_RE.test(seat) || !AUDIT_NAME_RE.test(reviewer)) {
		return { ok: false, reason: 'seat and reviewer must be plain names' };
	}
	const claim: ISeatClaim = {
		seat,
		reviewer,
		claimedAt: new Date().toISOString(),
	};
	const dir = protocolDir(auditDir, AUDIT_SEATS_SUBDIR);
	await mkdir(dir, { recursive: true });
	try {
		await createExclusive(
			path.join(dir, `${seat}.json`),
			JSON.stringify(claim),
		);
	} catch (err) {
		if (!isExists(err)) throw err;
		const holder = await readSeat(auditDir, seat);
		return {
			ok: false,
			reason: `seat "${seat}" is already held by ${holder?.reviewer ?? 'another reviewer'}`,
		};
	}
	return { ok: true, claim };
};

export const readSeat = async (
	auditDir: string,
	seat: string,
): Promise<ISeatClaim | undefined> => {
	try {
		const raw = await readText(
			auditDir,
			`${AUDIT_PROTOCOL_DIR}/${AUDIT_SEATS_SUBDIR}/${seat}.json`,
		);
		return JSON.parse(raw) as ISeatClaim;
	} catch {
		return undefined;
	}
};

/** Commit `file` (a report relative to `auditDir`) as the reviewer's Phase A. */
export const commitPhaseA = async (
	auditDir: string,
	reviewer: string,
	file: string,
): Promise<
	{ ok: true; commit: IPhaseACommit } | { ok: false; reason: string }
> => {
	if (!AUDIT_NAME_RE.test(reviewer)) {
		return { ok: false, reason: 'reviewer must be a plain name' };
	}
	const abs = path.resolve(auditDir, file);
	if (path.relative(auditDir, abs).startsWith('..')) {
		return {
			ok: false,
			reason: 'Phase A file must be inside the audit dir',
		};
	}
	let body: string;
	try {
		body = await readText(auditDir, file);
	} catch {
		return { ok: false, reason: `Phase A file "${file}" cannot be read` };
	}
	const commit: IPhaseACommit = {
		reviewer,
		file,
		sha256: sha256(body),
		committedAt: new Date().toISOString(),
	};
	const dir = protocolDir(auditDir, AUDIT_PHASE_A_SUBDIR);
	await mkdir(dir, { recursive: true });
	try {
		await createExclusive(
			path.join(dir, `${reviewer}.json`),
			JSON.stringify(commit),
		);
	} catch (err) {
		if (isExists(err)) {
			return {
				ok: false,
				reason: `Phase A of ${reviewer} is already committed`,
			};
		}
		throw err;
	}
	return { ok: true, commit };
};

export const readPhaseA = async (
	auditDir: string,
	reviewer: string,
): Promise<IPhaseACommit | undefined> => {
	if (!AUDIT_NAME_RE.test(reviewer)) return undefined;
	try {
		const raw = await readText(
			auditDir,
			`${AUDIT_PROTOCOL_DIR}/${AUDIT_PHASE_A_SUBDIR}/${reviewer}.json`,
		);
		return JSON.parse(raw) as IPhaseACommit;
	} catch {
		return undefined;
	}
};

/** May `reviewer` read the others' reports? Only with a Phase A commit whose file is unchanged. */
export const mayReadOthers = async (
	auditDir: string,
	reviewer: string,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
	const commit = await readPhaseA(auditDir, reviewer);
	if (commit === undefined) {
		return {
			ok: false,
			reason: `${reviewer} has not committed a Phase A file; commit it before reading the others' reports`,
		};
	}
	try {
		const body = await readText(auditDir, commit.file);
		if (sha256(body) !== commit.sha256) {
			return {
				ok: false,
				reason: `Phase A file of ${reviewer} changed after its commit`,
			};
		}
	} catch {
		return { ok: false, reason: `Phase A file of ${reviewer} is missing` };
	}
	return { ok: true };
};

/** Every claimed seat, by seat name. */
export const listSeats = async (auditDir: string): Promise<ISeatClaim[]> => {
	let names: string[];
	try {
		names = await readdir(protocolDir(auditDir, AUDIT_SEATS_SUBDIR));
	} catch {
		return [];
	}
	const claims = await Promise.all(
		names
			.filter((n) => n.endsWith('.json'))
			.map((n) => readSeat(auditDir, n.slice(0, -'.json'.length))),
	);
	return claims.filter((c): c is ISeatClaim => c !== undefined);
};
