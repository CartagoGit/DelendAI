/**
 * proposal-frontmatter-writer.ts
 *
 * Pure, byte-level mutations of a proposal markdown's YAML frontmatter.
 *
 * SRP: this module owns ONLY the question "given a raw markdown blob,
 * how do I change one frontmatter field without touching anything
 * else?". It performs no I/O — callers (`proposal-transition.tool.ts`,
 * `close-plan.tool.ts`, future `proposals_edit`) read the blob, hand
 * it through these helpers, and write the result back via
 * `withFileMutex` + `writeFileAtomic`.
 *
 * Pre-refactor: `setFrontmatterStatus` was a private helper inside
 * `proposal-transition.tool.ts`. Moving it here lets the other tools
 * reuse it (DRY) and lets tests exercise the regex in isolation (Faster
 * + deterministic — no disk).
 *
 * Pure functions only: each helper takes a string, returns a string.
 * No async, no `Date.now`, no logging, no regex state. The byte-exact
 * invariant matters: when a status changes from `in-progress` to
 * `done`, the resulting file must be byte-identical to the original
 * except for the `status:` line. This guarantees git history stays
 * clean (no spurious whitespace diffs).
 */

/**
 * Replace the frontmatter's `status:` line in place. Leaves everything
 * else byte-identical (including the closing `---`, the body, trailing
 * whitespace).
 *
 * Behaviour:
 *   - Missing frontmatter → returns the input unchanged.
 *   - Missing `status:` line → inserts it as the last field of the
 *     frontmatter (rare; a malformed doc).
 *   - Multiple `status:` lines (anti-pattern but possible) → only the
 *     first is replaced.
 */
export const setFrontmatterStatus = (
	raw: string,
	newStatus: string,
): string => {
	const block = extractFrontmatterBlock(raw);
	if (block === null) return raw;
	const replaced = block.replace(/^status:.*$/m, `status: ${newStatus}`);
	return replaceFrontmatterBlock(raw, replaced);
};

/**
 * Generic field setter: replace any top-level frontmatter field by name.
 * Useful for future tools (`proposals_edit` already does this inline;
 * a refactor will move it here too).
 *
 * Returns the input unchanged when:
 *   - the frontmatter block is missing,
 *   - `fieldName` is empty or contains characters unsafe for YAML keys.
 */
export const setFrontmatterField = (
	raw: string,
	fieldName: string,
	newValue: string,
): string => {
	if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(fieldName)) return raw;
	const block = extractFrontmatterBlock(raw);
	if (block === null) return raw;
	const re = new RegExp(`^${fieldName}:.*$`, 'm');
	if (re.test(block)) {
		const replaced = block.replace(re, `${fieldName}: ${newValue}`);
		return replaceFrontmatterBlock(raw, replaced);
	}
	// Field absent → append it before the closing `---` so the file
	// remains parseable. Keeps the existing fields in place.
	const closing = block.endsWith('\n')
		? `\n${fieldName}: ${newValue}\n`
		: `\n${fieldName}: ${newValue}`;
	const replaced = block.replace(/\n?$/, closing);
	return replaceFrontmatterBlock(raw, replaced);
};

const countIndent = (line: string): number => {
	let indent = 0;
	for (const ch of line) {
		if (ch !== ' ') break;
		indent++;
	}
	return indent;
};

/**
 * Replace a top-level frontmatter field with a block value.
 *
 * Example:
 *   fieldName = "evidence"
 *   blockLines = ["commit: abc", "ci-runs:", "  - name: CI"]
 *
 * becomes:
 *   evidence:
 *     commit: abc
 *     ci-runs:
 *       - name: CI
 */
export const setFrontmatterBlockField = (
	raw: string,
	fieldName: string,
	blockLines: readonly string[],
): string => {
	if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(fieldName)) return raw;
	if (blockLines.length === 0) return raw;
	const block = extractFrontmatterBlock(raw);
	if (block === null) return raw;

	const lines = block.split('\n');
	const fieldPattern = new RegExp(`^${fieldName}:(?:\\s.*)?$`);
	const fieldIndex = lines.findIndex((line, index) => {
		if (index === 0 || index === lines.length - 1) return false;
		return fieldPattern.test(line);
	});
	const replacement = [
		`${fieldName}:`,
		...blockLines.map((line) => `  ${line}`),
	];

	if (fieldIndex !== -1) {
		let fieldEnd = fieldIndex + 1;
		while (fieldEnd < lines.length - 1) {
			const current = lines[fieldEnd] ?? '';
			if (current.trim() === '') {
				fieldEnd++;
				continue;
			}
			if (countIndent(current) === 0) break;
			fieldEnd++;
		}
		const replaced = [
			...lines.slice(0, fieldIndex),
			...replacement,
			...lines.slice(fieldEnd),
		].join('\n');
		return replaceFrontmatterBlock(raw, replaced);
	}

	const insertAt = Math.max(lines.length - 1, 1);
	const replaced = [
		...lines.slice(0, insertAt),
		...replacement,
		...lines.slice(insertAt),
	].join('\n');
	return replaceFrontmatterBlock(raw, replaced);
};

/**
 * Read a single frontmatter field's value. Returns `undefined` when
 * the field is absent, the frontmatter block is missing, or the
 * value is on a line we can't safely parse.
 */
export const readFrontmatterField = (
	raw: string,
	fieldName: string,
): string | undefined => {
	if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(fieldName)) return undefined;
	const block = extractFrontmatterBlock(raw);
	if (block === null) return undefined;
	const m = block.match(new RegExp(`^${fieldName}:\\s*(.*)$`, 'm'));
	if (m === null) return undefined;
	return (m[1] ?? '').trim() || undefined;
};

// ---------------------------------------------------------------------------
// Internal: block extraction. The YAML delimiters `---` are matched
// only at line starts (the `m` flag) so body content with `---`
// separators (horizontal rules) does not break extraction.
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^(---\r?\n[\s\S]*?\r?\n---)/m;

const extractFrontmatterBlock = (raw: string): string | null => {
	const m = raw.match(FRONTMATTER_RE);
	return m === null ? null : (m[1] ?? '');
};

const replaceFrontmatterBlock = (raw: string, newBlock: string): string => {
	const m = raw.match(FRONTMATTER_RE);
	if (m === null) return raw;
	const block = m[1] ?? '';
	const idx = raw.indexOf(block);
	return raw.slice(0, idx) + newBlock + raw.slice(idx + block.length);
};
