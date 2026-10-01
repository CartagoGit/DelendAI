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

import { resolveExistingWorkspaceContained } from './contain-realpath';
import type { IFsReadResult } from './fs-tools-options';

const notFound = (path: string, reason?: string): IFsReadResult => ({
	path,
	found: false,
	content: null,
	totalLines: null,
	range: null,
	...(reason !== undefined ? { reason } : {}),
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
	// a00068 / q00016 S4: the PHYSICAL containment check — lexical
	// containment (`../`, absolute paths) plus a `realpath` comparison so a
	// workspace symlink pointing outside (e.g. at /etc/passwd or an
	// attacker-controlled `foo -> ~/.ssh`) is rejected before the file is
	// ever opened. This is the read side's exploitable gap: a write creates
	// its target, so it can't be tricked by a pre-existing symlink the same
	// way; a read follows whatever is already on disk. Symmetric with
	// fsWrite's use of the same primitive family.
	const contained = await resolveExistingWorkspaceContained(
		workspaceRootAbs,
		relativePath,
		authorizedRoots,
	);
	if (!contained.ok) {
		return notFound(relativePath, contained.reason);
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
