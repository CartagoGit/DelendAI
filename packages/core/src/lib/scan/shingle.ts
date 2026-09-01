/**
 * shingle.ts — N-line block deduplication (c00126 S1).
 *
 * Given a map of repo-relative file paths to their body text, detects
 * N-line blocks that appear verbatim in two or more files. Used by
 * the duplicated-cross-plugin rule to flag pure copy-paste across
 * plugins.
 *
 * Pure: no I/O. The caller supplies the file map.
 */
import { fnv1a } from './text-utils';

export interface IShingleHit {
	readonly relPath: string;
	readonly line: number;
	readonly hash: string;
	readonly copies: number;
	readonly snippet: string;
}

export interface IShingleOptions {
	/** Number of consecutive lines that form one block. Default 8. */
	readonly blockLines?: number;
	/** Minimum block size in characters to consider. Default 40. */
	readonly minBlockChars?: number;
}

const isImportOnlyBlock = (lines: readonly string[]): boolean => {
	let insideImport = false;
	let sawImport = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		if (trimmed.startsWith('import ')) {
			sawImport = true;
			insideImport = !trimmed.includes(' from ');
			continue;
		}
		if (insideImport) {
			if (trimmed.includes(' from ')) {
				insideImport = false;
			}
			continue;
		}
		return false;
	}
	return sawImport;
};

/**
 * Detect N-line blocks duplicated across two or more files.
 * Returns one hit per (file, line) pair with the number of distinct
 * files that share the same block.
 */
export const shingleBlocks = (
	fileContents: ReadonlyMap<string, string>,
	options: IShingleOptions = {},
): readonly IShingleHit[] => {
	const blockLines = options.blockLines ?? 8;
	const minChars = options.minBlockChars ?? 40;
	const allHashes = new Map<
		string,
		{ relPath: string; line: number; snippet: string }[]
	>();
	for (const [relPath, body] of fileContents) {
		const lines = body.split('\n');
		for (let i = 0; i + blockLines <= lines.length; i += 1) {
			const block = lines
				.slice(i, i + blockLines)
				.join('\n')
				.trim();
			if (block.length < minChars) continue;
			const blockLinesSlice = lines.slice(i, i + blockLines);
			// Import clauses may span several lines, so count the
			// whole clause instead of only lines starting with import.
			if (isImportOnlyBlock(blockLinesSlice)) continue;
			const hash = fnv1a(block);
			const arr = allHashes.get(hash) ?? [];
			arr.push({
				relPath,
				line: i + 1,
				snippet: block.split('\n')[0] ?? '',
			});
			allHashes.set(hash, arr);
		}
	}
	const out: IShingleHit[] = [];
	for (const [hash, hits] of allHashes) {
		if (hits.length < 2) continue;
		const distinctFiles = new Set(hits.map((h) => h.relPath));
		if (distinctFiles.size < 2) continue;
		for (const h of hits) {
			out.push({
				relPath: h.relPath,
				line: h.line,
				hash,
				copies: distinctFiles.size,
				snippet: h.snippet.slice(0, 80),
			});
		}
	}
	return out;
};
