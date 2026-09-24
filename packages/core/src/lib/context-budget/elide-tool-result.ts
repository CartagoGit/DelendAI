/**
 * elide-tool-result.ts — an elided tool result stays addressable.
 *
 * A tool result over its byte cap comes back as a stated elision
 * (`truncateIfTooLarge`): the original size, the cap, a structural head.
 * That keeps the caller's context small, but on its own it turns
 * "elided" into "gone" — the rest of the answer was discarded, and a
 * conclusion drawn from the head is drawn from a partial read.
 *
 * So the full output is kept, and the elision says where: when the host
 * has configured a directory, the complete serialised result is written
 * there under its content hash and the envelope carries the path. The
 * caller reads it only when the head is not enough.
 *
 * Process-wide, like the dry-run scope: a tool builds its result with
 * `toolJsonBounded` long after the host assembled it, with no handle on
 * where the host keeps its cache. Keeping the output never fails the
 * tool — a result without an artefact is still a stated elision.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

let artifactDirAbs: string | undefined;

/** Where full outputs are kept; `undefined` stops keeping them. */
export const configureToolOutputArtifacts = (
	dirAbs: string | undefined,
): void => {
	artifactDirAbs = dirAbs;
};

/**
 * Keep `serialised` and return its path, or `undefined` when no
 * directory is configured or it could not be written. Content-addressed,
 * so the same output is kept once however often it is returned.
 */
export const keepFullToolOutput = (serialised: string): string | undefined => {
	if (artifactDirAbs === undefined) return undefined;
	const name = `${createHash('sha256').update(serialised).digest('hex').slice(0, 24)}.json`;
	const path = join(artifactDirAbs, name);
	try {
		mkdirSync(artifactDirAbs, { recursive: true });
		writeFileSync(path, serialised);
		return path;
	} catch {
		return undefined;
	}
};
