/**
 * frontmatter-loose.ts — the tolerant frontmatter reader, kept only for a
 * block YAML refuses.
 *
 * It was the proposals plugin's frontmatter parser: a hand-written subset
 * of YAML (root scalars, inline empty arrays, block arrays of scalars and
 * of objects, nested objects). Every block that is YAML is now read by
 * `parseProposalFrontmatter` (`frontmatter.helper.ts`); this one reads only what
 * YAML refuses — frozen legacy files that cannot be repaired — so their
 * values stay what they always were.
 */

import type {
	IYamlScalar,
	IYamlValue,
} from './contracts/interfaces/frontmatter.interface';

export type { IYamlValue } from './contracts/interfaces/frontmatter.interface';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const parseScalar = (raw: string): IYamlScalar => {
	const v = raw.trim();
	if (v === '' || v === 'null' || v === '~') return null;
	if (v === 'true') return true;
	if (v === 'false') return false;
	const n = Number(v);
	if (v !== '' && !Number.isNaN(n) && Number.isFinite(n)) return n;
	// Strip matching surrounding quotes.
	if (
		(v.startsWith('"') && v.endsWith('"')) ||
		(v.startsWith("'") && v.endsWith("'"))
	) {
		return v.slice(1, -1);
	}
	return v;
};

const countIndent = (line: string): number => {
	let n = 0;
	for (const ch of line) {
		if (ch === ' ') n++;
		else break;
	}
	return n;
};

// ---------------------------------------------------------------------------
// Block parsers (mutually recursive via IYamlValue)
// ---------------------------------------------------------------------------

const parseBlockObject = (
	childLines: readonly string[],
): Record<string, IYamlValue> => {
	const obj: Record<string, IYamlValue> = {};
	for (const line of childLines) {
		if (line.trim() === '') continue;
		const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)$/);
		if (!m) continue;
		obj[m[1] ?? ''] = parseScalar((m[2] ?? '').trim());
	}
	return obj;
};

const parseBlockArray = (childLines: readonly string[]): IYamlValue[] => {
	const arr: IYamlValue[] = [];
	let j = 0;

	while (j < childLines.length) {
		const line = childLines[j] ?? '';
		if (line.trim() === '') {
			j++;
			continue;
		}
		// Only start a new item on a '- ' or lone '-' marker.
		const trimmed = line.trim();
		if (!trimmed.startsWith('- ') && trimmed !== '-') {
			j++;
			continue;
		}

		const itemIndent = countIndent(line);
		const itemContent = trimmed.slice(2).trim(); // remove leading '- '

		if (itemContent === '') {
			// Multi-line item: next lines with higher indent form the object.
			j++;
			const objLines: string[] = [];
			while (j < childLines.length) {
				const inner = childLines[j] ?? '';
				if (inner.trim() === '') {
					j++;
					continue;
				}
				const innerIndent = countIndent(inner);
				// A new array item at the same indent marks the end.
				if (
					innerIndent <= itemIndent &&
					inner.trim().startsWith('- ')
				) {
					break;
				}
				if (innerIndent <= itemIndent) break;
				// Normalise to a common indent baseline for parseBlockObject.
				objLines.push(inner.slice(itemIndent + 2));
				j++;
			}
			arr.push(parseBlockObject(objLines));
		} else if (itemContent.includes(':')) {
			// Possible key: value item, possibly with sibling keys.
			const m = itemContent.match(
				/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)$/,
			);
			if (m) {
				const obj: Record<string, IYamlValue> = {};
				obj[m[1] ?? ''] = parseScalar((m[2] ?? '').trim());
				j++;
				// Collect sibling keys that are more deeply indented.
				while (j < childLines.length) {
					const sib = childLines[j] ?? '';
					if (sib.trim() === '') {
						j++;
						continue;
					}
					const sibIndent = countIndent(sib);
					// A new array item at the same indent ends this item.
					if (sib.trim().startsWith('- ')) break;
					if (sibIndent <= itemIndent) break;
					const sm = sib
						.trim()
						.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*?)$/);
					if (sm) {
						obj[sm[1] ?? ''] = parseScalar((sm[2] ?? '').trim());
					}
					j++;
				}
				arr.push(obj);
			} else {
				// Contains ':' but doesn't match key: value — treat as scalar.
				arr.push(parseScalar(itemContent));
				j++;
			}
		} else {
			arr.push(parseScalar(itemContent));
			j++;
		}
	}

	return arr;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a YAML block (the raw content *between* the `---` markers, without
 * the markers themselves) into a plain JS object.
 *
 * Unrecognised lines are silently skipped. All scalar values are returned as
 * their native JS type (string | number | boolean | null).
 */
export const parseLooseFrontmatter = (
	block: string,
): Record<string, IYamlValue> => {
	const lines = block.split('\n');
	const result: Record<string, IYamlValue> = {};
	let i = 0;

	const consumeBlockValue = (): IYamlValue => {
		// Collect all indented lines until the next root-level key.
		const childLines: string[] = [];
		while (i < lines.length) {
			const line = lines[i] ?? '';
			if (line.trim() === '') {
				// Keep blank lines only if we are already inside a block.
				if (childLines.length > 0) childLines.push(line);
				i++;
				continue;
			}
			if (countIndent(line) === 0) break;
			childLines.push(line);
			i++;
		}

		// Trim trailing blank lines.
		while (
			childLines.length > 0 &&
			(childLines[childLines.length - 1] ?? '').trim() === ''
		) {
			childLines.pop();
		}

		if (childLines.length === 0) return null;

		const firstContent = childLines.find((l) => l.trim() !== '') ?? '';
		const firstTrimmed = firstContent.trim();

		if (firstTrimmed.startsWith('- ') || firstTrimmed === '-') {
			return parseBlockArray(childLines);
		}
		return parseBlockObject(childLines);
	};

	while (i < lines.length) {
		const line = lines[i] ?? '';
		if (line.trim() === '') {
			i++;
			continue;
		}
		// Skip orphan indented lines at root level (shouldn't happen in
		// well-formed YAML, but guards against partial parsing artifacts).
		if (countIndent(line) > 0) {
			i++;
			continue;
		}

		const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)?$/);
		if (!m) {
			i++;
			continue;
		}

		const key = m[1] ?? '';
		const inline = (m[2] ?? '').trim();

		if (inline === '[]') {
			result[key] = [];
			i++;
		} else if (inline.startsWith('[') && inline.endsWith(']')) {
			// Flow-sequence of scalars, e.g. `blocked_by: [self:goal-missing, f400]`.
			// Tokens are split on top-level commas only — nested `[...]`/`{...}`
			// aren't supported (none of this repo's frontmatter needs them);
			// a colon inside a token (`self:goal-missing`) stays part of the
			// scalar instead of being mistaken for a block-mapping key, which
			// is exactly the ambiguity the block-array parser below has for
			// the same token shape.
			const inner = inline.slice(1, -1).trim();
			result[key] =
				inner === ''
					? []
					: inner
							.split(',')
							.map((token) => parseScalar(token.trim()));
			i++;
		} else if (inline !== '') {
			result[key] = parseScalar(inline);
			i++;
		} else {
			i++;
			result[key] = consumeBlockValue();
		}
	}

	return result;
};
