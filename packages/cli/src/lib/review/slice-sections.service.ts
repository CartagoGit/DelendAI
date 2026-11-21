/**
 * slice-sections.service.ts — the part of a proposal a reviewer judges.
 *
 * A reviewer was told to read the proposal, and a long-running plan is
 * tens of kilobytes (x00835 reached 88 KB, x00875 56 KB) of slices already
 * judged. What it judges is the section of each slice that waits for a
 * verdict: those sections are handed over, and the whole document is
 * needed only when one of them refers to another.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The `### <slice> …` sections of `markdown` for `slices`, by slice id. */
export const sliceSections = (
	markdown: string,
	slices: readonly string[],
): Readonly<Record<string, string>> => {
	const lines = markdown.split('\n');
	const sections: Record<string, string> = {};
	for (const slice of slices) {
		const start = lines.findIndex((line) =>
			new RegExp(`^### ${slice}(?:\\s|$)`, 'u').test(line),
		);
		if (start === -1) continue;
		const rest = lines.slice(start + 1);
		const end = rest.findIndex((line) => /^#{2,3} /u.test(line));
		sections[slice] = [
			lines[start],
			...(end === -1 ? rest : rest.slice(0, end)),
		]
			.join('\n')
			.trim();
	}
	return sections;
};

/**
 * The proposal's text, from the unit's tree: `file` is relative to the
 * repository or to the proposals directory, depending on the reader.
 */
export const readProposalIn = async (
	unitPath: string,
	file: string,
	proposalsDir: string,
): Promise<string | undefined> => {
	for (const path of [
		join(unitPath, file),
		join(unitPath, proposalsDir, file),
	]) {
		const text = await readFile(path, 'utf8').catch(() => undefined);
		if (text !== undefined) return text;
	}
	return undefined;
};
