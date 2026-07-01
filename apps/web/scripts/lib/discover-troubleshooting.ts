/**
 * `discoverTroubleshootingCases` — scan `docs/mcp-vertex/troubleshooting/*.md` and
 * return a structured catalogue the docs site renders (l030 S4).
 *
 * Case files have a YAML frontmatter:
 *
 *   ---
 *   slug: npm-token-expired
 *   symptom: "..."
 *   cause: "..."
 *   fix: "..."
 *   tags: [release, npm, ci]
 *   closedBy: "docs/mcp-vertex/NPM_PUBLISH.md §0.1"
 *   ---
 *
 *   body (markdown, rendered as-is)
 *
 * `slug`, `symptom`, `cause`, `fix` are required; a file missing any of
 * them is skipped (logged by the caller, not here — this module stays
 * pure so it is unit-testable without a console).
 *
 * SRP / DIP: mirrors `discover-tutorials.ts` — pure function, injected
 * reader, no direct `node:fs` import, so tests run against an in-memory
 * fixture instead of the real filesystem.
 */

export interface ITroubleshootingCase {
	readonly slug: string;
	readonly symptom: string;
	readonly cause: string;
	readonly fix: string;
	readonly tags: readonly string[];
	readonly closedBy?: string;
	readonly body: string;
}

/** Minimal reader contract — keeps the function pure and testable. */
export interface ITroubleshootingReader {
	readonly listFiles: (path: string) => readonly string[];
	readonly readFile: (path: string) => string | undefined;
	readonly join: (...parts: string[]) => string;
}

/** Strip surrounding quotes a YAML-ish scalar may carry. */
const unquote = (value: string): string => {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
};

/** Parse a single-line `[a, b, c]` array scalar. Empty/absent → []. */
const parseArray = (value: string | undefined): readonly string[] => {
	if (!value) return [];
	const trimmed = value.trim();
	if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
	const inner = trimmed.slice(1, -1).trim();
	if (inner.length === 0) return [];
	return inner.split(',').map((part) => unquote(part.trim()));
};

const parseFrontmatter = (
	raw: string,
): { meta: Record<string, string>; body: string } => {
	if (!raw.startsWith('---')) return { meta: {}, body: raw };
	const end = raw.indexOf('\n---', 3);
	if (end < 0) return { meta: {}, body: raw };
	const headerBlock = raw.slice(3, end).trim();
	const body = raw.slice(end + 4).replace(/^\r?\n/, '');
	const meta: Record<string, string> = {};
	for (const line of headerBlock.split(/\r?\n/)) {
		const m = /^([a-zA-Z][\w-]*):\s*(.+)$/.exec(line.trim());
		if (m) meta[m[1] as string] = (m[2] as string).trim();
	}
	return { meta, body };
};

/**
 * Walk `troubleshootingDir/*.md`, parse the frontmatter, and return the
 * flat list sorted by slug. Errors are swallowed per-file (a single
 * broken markdown file MUST NOT take down the whole site); a file
 * missing `slug`/`symptom`/`cause`/`fix` is skipped.
 */
export const discoverTroubleshootingCases = (
	troubleshootingDir: string,
	reader: ITroubleshootingReader,
): readonly ITroubleshootingCase[] => {
	const files = reader.listFiles(troubleshootingDir);
	const out: ITroubleshootingCase[] = [];
	for (const fileName of files) {
		if (!fileName.endsWith('.md')) continue;
		const path = reader.join(troubleshootingDir, fileName);
		const raw = reader.readFile(path);
		if (raw === undefined) continue;
		const { meta, body } = parseFrontmatter(raw);
		if (!meta.slug || !meta.symptom || !meta.cause || !meta.fix) continue;
		out.push({
			slug: unquote(meta.slug),
			symptom: unquote(meta.symptom),
			cause: unquote(meta.cause),
			fix: unquote(meta.fix),
			tags: parseArray(meta.tags),
			...(meta.closedBy !== undefined
				? { closedBy: unquote(meta.closedBy) }
				: {}),
			body: body.trim(),
		});
	}
	return out.sort((a, b) => a.slug.localeCompare(b.slug));
};
