// filepath: libs/mcp-project/src/lib/shared/proposal-frontmatter.ts
// Tiny frontmatter parser for the orchestrator handoff metrics.
//
// the host project proposals use a flat YAML frontmatter with simple
// `key: value` lines (no nested objects, no lists). This module
// parses exactly that shape. It is intentionally NOT a full YAML
// parser: only needs `opened` / `created` / `updated` and
// pulling `js-yaml` for that would be overkill and would bloat the
// runtime for a single integer metric.
//
// Conventions respected:
//   - No `as any`. The parser returns `string | undefined`
//     for every key and the caller narrows.
//   - Pure function; no I/O. The caller decides which file to read.
//   - The parser is strict about the frontmatter fence: the file
//     must start with `---` on the first line and end with `---` on
//     a subsequent line. Anything else returns an empty record.

const FENCE = '---';

export type IProposalFrontmatter = Readonly<Record<string, string>>;

/**
 * Parse the leading `--- ... ---` block of a markdown file and
 * return a flat `key -> value` map. Lines that do not match the
 * `key: value` shape are ignored (they may be blank, comments, or
 * section breaks). Values are trimmed but not type-coerced: the
 * caller is responsible for date parsing.
 */
export function parseProposalFrontmatter(source: string): IProposalFrontmatter {
	if (!source.startsWith(FENCE)) return {};
	const rest = source.slice(FENCE.length);
	const endIdx = rest.indexOf(`\n${FENCE}`);
	if (endIdx < 0) return {};
	const block = rest.slice(0, endIdx);
	const out: Record<string, string> = {};
	for (const line of block.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		if (trimmed.startsWith('#')) continue;
		const colon = trimmed.indexOf(':');
		if (colon <= 0) continue;
		const key = trimmed.slice(0, colon).trim();
		let value = trimmed.slice(colon + 1).trim();
		// Strip wrapping quotes if present (YAML style).
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

/**
 * Read the `opened` (or fall back to `created` or `updated`) date
 * from a proposal's frontmatter and return the age in hours. Returns
 * `null` if the field is missing, malformed, or unparseable. The
 * orchestrator uses this to detect zombie `in_progress` proposals
 * that have been silent for more than 24 h.
 */
export function proposalAgeHours(
	frontmatter: IProposalFrontmatter,
	now: number = Date.now(),
): number | null {
	const raw =
		frontmatter.opened ?? frontmatter.updated ?? frontmatter.created;
	if (raw === undefined) return null;
	const ts = Date.parse(raw);
	if (Number.isNaN(ts)) return null;
	const diffMs = now - ts;
	if (diffMs < 0) return 0; // future-dated -> treat as fresh
	return diffMs / (60 * 60 * 1000);
}
