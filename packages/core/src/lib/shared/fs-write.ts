/**
 * fs-write.ts — `fsWrite` primitive.
 *
 * SOLID — SRP: only writes. The read counterpart lives in
 * `fs-read.ts`. Both share the option / result shapes from
 * `fs-tools-options.ts` and the durability primitives from
 * `with-file-mutex.ts` + `atomic-write.ts`.
 *
 * DIP — the write is composed from `writeFileAtomic` and
 * `withFileMutex` (both core primitives). A test or alternate
 * host can swap one or both without editing this file.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { resolveWorkspaceContained } from './contain-path';
import { writeFileAtomic } from './atomic-write';
import { withFileMutex } from './with-file-mutex';
import type { IFsWriteOptions, IFsWriteResult } from './fs-tools-options';

/**
 * Write a workspace-contained file. Path containment is checked
 * first and unconditionally — a `../` or absolute path is rejected
 * before any I/O, `createDirs`/`atomic` notwithstanding. `atomic:true`
 * (default) routes the write through `withFileMutex` +
 * `writeFileAtomic` so concurrent writers can't tear or lose each
 * other's update; `atomic:false` writes directly (still after
 * containment + optional `mkdir`).
 */
export const fsWrite = async (
	workspaceRootAbs: string,
	relativePath: string,
	content: string,
	options: IFsWriteOptions = {},
): Promise<IFsWriteResult> => {
	const contained = resolveWorkspaceContained(workspaceRootAbs, relativePath);
	if (!contained.ok) {
		return {
			path: relativePath,
			ok: false,
			bytesWritten: 0,
			error: contained.reason ?? 'path escapes workspace',
		};
	}
	const atomic = options.atomic ?? true;
	try {
		if (options.createDirs === true) {
			await mkdir(dirname(contained.abs), { recursive: true });
		}
		if (atomic) {
			await withFileMutex(contained.abs, () =>
				writeFileAtomic(contained.abs, content),
			);
		} else {
			await writeFile(contained.abs, content, 'utf8');
		}
		return {
			path: contained.rel,
			ok: true,
			bytesWritten: Buffer.byteLength(content, 'utf8'),
		};
	} catch (error) {
		return {
			path: contained.rel,
			ok: false,
			bytesWritten: 0,
			error: String(error),
		};
	}
};
