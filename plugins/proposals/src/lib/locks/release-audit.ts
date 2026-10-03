/**
 * release-audit.ts — r00042 S3.
 *
 * Moved out of `locks/engine.ts` verbatim: the engine was 1,394 lines
 * against the 600-line ceiling this proposal sets, and it is
 * concurrency-sensitive code with a recorded history of subtle
 * correctness bugs. Declarations were relocated, never rewritten.
 */
import type {
	IAgentLockDeps,
	IReleaseAuditEntry,
} from '../contracts/interfaces/agent-lock.interface';
import { RELEASE_AUDIT_LOG_RELATIVE_PATH } from '../contracts/constants/agents-lock.constants';
import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';
import { mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { isMissingFileErrno } from '../shared/errno';

export const resolveCallerHostId = (
	deps: IAgentLockDeps,
): { host: string; pid: number } => {
	if (deps.nowHostId !== undefined) {
		return deps.nowHostId();
	}
	return { host: hostname(), pid: process.pid };
};

export const appendReleaseAuditEntry = async (
	entry: IReleaseAuditEntry,
	workspaceRoot: string | undefined,
): Promise<void> => {
	if (workspaceRoot === undefined) return;
	const auditPath = join(workspaceRoot, RELEASE_AUDIT_LOG_RELATIVE_PATH);
	await withFileMutex(auditPath, async () => {
		await mkdir(dirname(auditPath), { recursive: true });
		try {
			const prefix = (
				await new SafeWorkspaceReader(dirname(auditPath)).readText(
					basename(auditPath),
				)
			).content;
			await writeFileAtomic(
				auditPath,
				`${prefix}${JSON.stringify(entry)}\n`,
			);
		} catch (err) {
			if (isMissingFileErrno(err)) {
				await writeFileAtomic(auditPath, `${JSON.stringify(entry)}\n`);
				return;
			}
			throw err;
		}
	});
};
