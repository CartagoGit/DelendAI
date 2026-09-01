/**
 * workflow-yaml.ts — minimal YAML parser for GitHub Actions
 * workflow files. Lives next to the `tier-budget.spec.ts` and
 * `tier-trigger.spec.ts` consumers and is exported so a future
 * workflow-shape lint can reuse the same parser.
 *
 * Scope (intentionally narrow):
 *
 *   - Top-level scalar `name: <string>`.
 *   - Top-level `on:` / `jobs:` maps at column 0.
 *   - Nested maps (`on.pull_request.branches`, `jobs.<id>.timeout-minutes`).
 *   - Flow-style lists (`[a, b, c]`) — the only list shape used
 *     by the workflow files in this repo.
 *   - Block-style list of single-key maps (`schedule: [{ cron: '...' }]`)
 *     so tier3's nightly schedule parses.
 *   - Comments (lines starting with `#`).
 *   - Quoted strings (`'a b c'` and `"a b c"`) for cron values
 *     that contain spaces.
 *
 * Out of scope (deliberately):
 *
 *   - Multi-key block lists.
 *   - Multi-document files (`---`).
 *   - Anchors / aliases.
 *   - Block scalars (`|` / `>`).
 *   - Type tags (`!!str` etc.).
 *
 * The parser is **pure**: no I/O, no mutation. Specs feed it
 * raw strings and assert on the result.
 *
 * Why not `yaml` from npm?
 * ------------------------
 * `yaml@2` would be the obvious choice, but the proposal
 * forbids new npm deps, and the dependency tree in this repo
 * only ships `yaml` as a transitive of `tools/docs-api`. The
 * shape we need is small enough that a focused parser keeps
 * the bundle and the install graph clean.
 */

export type YamlValue =
	| string
	| number
	| boolean
	| null
	| readonly YamlValue[]
	| { readonly [key: string]: YamlValue };

interface ILine {
	readonly indent: number;
	readonly content: string;
}

/**
 * Tokenise a YAML string into indented lines. Blank lines and
 * comment-only lines are skipped.
 */
const tokenise = (raw: string): readonly ILine[] => {
	const out: ILine[] = [];
	for (const line of raw.split('\n')) {
		// Strip trailing CR (Windows files) and trailing whitespace.
		const stripped = line.replace(/\r$/, '').replace(/\s+$/, '');
		if (stripped.length === 0) continue;
		if (stripped.trimStart().startsWith('#')) continue;
		const indent = stripped.length - stripped.trimStart().length;
		out.push({ indent, content: stripped.trimStart() });
	}
	return out;
};

/**
 * Parse a single scalar from a content string. Handles quoted
 * strings (single + double), numbers, and the standard YAML
 * keywords.
 */
/**
 * Strip a trailing `# …` comment from a content string, but
 * only when the comment sits outside a quoted region. YAML
 * permits inline comments after values; this parser only
 * understands comments that start with ` #` (space + hash).
 */
const stripInlineComment = (raw: string): string => {
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < raw.length; i += 1) {
		const ch = raw[i];
		if (ch === "'" && !inDouble) inSingle = !inSingle;
		else if (ch === '"' && !inSingle) inDouble = !inDouble;
		else if (ch === '#' && !inSingle && !inDouble) {
			// Must be preceded by whitespace to count as an
			// inline comment (not a hash in a URL).
			if (i > 0 && /\s/.test(raw[i - 1] ?? '')) {
				return raw.slice(0, i).trimEnd();
			}
		}
	}
	return raw;
};

