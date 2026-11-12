/**
 * host-config-jsonc.ts — reading a host config the way the editor reads
 * it, and editing it without losing what the owner wrote.
 *
 * ## Why this is its own module
 *
 * The migrator that rewrites a host config is about the REWRITE: which
 * entries, which fields, which names. Reading a file that may carry
 * comments, and turning a rewritten value back into text that keeps
 * those comments, is a different job with a different shape — and it
 * grew until it pushed the migrator past the size every file in this
 * package is held to.
 *
 * ## The two readers
 *
 * A file plain JSON can parse IS a plain JSON file, and it is rewritten
 * exactly as it always was: same rules, same bytes, same indentation.
 * Only a file plain JSON cannot parse is treated as a JSONC document —
 * a comment, a trailing comma — and edited in place, so the comments,
 * the key order and the owner's own formatting survive the rewrite.
 *
 * A document that is neither plain JSON nor valid JSONC is refused: a
 * file that is genuinely broken is reported, never half-understood.
 */
import { readFile } from 'node:fs/promises';

import type { IHostConfigDocument } from '../../contracts/interfaces/host-config-document.interface';
import {
	applyJsoncEdits,
	parseJsonc,
	type IJsoncEdit,
} from '../../config/jsonc-document';
import { isRecord } from '../../shared/is-record';
import { HostConfigParseError } from './host-config-parse.error';

/**
 * Read a PROJECT-level host config — the one a host reads from the
 * workspace.
 *
 * Named apart from the user-level reader of `host-scope/`, which reads
 * `~/.claude.json` and dispatches per host: two different files, two
 * different readers, and a name that says which one is which.
 *
 * A file plain JSON can parse is a plain JSON file. A file plain JSON
 * cannot parse is a JSONC document — a comment, a trailing comma — and
 * it is read leniently. A document that is neither is refused with the
 * same error as before, so a file that is genuinely broken is reported
 * instead of half-understood.
 */
export const readProjectHostConfig = async (
	absolutePath: string,
): Promise<IHostConfigDocument> => {
	const text = await readFile(absolutePath, 'utf8');
	let strict: unknown;
	try {
		strict = JSON.parse(text);
	} catch {
		strict = undefined;
	}
	if (strict !== undefined) {
		if (!isRecord(strict)) {
			throw new HostConfigParseError(
				absolutePath,
				'top-level value is not an object',
			);
		}
		return { text, value: strict, plain: true };
	}
	const parsed = parseJsonc(text);
	const first = parsed.errors[0];
	if (first !== undefined)
		throw new HostConfigParseError(absolutePath, first.message);
	if (!isRecord(parsed.value)) {
		throw new HostConfigParseError(
			absolutePath,
			'top-level value is not an object',
		);
	}
	return { text, value: parsed.value, plain: false };
};

/**
 * The member-level differences between two values, as JSONC edits.
 *
 * A member that disappeared is a rename — the rewrite renames a server
 * by its own id — and a rename is applied by removing the old name and
 * adding the new one, which moves the server to the end of its map.
 * The caller replaces the whole map instead when that would happen, so
 * a renamed server keeps its place.
 */
const diffEdits = (
	before: unknown,
	after: unknown,
	path: readonly (string | number)[],
): readonly IJsoncEdit[] => {
	if (JSON.stringify(before) === JSON.stringify(after)) return [];
	if (!isRecord(before) || !isRecord(after)) return [{ path, value: after }];
	const edits: IJsoncEdit[] = [];
	for (const [key, child] of Object.entries(before)) {
		if (!Object.hasOwn(after, key)) {
			edits.push({ path: [...path, key], value: undefined });
			continue;
		}
		edits.push(...diffEdits(child, after[key], [...path, key]));
	}
	for (const [key, child] of Object.entries(after)) {
		if (!Object.hasOwn(before, key))
			edits.push({ path: [...path, key], value: child });
	}
	return edits;
};

/**
 * The edits that turn a parsed host config into its rewritten self.
 *
 * Every changed member is edited where it stands, so the comments
 * around it, the key order and the owner's own formatting all survive.
 */
export const hostConfigEdits = (
	before: Record<string, unknown>,
	after: Record<string, unknown>,
): readonly IJsoncEdit[] => {
	const edits: IJsoncEdit[] = [];
	for (const [key, child] of Object.entries(after)) {
		const previous = before[key];
		if (previous === undefined) {
			edits.push({ path: [key], value: child });
			continue;
		}
		if (JSON.stringify(previous) === JSON.stringify(child)) continue;
		const nested = diffEdits(previous, child, [key]);
		// A member that disappeared was RENAMED. Removing it and adding
		// its new name would move the server to the end of its map, so
		// the map is replaced whole and keeps its order instead.
		if (nested.some((edit) => edit.value === undefined))
			edits.push({ path: [key], value: child });
		else edits.push(...nested);
	}
	return edits;
};

/**
 * The text a rewritten host config becomes, or `undefined` when it
 * names nothing to change.
 *
 * A plain JSON file is rewritten as it always was: the same bytes, the
 * same indentation, the same trailing newline. A file that needed the
 * lenient reader is edited in place instead, so the comments it carries
 * are still there afterwards.
 */
export const rewrittenDocumentText = (
	document: IHostConfigDocument,
	next: Record<string, unknown>,
): string | undefined => {
	if (document.plain) return `${JSON.stringify(next, null, '\t')}\n`;
	const edits = hostConfigEdits(document.value, next);
	if (edits.length === 0) return undefined;
	return applyJsoncEdits(document.text, edits);
};
