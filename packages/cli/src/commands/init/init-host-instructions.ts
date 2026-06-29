/**
 * f00084 S4 — host-instructions centralizer with idempotent append.
 *
 * The block is delimited by `<!-- mcp-vertex:begin -->` and
 * `<!-- mcp-vertex:end -->` markers. When the target file already
 * contains the block, it is replaced in place. When it does not, the
 * block is appended at the end. When the file does not exist, it is
 * created with the block as the only content.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

export type IHostInstructionsTarget = {
	readonly relPath: string;
	readonly body: string;
};

const BEGIN_MARKER = '<!-- mcp-vertex:begin -->';
const END_MARKER = '<!-- mcp-vertex:end -->';

const wrapBlock = (body: string, withTrailingNewline: boolean): string => {
	const base = `${BEGIN_MARKER}\n\n${body.trim()}\n\n${END_MARKER}`;
	return withTrailingNewline ? `${base}\n` : base;
};

/**
 * Pure computation: given the current file contents (or `undefined` when
 * the file is missing) and the mode, return the next file contents.
 *
 * Mode semantics:
 *   - `append`   — replace existing block in place, or append.
 *   - `overwrite` — replace the whole file with the block.
 *   - `skip`     — return `undefined` (caller writes nothing).
 *
 * Idempotency: when the input is exactly what we wrote in a previous
 * run, the output is byte-identical. The key invariant is that
 * `wrapBlock` does NOT add a trailing newline on its own — the caller
 * controls the terminator based on what the existing file ends with.
 */
export const computeHostInstructionsWrite = (
	current: string | undefined,
	body: string,
	mode: 'append' | 'overwrite' | 'skip',
): string | undefined => {
	if (mode === 'skip') return undefined;
	if (mode === 'overwrite') return wrapBlock(body, true);
	if (current === undefined) return wrapBlock(body, true);
	const begin = current.indexOf(BEGIN_MARKER);
	const end = current.indexOf(END_MARKER);
	if (begin >= 0 && end > begin) {
		const before = current.slice(0, begin);
		const after = current.slice(end + END_MARKER.length);
		// Strip the line of leading newlines after the end marker so
		// the surrounding context collapses to a single blank line.
		const collapsedAfter = after.replace(/^\n+/, '\n');
		return `${before}${wrapBlock(body, false)}${collapsedAfter}`;
	}
	const separator = current.endsWith('\n') ? '' : '\n';
	return `${current}${separator}\n${wrapBlock(body, true)}`;
};

export const readHostInstructionsFile = async (
	workspace: string,
	relPath: string,
): Promise<string | undefined> => {
	const path = `${workspace}/${relPath}`;
	if (!existsSync(path)) return undefined;
	return readFile(path, 'utf8');
};
