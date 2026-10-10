/**
 * Shared `Files:` line parser (x00158 S1).
 *
 * Two independent parsers used to read the same `- **Files**: ...`
 * proposal syntax: `proposal-completeness.ts` (correct, brace-aware)
 * and `proposal-slice-plan.ts` (a naive `split(',')` that shattered any
 * `{a,b,c}` brace expansion into garbage fragments). This module is the
 * single source of truth both callers now import from.
 */

/**
 * A trailing file extension. The bound is generous enough for the long
 * ones this repository actually uses (`.generated.json` is matched by
 * its last segment) and short enough that a sentence ending in a word
 * does not read as a filename.
 */
const MAX_EXTENSION_LENGTH = 12;
const FILE_EXTENSION = new RegExp(
	`\\.[A-Za-z0-9]{1,${MAX_EXTENSION_LENGTH}}$`,
	'u',
);

/** Matches one backtick-delimited path/glob token in a `Files:` line. */
export const BACKTICKED = /`([^`]+)`/g;

/** Captures `prefix{choice,choice,...}suffix` — brace depth is 1. */
export const BRACE_PATTERN = /^(.*)\{([^}]+)\}(.*)$/;

/**
 * A backticked span that is a PATH, and not the prose around it.
 *
 * A `Files:` line is written by a person, and people annotate:
 *
 *     - **Files**: `packages/cli/package.json` (NEW; `private: true`;
 *       `bin: { "delendai": "./dist/index.js" }`) …
 *
 * Every one of those spans is backticked, so taking all of them made
 * `private: true` a claimed path. The checkpoint then refused the whole
 * scope — measured on a live server: every automatic slice checkpoint in
 * a session failed with `unclaimable paths`, naming prose, and no work
 * ref moved at all (x00562).
 *
 * The test is deliberately shape-based rather than filesystem-based: the
 * parser is pure, and a path that does not exist yet is exactly what a
 * proposal declares.
 */
export const looksLikePath = (token: string): boolean => {
	if (token.length === 0 || token.length > 200) return false;
	// Prose gives itself away: spaces, quotes, brackets, a colon that is
	// not a drive letter, or a sentence's punctuation.
	if (/[\s"'()<>;]/u.test(token)) return false;
	if (/[:]/u.test(token)) return false;
	if (token.startsWith('-') || token.startsWith('#')) return false;
	// A path either has a directory separator or a file extension.
	return token.includes('/') || FILE_EXTENSION.test(token);
};

/**
 * Expand every comma-separated path inside backticks, handling
 * `{a,b,c}` brace patterns. Returns the flat list of concrete paths
 * a slice declares in its `Files:` line. Brace depth is 1 (matches
 * the patterns actually used in 2026-Q3 proposals).
 */
export const expandDeclaredFiles = (text: string): ReadonlyArray<string> => {
	const out: string[] = [];
	for (const match of text.matchAll(BACKTICKED)) {
		const inside = match[1] ?? '';
		// Split on commas not inside braces.
		const parts = inside.split(/,\s*(?![^{}]*\})/);
		for (const raw of parts) {
			const trimmed = raw.trim();
			if (trimmed === '') continue;
			const brace = BRACE_PATTERN.exec(trimmed);
			if (brace) {
				const prefix = brace[1] ?? '';
				const choices = brace[2] ?? '';
				const suffix = brace[3] ?? '';
				for (const choice of choices.split(',')) {
					const expanded = `${prefix}${choice}${suffix}`;
					if (looksLikePath(expanded)) out.push(expanded);
				}
				continue;
			}
			if (looksLikePath(trimmed)) out.push(trimmed);
		}
	}
	return out;
};

const FILES_FIELD_RE = /^[-*]\s*(?:files|\*\*Files\*\*):[ \t]*(.*)$/u;

const FILES_CONTINUATION_RE = /^[ \t]+.*$/u;

const readRawFilesBlocks = (body: string): readonly string[] => {
	const blocks: string[] = [];
	const lines = body.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const match = line.match(FILES_FIELD_RE);
		if (match === null) continue;
		let raw = match[1] ?? '';
		while (
			index + 1 < lines.length &&
			FILES_CONTINUATION_RE.test(lines[index + 1] ?? '')
		) {
			index += 1;
			raw = `${raw}\n${lines[index] ?? ''}`;
		}
		blocks.push(raw);
	}
	return blocks;
};

const WORKSPACE_PATH_RE =
	/(?:^|\/)((?:packages|plugins|extensions|apps|tools|docs|scripts|src|lib)\/.+)$/;

const looksLikeSliceToken = (value: string): boolean => {
	if (value.length < 2) return false;
	if (/^[[\]()]+$/.test(value)) return false;
	if (looksLikePath(value)) return true;
	return /^[A-Za-z][A-Za-z0-9._-]*$/.test(value);
};

export const normalizeFileToken = (value: string): string => {
	const fileUri = value.match(/file:\/\/(\/[^)\s#]+)/u)?.[1];
	const linked = value.match(/\[[^\]]*\]\(([^)]+)\)/u)?.[1];
	let raw = fileUri ?? linked ?? value;
	raw = raw
		.replace(/^\s*[-*]\s+/gu, '')
		.replace(/`/gu, '')
		.replace(/\s*\(.*$/u, '')
		.replace(/\s*—.*$/u, '')
		.replace(/[),.;:]+$/gu, '')
		.replace(/^\[|\]$/gu, '')
		.replace(/#L[\w-]+$/u, '')
		.trim();
	const workspace = raw.match(WORKSPACE_PATH_RE)?.[1];
	if (workspace !== undefined) raw = workspace;
	return looksLikeSliceToken(raw) ? raw : '';
};

/**
 * The files a slice body declares, read from every `Files:` field and its
 * indented continuation lines. The slice plan, the completeness guard and
 * the review entry all read a slice's files through this one function.
 */
export const readDeclaredSliceFiles = (body: string): readonly string[] => {
	// A Files field carries one path (`- files: a.ts`), a list on the line
	// (`- **Files**: \`a.ts\`, \`b.ts\``), or indented sub-bullets (with
	// spaces or tabs) under it. Backticked tokens go through the brace-aware
	// parser; a line without any falls back to a comma split.
	return readRawFilesBlocks(body)
		.flatMap((rawBlock) => {
			const raw = rawBlock.trim();
			const withoutDescription = raw.replace(/\s+\([^)]*\)\s*$/u, '');
			// `file://` links are lifted too, so a truncated `[path](file://…)`
			// citation is not lost when a leftover backtick token already
			// satisfied expandDeclaredFiles.
			const expanded = expandDeclaredFiles(withoutDescription);
			const fileUris = [
				...withoutDescription.matchAll(/file:\/\/(\/[^)\s#]+)/gu),
			].map((match) => match[1] ?? '');
			const tokens = [...expanded, ...fileUris];
			if (tokens.length > 0) return tokens;
			const unwrapped =
				raw.startsWith('[') && raw.endsWith(']')
					? raw.slice(1, -1)
					: raw;
			return unwrapped.split(',');
		})
		.map((token) => normalizeFileToken(token.trim()))
		.filter((f) => f.length > 0);
};
