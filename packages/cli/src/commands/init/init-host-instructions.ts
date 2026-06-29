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

const wrapBlock = (body: string): string =>
	`${BEGIN_MARKER}\n\n${body.trim()}\n\n${END_MARKER}\n`;

/**
 * Pure computation: given the current file contents (or `undefined` when
 * the file is missing) and the mode, return the next file contents.
 *
 * Mode semantics:
 *   - `append`   — replace existing block in place, or append.
 *   - `overwrite` — replace the whole file with the block.
 *   - `skip`     — return `undefined` (caller writes nothing).
 */
export const computeHostInstructionsWrite = (
	current: string | undefined,
	body: string,
	mode: 'append' | 'overwrite' | 'skip',
): string | undefined => {
	if (mode === 'skip') return undefined;
	const block = wrapBlock(body);
	if (mode === 'overwrite') return block;
	if (current === undefined) return block;
	const begin = current.indexOf(BEGIN_MARKER);
	const end = current.indexOf(END_MARKER);
	if (begin >= 0 && end > begin) {
		const before = current.slice(0, begin);
		const after = current.slice(end + END_MARKER.length);
		return `${before}${block}${after.replace(/^\n+/, '\n')}`;
	}
	const separator = current.endsWith('\n') ? '\n' : '\n\n';
	return `${current}${separator}${block}`;
};

export const readHostInstructionsFile = async (
	workspace: string,
	relPath: string,
): Promise<string | undefined> => {
	const path = `${workspace}/${relPath}`;
	if (!existsSync(path)) return undefined;
	return readFile(path, 'utf8');
};
