/**
 * agent-frontmatter.ts — the narrow YAML subset an agent file's
 * frontmatter uses, read and written back without losing a line.
 * Split from the agent-files migrator, which only decides what to
 * rewrite.
 */
import type { IFrontmatterShape } from '../../contracts/interfaces/agent-frontmatter.interface';

/**
 * A tiny YAML parser tuned to frontmatter. It handles:
 *
 *   key: value
 *   key: "quoted value"
 *   key: true | false
 *   key: 123 | 1.5
 *   key: null
 *   key: [a, b, c]
 *   # comments
 *
 * Anything outside that subset is preserved as the original raw
 * line under `__raw_<index>` keys so the writer can emit them
 * verbatim. The whole point is to not lose data on the round trip.
 */
export const parseFrontmatter = (text: string): IFrontmatterShape => {
	const out: IFrontmatterShape = {};
	const lines = text.split(/\r?\n/u);
	let rawIndex = 0;
	for (const rawLine of lines) {
		const line = rawLine.replace(/\s*#.*$/u, '').trim();
		if (line.length === 0) continue;
		const colonAt = line.indexOf(':');
		if (colonAt <= 0) {
			out[`__raw_${rawIndex}`] = rawLine;
			rawIndex += 1;
			continue;
		}
		const key = line.slice(0, colonAt).trim();
		const rest = line.slice(colonAt + 1).trim();
		if (rest.length === 0) {
			out[key] = null;
			continue;
		}
		if (rest === 'true' || rest === 'false') {
			out[key] = rest === 'true';
			continue;
		}
		if (rest === 'null' || rest === '~') {
			out[key] = null;
			continue;
		}
		if (/^-?\d+(?:\.\d+)?$/u.test(rest)) {
			out[key] = Number(rest);
			continue;
		}
		if (rest.startsWith('[') && rest.endsWith(']')) {
			const inner = rest.slice(1, -1).trim();
			if (inner.length === 0) {
				out[key] = [];
				continue;
			}
			out[key] = inner
				.split(',')
				.map((entry) => entry.trim())
				.map((entry) => {
					if (
						(entry.startsWith('"') && entry.endsWith('"')) ||
						(entry.startsWith("'") && entry.endsWith("'"))
					) {
						return entry.slice(1, -1);
					}
					return entry;
				});
			continue;
		}
		if (
			(rest.startsWith('"') && rest.endsWith('"')) ||
			(rest.startsWith("'") && rest.endsWith("'"))
		) {
			out[key] = rest.slice(1, -1);
			continue;
		}
		out[key] = rest;
	}
	return out;
};

/**
 * Serialise a parsed frontmatter back to its `---\n...\n---\n`
 * envelope. The format mirrors the parser: one `key: value` per
 * line, with quotes emitted only when needed (strings containing a
 * colon, for example).
 */
export const serialiseFrontmatter = (
	frontmatter: IFrontmatterShape,
): string => {
	const lines: string[] = [];
	for (const [key, value] of Object.entries(frontmatter)) {
		if (key.startsWith('__raw_')) {
			lines.push(String(value));
			continue;
		}
		if (value === null || value === undefined) {
			lines.push(`${key}:`);
			continue;
		}
		if (typeof value === 'boolean') {
			lines.push(`${key}: ${value ? 'true' : 'false'}`);
			continue;
		}
		if (typeof value === 'number') {
			lines.push(`${key}: ${value}`);
			continue;
		}
		if (Array.isArray(value)) {
			const items = value.map((entry) =>
				/[:#\s]/u.test(entry) ? `"${entry}"` : entry,
			);
			lines.push(`${key}: [${items.join(', ')}]`);
			continue;
		}
		const stringValue = String(value);
		const needsQuotes =
			/[:#]/u.test(stringValue) || stringValue.length === 0;
		lines.push(`${key}: ${needsQuotes ? `"${stringValue}"` : stringValue}`);
	}
	return `---\n${lines.join('\n')}\n---\n`;
};

/**
 * Split a markdown file into its frontmatter block (if any) and
 * the body. Returns `{ kind: 'plain' }` for files with no
 * frontmatter.
 */
export const splitMarkdown = (
	text: string,
):
	| { readonly kind: 'with-frontmatter'; frontmatter: string; body: string }
	| {
			readonly kind: 'plain';
			readonly body: string;
	  } => {
	if (!text.startsWith('---\n')) return { kind: 'plain', body: text };
	const close = text.indexOf('\n---\n', 4);
	if (close === -1) return { kind: 'plain', body: text };
	const frontmatter = text.slice(4, close);
	const body = text.slice(close + 5);
	return { kind: 'with-frontmatter', frontmatter, body };
};
