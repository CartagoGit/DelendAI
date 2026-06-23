/**
 * fs-read.ts — `fsRead` primitive.
 *
 * SOLID — SRP: only reads. The write counterpart lives in
 * `fs-write.ts`. Both share the option / result shapes from
 * `fs-tools-options.ts` and the containment helper from
 * `contain-path.ts`.
 *
 * Pure async function over the injected workspace root and
 * relative path. Returns a structured `IFsReadResult` instead of
 * throwing — the tool handler is the boundary that turns
 * `found:false` into a `toolError` envelope.
 */
import { readFile } from 'node:fs/promises';

import { resolveWorkspaceContained } from './contain-path';
import type { IFsReadResult } from './fs-tools-options';

/**
 * Read a workspace-contained file, optionally a 1-indexed inclusive
 * line range `[start, end]`. Returns `found:false` (never throws)
 * when the path escapes the workspace or the file doesn't exist /
 * can't be read.
 */
export const fsRead = async (
	workspaceRootAbs: string,
	relativePath: string,
	range?: readonly [number, number],
): Promise<IFsReadResult> => {
	const contained = resolveWorkspaceContained(workspaceRootAbs, relativePath);
	if (!contained.ok) {
		return {
			path: relativePath,
			found: false,
			content: null,
			totalLines: null,
			range: null,
		};
	}
	try {
		const raw = await readFile(contained.abs, 'utf8');
		const lines = raw.split('\n');
		if (range === undefined) {
			return {
				path: contained.rel,
				found: true,
				content: raw,
				totalLines: lines.length,
				range: null,
			};
		}
		const [start, end] = range;
		const lo = Math.max(1, start);
		const hi = Math.min(lines.length, end);
		const slice = lo <= hi ? lines.slice(lo - 1, hi) : [];
		return {
			path: contained.rel,
			found: true,
			content: slice.join('\n'),
			totalLines: lines.length,
			range: [lo, hi],
		};
	} catch {
		return {
			path: contained.rel,
			found: false,
			content: null,
			totalLines: null,
			range: null,
		};
	}
};
