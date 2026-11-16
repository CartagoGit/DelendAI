/**
 * Reads the slices of a proposal the way a person wrote them, keeping the
 * text the readiness rules quote back. Pure: a string in, slices out.
 */
import type { IReadinessSlice } from '../contracts/interfaces/proposal-readiness.interface';

const SLICE_HEADER = /^###\s+(S\d+[A-Za-z]*)\s+—/u;
const SECTION_HEADER = /^##\s/u;
const FIELD = (name: string): RegExp =>
	new RegExp(`^[-*]\\s*(?:\\*\\*${name}\\*\\*|${name}):[ \\t]*(.*)$`, 'iu');

/** A field's value: the rest of its line plus indented continuation lines. */
const readField = (
	lines: readonly string[],
	name: string,
): string | undefined => {
	const head = FIELD(name);
	for (let index = 0; index < lines.length; index += 1) {
		const match = head.exec(lines[index] ?? '');
		if (match === null) continue;
		const parts = [match[1] ?? ''];
		for (const next of lines.slice(index + 1)) {
			if (!/^[ \t]+\S/u.test(next)) break;
			parts.push(next.trim());
		}
		return parts.join('\n').trim();
	}
	return undefined;
};

/** The quoted or bare items under an `acceptance:` field. */
const readAcceptance = (lines: readonly string[]): readonly string[] => {
	const head = FIELD('acceptance');
	const start = lines.findIndex((line) => head.test(line));
	if (start < 0) return [];
	const items: string[] = [];
	const inline = head.exec(lines[start] ?? '')?.[1]?.trim() ?? '';
	if (inline.length > 0) items.push(inline);
	for (const next of lines.slice(start + 1)) {
		const item = /^[ \t]+[-*][ \t]+(.+)$/u.exec(next);
		if (item === null) break;
		items.push((item[1] ?? '').trim().replace(/^"(.*)"$/u, '$1'));
	}
	return items;
};

const readDependsOn = (lines: readonly string[]): readonly string[] => {
	const raw = readField(lines, 'DependsOn') ?? '';
	return raw
		.replace(/^\[|\]$/gu, '')
		.split(',')
		.map((id) => id.replace(/["'`]/gu, '').trim().toUpperCase())
		.filter((id) => id.length > 0);
};

/** Every `### S<n>` block of a proposal, in document order. */
export const readReadinessSlices = (
	markdown: string,
): readonly IReadinessSlice[] => {
	const slices: IReadinessSlice[] = [];
	let id: string | undefined;
	let body: string[] = [];
	const close = (): void => {
		if (id !== undefined) {
			slices.push({
				id,
				status: (
					/^([A-Za-z_-]+)/u.exec(
						readField(body, 'Status') ?? '',
					)?.[1] ?? 'pending'
				).toLowerCase(),
				filesText: readField(body, 'Files'),
				acceptance: readAcceptance(body),
				decisions: readField(body, 'Decisions'),
				dependsOn: readDependsOn(body),
			});
		}
		id = undefined;
		body = [];
	};
	for (const line of markdown.split('\n')) {
		const header = SLICE_HEADER.exec(line);
		if (header !== null) {
			close();
			id = (header[1] ?? '').toUpperCase();
			continue;
		}
		if (SECTION_HEADER.test(line)) {
			close();
			continue;
		}
		if (id !== undefined) body.push(line);
	}
	close();
	return slices;
};
