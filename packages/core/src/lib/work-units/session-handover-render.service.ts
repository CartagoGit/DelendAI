/**
 * session-handover-render.service.ts — the handover as text a session can
 * be given again. The index stays within a byte budget: entries that would
 * pass it are left out and counted, and `show` fetches them whole.
 */
import { SESSION_HANDOVER_INDEX_MAX_BYTES } from '../contracts/constants/session-handover-command.constant';
import type {
	IHandoverEntry,
	IHandoverIndex,
	IHandoverSection,
} from './session-handover.interface';

const entryLine = (entry: IHandoverEntry): string =>
	`  ${entry.id}: ${entry.summary} [${entry.source}]`;

const byteLength = (text: string): number => Buffer.byteLength(text, 'utf8');

/** The index as lines, never past `maxBytes`. */
export const renderHandoverIndex = (
	index: IHandoverIndex,
	maxBytes: number = SESSION_HANDOVER_INDEX_MAX_BYTES,
): string => {
	const sections = Object.keys(index.counts) as IHandoverSection[];
	const lines: string[] = [`session handover ${index.sessionId}`];
	let used = byteLength(lines[0] ?? '');
	let left = 0;
	for (const name of sections) {
		const header = `${name}: ${String(index.counts[name])}${index.missing.includes(name) ? ' (missing: no store answers it)' : ''}`;
		const entries = index.entries[name].map(entryLine);
		lines.push(header);
		used += byteLength(header) + 1;
		for (const line of entries) {
			const size = byteLength(line) + 1;
			if (used + size > maxBytes - 80) {
				left += 1;
				continue;
			}
			lines.push(line);
			used += size;
		}
	}
	if (left > 0) {
		lines.push(
			`${String(left)} more entries left out: show --entry=<id> prints one in full`,
		);
	}
	return `${lines.join('\n')}\n`;
};

/** One entry in full. */
export const renderHandoverEntry = (
	section: IHandoverSection,
	entry: IHandoverEntry,
): string =>
	`${section} ${entry.id}\nsummary: ${entry.summary}\nsource: ${entry.source}\n`;
