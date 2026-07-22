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

import { resolveAgainstRoots } from './contain-path';
import { realpathContained } from './contain-realpath';
import type { IFsReadResult } from './fs-tools-options';

const notFound = (path: string): IFsReadResult => ({
	path,
	found: false,
	content: null,
	totalLines: null,
	range: null,
});

/**
 * Read a workspace-contained file, optionally a 1-indexed inclusive
 * line range `[start, end]`. Returns `found:false` (never throws)
 * when the path escapes the workspace (and every authorized root) or
 * the file doesn't exist / can't be read.
 *
 * `authorizedRoots` (f00089 U5) defaults to `[]`, in which case the
 * containment is byte-identical to the single-root, reject-absolute
 * behaviour: only paths inside `workspaceRootAbs` are read. When the
 * operator authorizes extra roots, an absolute or escaping path is
 * accepted iff it falls inside one of them.
 */
export const fsRead = async (
	workspaceRootAbs: string,
	relativePath: string,
	range?: readonly [number, number],
	authorizedRoots: readonly string[] = [],
): Promise<IFsReadResult> => {
	const contained = resolveAgainstRoots(
		workspaceRootAbs,
		authorizedRoots,
		relativePath,
	);
	if (!contained.ok) {
		return notFound(relativePath);
	}
	// a00068: reject a read whose resolved path escapes via a symlink
	// (e.g. a workspace symlink pointing at /etc/passwd) — the lexical
	// check above never follows links. Symmetric with fsWrite.
	if (
		!(await realpathContained(contained.abs, [
			workspaceRootAbs,
			...authorizedRoots,
		]))
	) {
		return notFound(relativePath);
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