const parseScalar = (raw: string): YamlValue => {
	const trimmed = stripInlineComment(raw).trim();
	if (trimmed === '~' || trimmed === 'null' || trimmed === '') return null;
	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;
	if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
	if (/^-?\d+\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);
	// Strip surrounding single or double quotes.
	if (
		(trimmed.startsWith("'") && trimmed.endsWith("'")) ||
		(trimmed.startsWith('"') && trimmed.endsWith('"'))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
};

/**
 * `true` when the value part of a `key:` line is a block-scalar
 * indicator (`|` for literal, `>` for folded). The parser only
 * recognises the bare indicator — chomping indicators (`|+`,
 * `|-`, `|2`) are uncommon in workflow files and treated as
 * scalar strings to keep the grammar small.
 */
const isBlockScalarIndicator = (value: string): boolean => {
	const trimmed = value.trim();
	return trimmed === '|' || trimmed === '>';
};

/**
 * Read a YAML block scalar (`|` or `>`) that starts on the line
 * AFTER the indicator. Continues consuming lines while they are
 * indented strictly more than `parentIndent`. Returns the joined
 * string and advances the cursor past the last consumed line.
 */
const parseBlockScalar = (
	state: IParserState,
	parentIndent: number,
	kind: 'literal' | 'folded',
): string => {
	if (state.cursor >= state.lines.length) return '';
	const first = state.lines[state.cursor];
	if (first === undefined || first.indent <= parentIndent) return '';
	const contentIndent = first.indent;
	const lines: string[] = [];
	while (state.cursor < state.lines.length) {
		const line = state.lines[state.cursor];
		if (line === undefined || line.indent < contentIndent) break;
		lines.push(line.content.slice(contentIndent));
		state.cursor += 1;
	}
	return kind === 'folded' ? lines.join(' ') : lines.join('\n');
};

/**
 * Parse a flow-style list `[a, b, c]`. Returns `null` if the
 * content does not start with `[` — the caller falls back to
 * block-style parsing in that case.
 */
const parseFlowList = (raw: string): readonly YamlValue[] | null => {
	const trimmed = raw.trim();
	if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
	const inside = trimmed.slice(1, -1).trim();
	if (inside.length === 0) return [];
	// Naive split — adequate for the strings this parser handles
	// (branches, types, etc. never contain `,`).
	const parts = inside
		.split(',')
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	return parts.map(parseScalar) as YamlValue[];
};

interface IParserState {
	readonly lines: readonly ILine[];
	/**
	 * Mutable index into `lines`. The parser advances `cursor`
	 * by one line per consumed token; nested blocks (lists,
	 * maps, block scalars) advance it past their full subtree.
	 */
	cursor: number;
}

/**
 * Parse a YAML block starting at `state.cursor`. The cursor is
 * advanced past every line consumed at or beyond `state.lines[cursor].indent`.
 */
const parseBlock = (state: IParserState, indent: number): YamlValue => {
	if (state.cursor >= state.lines.length) return null;
	const current = state.lines[state.cursor];
	if (current === undefined || current.indent < indent) return null;

	// List items take precedence over maps: a line that starts with
	// `- ` is a list entry even when its remainder is `key: value`.
	// Mis-classifying it as a map would re-enter parseMap at the
	// list-item indent and read follow-up keys (`uses: ...`,
	// `with: ...`) as over-indented map keys, throwing.
	if (current.content.startsWith('- ')) {
		return parseList(state, indent);
	}
	// Look at the content to decide between map or scalar.
	const colonIndex = findMapColon(current.content);
	if (colonIndex !== -1) {
		return parseMap(state, indent);
	}
	// Bare scalar at this indent.
	state.cursor += 1;
	return parseScalar(current.content);
};

/**
 * Find the colon that separates a key from its value, ignoring
 * colons inside quoted strings. Returns -1 when the content is
 * not a key:value line.
 */
const findMapColon = (content: string): number => {
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < content.length; i += 1) {
		const ch = content[i];
		if (ch === "'" && !inDouble) inSingle = !inSingle;
		else if (ch === '"' && !inSingle) inDouble = !inDouble;
		else if (ch === ':' && !inSingle && !inDouble) {
			// Must be followed by whitespace, end-of-line, or another
			// structural character so URLs like `https://...` don't
			// get split.
			const next = content[i + 1];
			if (next === undefined || /\s/.test(next) || next === '#') {
				return i;
			}
		}
	}
	return -1;
};

const parseMap = (state: IParserState, indent: number): YamlValue => {
	const result: Record<string, YamlValue> = {};
	while (state.cursor < state.lines.length) {
		const current = state.lines[state.cursor];
		if (current === undefined || current.indent < indent) break;
		if (current.indent > indent) {
			throw new Error(
				`workflow-yaml: unexpected indent ${current.indent} at line ${state.cursor + 1} (expected ≤ ${indent})`,
			);
		}
		const colonIndex = findMapColon(current.content);
		if (colonIndex === -1) break;
		const key = current.content.slice(0, colonIndex).trim();
		const valuePart = current.content.slice(colonIndex + 1).trim();
		state.cursor += 1;
		if (valuePart.length === 0) {
			// Nested value — read the block at greater indent.
			if (state.cursor >= state.lines.length) {
				result[key] = null;
				continue;
			}
			const next = state.lines[state.cursor];
			if (next === undefined || next.indent <= indent) {
				result[key] = null;
				continue;
			}
			result[key] = parseBlock(state, next.indent);
		} else if (isBlockScalarIndicator(valuePart)) {
			// `key: |` or `key: >` — read content at deeper indent.
			const kind = valuePart.trim() === '>' ? 'folded' : 'literal';
			result[key] = parseBlockScalar(state, indent, kind);
		} else {
			result[key] = parseScalarOrFlowList(valuePart);
		}
	}
	return result;
};

const parseScalarOrFlowList = (raw: string): YamlValue => {
	const flowList = parseFlowList(raw);
	if (flowList !== null) return flowList;
	return parseScalar(raw);
};

const parseList = (state: IParserState, indent: number): YamlValue => {
	const items: YamlValue[] = [];
	while (state.cursor < state.lines.length) {
		const current = state.lines[state.cursor];
		if (current === undefined || current.indent < indent) break;
		if (current.indent > indent) {
			throw new Error(
				`workflow-yaml: unexpected indent ${current.indent} at line ${state.cursor + 1} (expected ≤ ${indent})`,
			);
		}
		if (!current.content.startsWith('- ')) break;
		const remainder = current.content.slice(2).trim();
		state.cursor += 1;
		// Decide what kind of item this is:
		//   `- <scalar>`              — bare scalar.
		//   `- [a, b]`                — flow-style list.
		//   `- key: value`            — single-line map (possibly with
		//                                nested value when `key:` is empty).
		//   `- key: value` + indented — multi-key map, additional keys
		//                                follow at indent ≥ remainder indent.
		if (remainder.length === 0) {
			// Nested value follows at greater indent.
			if (state.cursor >= state.lines.length) {
				items.push(null);
				continue;
			}
			const next = state.lines[state.cursor];
			if (next === undefined || next.indent <= indent) {
				items.push(null);
				continue;
			}
			items.push(parseBlock(state, next.indent));
			continue;
		}

		const colonIdx = findMapColon(remainder);
		if (colonIdx === -1) {
			items.push(parseScalarOrFlowList(remainder));
			continue;
		}

		// `remainder` is the first `key: value` of an item map. We
		// need to know whether the value continues on the next
		// lines (deeper indent) before we can decide the item's
		// shape.
		const key = remainder.slice(0, colonIdx).trim();
		const valuePart = remainder.slice(colonIdx + 1).trim();
		const item: Record<string, YamlValue> = {};
		if (valuePart.length === 0) {
			if (state.cursor < state.lines.length) {
				const next = state.lines[state.cursor];
				if (next !== undefined && next.indent > indent + 2) {
					item[key] = parseBlock(state, next.indent);
				} else {
					item[key] = null;
				}
			} else {
				item[key] = null;
			}
		} else {
			item[key] = parseScalarOrFlowList(valuePart);
		}

		// Read additional `key: value` lines that belong to this
		// list item (same indent as the original `remainder`'s
		// first key, which is `indent + 2`).
		const itemIndent = indent + 2;
		while (state.cursor < state.lines.length) {
			const follow = state.lines[state.cursor];
			if (follow === undefined || follow.indent < itemIndent) break;
			if (follow.indent > itemIndent) {
				throw new Error(
					`workflow-yaml: unexpected indent ${follow.indent} at line ${state.cursor + 1} (expected ≤ ${itemIndent})`,
				);
			}
			const followColon = findMapColon(follow.content);
			if (followColon === -1) break;
			const followKey = follow.content.slice(0, followColon).trim();
			const followValue = follow.content.slice(followColon + 1).trim();
			state.cursor += 1;
			if (followValue.length === 0) {
				if (state.cursor < state.lines.length) {
					const next = state.lines[state.cursor];
					if (next !== undefined && next.indent > itemIndent) {
						item[followKey] = parseBlock(state, next.indent);
						continue;
					}
				}
				item[followKey] = null;
			} else if (isBlockScalarIndicator(followValue)) {
				const kind = followValue.trim() === '>' ? 'folded' : 'literal';
				item[followKey] = parseBlockScalar(state, itemIndent, kind);
			} else {
				item[followKey] = parseScalarOrFlowList(followValue);
			}
		}

		items.push(item);
	}
	return items;
};

/**
 * Parse the YAML text of a GitHub Actions workflow file. The
 * top level must start at column 0; nested levels are inferred
 * from indentation.
 *
 * Returns a plain JS object — no `Map` / `Set` — so consumers
 * can pattern-match with `in` / property access without a
 * runtime cost.
 */
export const parseWorkflowYaml = (raw: string): Record<string, YamlValue> => {
	const lines = tokenise(raw);
	const state: IParserState = { lines, cursor: 0 };
	if (lines.length === 0) return {};
	const top = lines[0];
	if (top === undefined || top.indent !== 0) {
		throw new Error(
			'workflow-yaml: top-level content must start at column 0',
		);
	}
	const root = parseMap(state, 0);
	return root as Record<string, YamlValue>;
};
