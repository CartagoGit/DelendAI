/**
 * Parse one audit document into an {@link IAuditDocument}.
 *
 * The parser is intentionally **permissive**: it accepts the variant
 * shapes the existing audits in `docs/delendai/proposals/done/` use (different
 * host conventions, with/without frontmatter, with/without a scoring
 * table). When it cannot recognise a section it leaves the field empty
 * rather than throwing — the consolidator handles missing fields
 * gracefully.
 *
 * Pure functions only: no I/O. The caller is responsible for reading
 * the file (or supplying the contents in tests).
 */

import type {
	AuditSeverity,
	IAuditDocument,
	IAuditFinding,
	IAuditScore,
	IAuditSource,
} from '../contracts/interfaces/audit.interface';
import { DATE_PREFIX_LENGTH } from '../contracts/constants/audit.constant';
import {
	extractTextAfterFileLabel,
	isExecutiveSummaryHeading,
	isLevelTwoHeading,
	parseConventionalSource,
	stripMarkdownBold,
} from './parse-audit-line';

/** Normalised severity tokens the parser maps onto the canonical set.
 *  The first match wins (FATAL → BAD → MINOR → OK → GOOD → PERFECT →
 *  EXEMPLARY). Historical Spanish forms are accepted as fallbacks so
 *  older audits stay parseable after the English rename. */
const SEVERITY_PATTERNS: ReadonlyArray<{
	readonly pattern: RegExp;
	readonly mapsTo: AuditSeverity;
}> = [
	{ pattern: /\bFATAL\b/u, mapsTo: 'FATAL' },
	// BAD replaces the historical `MUY MAL`. The regex accepts both
	// forms (the canonical English `BAD` and the Spanish legacy
	// `MUY MAL`) so existing audits still parse.
	{ pattern: /\b(?:BAD|MUY\s*MAL)\b/iu, mapsTo: 'BAD' },
	// MINOR replaces the historical `MEJORABLE`. Accepts both forms
	// plus `MEJORA` (the verb form some early audits used).
	{ pattern: /\b(?:MINOR|MEJORABLE|MEJORA)\b/iu, mapsTo: 'MINOR' },
	// OK is unchanged.
	{ pattern: /\b(?:OK|BIEN)\b/iu, mapsTo: 'OK' },
	// GOOD replaces the historical `MUY BIEN`. Accepts both forms.
	{ pattern: /\b(?:GOOD|MUY\s*BIEN)\b/iu, mapsTo: 'GOOD' },
	// PERFECT replaces the historical `PERFECTO`. Accepts both forms.
	{ pattern: /\bPERFECTO?\b/iu, mapsTo: 'PERFECT' },
	// EXEMPLARY (canonical English) sits above PERFECT. Regex also
	// matches the Spanish legacy `ESPLÉNDIDO` and the ASCII fallback
	// `ESPLENDIDO` so older audits still resolve correctly. No `g`
	// flag — the classifier calls `.test()` once per line and a `g`
	// regex would carry `lastIndex` state across lines, masking
	// later matches.
	{ pattern: /\b(?:EXEMPLARY|ESPL[ÉE]NDIDO)\b/iu, mapsTo: 'EXEMPLARY' },
];

const SCORE_SCALE = 10;
const DECIMAL_RADIX = SCORE_SCALE;

/** Map the source file name to the source identity. */
const deriveSourceFromPath = (
	path: string,
): { slug: string; source: IAuditSource } => {
	const base = path.split('/').pop() ?? path;
	const noExt = base.replace(/\.md$/u, '');
	// Conventional shape: `DD-MM-YYYY- <Host> (<Model>)[ <suffix>]`
	// or `DD-MM-YYYY- Auditoría ... (<Model>)` for unified audits.
	const parsed = parseConventionalSource(noExt);
	if (!parsed) {
		return {
			slug: noExt,
			source: { host: 'unknown', model: 'unknown', date: '' },
		};
	}
	// `noUncheckedIndexedAccess` types every capture as `string | undefined`
	// (TS cannot see that none of this regex's groups are optional) — narrow
	// with a real check instead of casting past it. Malformed input degrades
	// to the same "unknown" source as the `!m` branch above, matching this
	// parser's documented permissive design, rather than assuming success.
	if (
		parsed.date.length === 0 ||
		parsed.head.length === 0 ||
		parsed.model.length === 0
	) {
		return {
			slug: noExt,
			source: { host: 'unknown', model: 'unknown', date: '' },
		};
	}
	const host = parsed.head.trim() || 'unknown';
	const dateIso = `${parsed.date.slice(6, DATE_PREFIX_LENGTH)}-${parsed.date.slice(3, 5)}-${parsed.date.slice(0, 2)}`;
	return {
		slug: noExt,
		source: { host, model: parsed.model.trim(), date: dateIso },
	};
};

/**
 * Best-effort severity classification from a section header. Returns
 * `undefined` when the header does not match any known band — the
 * consolidator will skip such sections.
 */
const classifyHeader = (line: string): AuditSeverity | undefined => {
	for (const { pattern, mapsTo } of SEVERITY_PATTERNS) {
		if (pattern.test(line)) return mapsTo;
	}
	return undefined;
};

/**
 * Extract the first paragraph block of the executive summary. The
 * parser is tolerant: it returns the text between the first non-empty
 * line after a `## 📊 Resumen Ejecutivo`-style heading and the next
 * `## ` heading.
 */
const extractSummary = (body: string): string => {
	const lines = body.split('\n');
	let inSummary = false;
	const collected: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!inSummary) {
			if (isExecutiveSummaryHeading(trimmed)) {
				inSummary = true;
			}
			continue;
		}
		if (isLevelTwoHeading(trimmed)) break;
		if (trimmed.startsWith('>')) continue; // skip blockquotes
		if (trimmed.length > 0) collected.push(trimmed);
	}
	return collected.slice(0, 6).join('\n\n').trim();
};

/**
 * Extract findings. Each finding lives under a `### N. <title>` line
 * inside a severity-banded `## …` section. The severity comes from the
 * section header; the title from the `###` line.
 */
/**
 * Paths cited on a finding line. Combines:
 * - English `**File**:` (brief) and Spanish `**Fichero**`/`**Archivo**`
 * - multiple backtick paths on one line (`a.ts#L1`, `b.ts#L2`)
 * - `file://` URIs, lifted to a workspace-relative path when possible
 * - rejection of leftover markdown tokens (`[`) from truncated citations
 */
const citedPathsFromFindingLine = (line: string): readonly string[] => {
	const restAfterFileLabel = extractTextAfterFileLabel(line);
	const quoted = [...line.matchAll(/`([^`]+)`/gu)].map((m) => m[1] ?? '');
	const fileUris = [...line.matchAll(/file:\/\/(\/[^)\s#]+)/gu)].map(
		(m) => m[1] ?? '',
	);
	const rest = restAfterFileLabel ?? '';
	const fromRest = rest
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	const raw =
		quoted.length > 0 ? quoted : fileUris.length > 0 ? fileUris : fromRest;
	const out: string[] = [];
	for (const candidate of raw) {
		let trimmed = candidate
			.trim()
			.replace(/[`*]/g, '')
			.replace(/^\[|\]$/gu, '')
			.replace(/\(.*$/u, '')
			.replace(/#L[\w-]+$/u, '')
			.replace(/^[\s*`[(]+|[\s*`\])]+$/gu, '')
			.trim();
		const workspace = trimmed.match(
			/(?:^|\/)((?:packages|plugins|extensions|apps|tools|docs|scripts|src|lib)\/.+)$/,
		)?.[1];
		if (workspace !== undefined) trimmed = workspace;
		if (
			/^[A-Za-z0-9._/-]+\.[A-Za-z0-9]+$/.test(trimmed) &&
			!out.includes(trimmed)
		) {
			out.push(trimmed);
		}
	}
	return out;
};

const extractFindings = (body: string): readonly IAuditFinding[] => {
	const lines = body.split('\n');
	let currentSeverity: AuditSeverity | undefined;
	let currentCounter = 0;
	let currentTitle = '';
	let currentDetail: string[] = [];
	let currentFiles: string[] = [];
	const out: IAuditFinding[] = [];

	const flush = (): void => {
		if (!currentSeverity || currentTitle.length === 0) return;
		out.push({
			id: `${currentSeverity.toLowerCase()}-${++currentCounter}`,
			title: currentTitle,
			severity: currentSeverity,
			files: currentFiles,
			detail: currentDetail.join('\n').trim(),
		});
	};

	for (const raw of lines) {
		const line = raw.trim();
		if (/^##\s+/u.test(line)) {
			flush();
			currentSeverity = classifyHeader(line);
			currentTitle = '';
			currentDetail = [];
			currentFiles = [];
			continue;
		}
		if (/^###\s+\d+\.\s+/u.test(line)) {
			flush();
			currentTitle = line.replace(/^###\s+\d+\.\s+/u, '').trim();
			currentDetail = [];
			currentFiles = [];
			// The brief shows the band in the rubric table but does not
			// say the findings must sit under a severity-banded `##`.
			// Plenty of models put the token on the finding heading
			// instead, and every one of those findings used to be
			// dropped on the floor: the section header carried no band,
			// so `currentSeverity` stayed undefined and the `continue`
			// above skipped the whole block. Reading the heading as a
			// fallback keeps both shapes parseable.
			currentSeverity = classifyHeader(line) ?? currentSeverity;
			continue;
		}
		if (!currentSeverity) continue;
		if (currentTitle.length === 0) continue;
		for (const path of citedPathsFromFindingLine(line)) {
			if (!currentFiles.includes(path)) currentFiles.push(path);
		}
		currentDetail.push(line);
	}
	flush();
	return out;
};

/** Extract the scoring table. Matches `| Dimension | Score | Comment |`. */
const extractScores = (body: string): readonly IAuditScore[] => {
	const lines = body.split('\n');
	const out: IAuditScore[] = [];
	let inTable = false;
	for (const raw of lines) {
		const line = raw.trim();
		if (!line.startsWith('|')) {
			if (inTable && line.length > 0 && !line.startsWith('|'))
				inTable = false;
			continue;
		}
		const cells = line
			.split('|')
			.map((c) => c.trim())
			.filter((c) => c.length > 0);
		if (cells.length < 2) continue;
		// Separator row (`|---|---|...`).
		if (/^[-:]+$/u.test(cells[0] ?? '')) {
			inTable = true;
			continue;
		}
		if (!inTable) continue;
		// Strip surrounding `**…**` markdown emphasis from the dimension
		// label so consumers can match on plain text (`Arquitectura`, not
		// `**Arquitectura**`). Same goes for the score cell.
		const cleanCell = (s: string): string => stripMarkdownBold(s);
		const dim = cleanCell(cells[0] ?? '');
		const scoreCell = cleanCell(cells[1] ?? '');
		const comment = cells.slice(2).join(' | ');
		const scoreMatch = new RegExp(
			String.raw`^(\d+)\s*\/\s*${String(SCORE_SCALE)}$`,
			'u',
		).exec(scoreCell);
		const score = scoreMatch?.[1]
			? Number.parseInt(scoreMatch[1], DECIMAL_RADIX)
			: scoreCell.trim() === '?'
				? null
				: (() => {
						const numeric = /^(\d+(?:\.\d+)?)$/u.exec(
							scoreCell.trim(),
						);
						return numeric?.[1]
							? Number.parseFloat(numeric[1])
							: null;
					})();
		out.push({
			dimension: dim,
			score: Number.isNaN(score) ? null : score,
			comment,
		});
	}
	return out;
};

/** The closing note, whatever it is labelled. */
const NOTE_LABEL = String.raw`(?:Nota\s+(?:final|global)|Final\s+note|Overall\s+note)`;

/**
 * Final note: the paragraph after `**Nota final:**`, `**Nota global:**`
 * or the English `**Final note:**`.
 *
 * Tolerant, because the source audits vary: `**Nota final: 8/10 — …**`,
 * `**Nota global 7/10 — …**` and unbolded variants all resolve. The
 * English label is accepted because it is the one the brief actually
 * asks for — before this, an audit that followed the brief to the
 * letter came back with an empty note.
 */
const extractNote = (body: string): string => {
	const m = new RegExp(String.raw`\*\*${NOTE_LABEL}[^\n]*\*\*`, 'iu').exec(
		body,
	);
	const raw = m?.[0] ?? '';
	// Strip the `**` emphasis and the label, keeping only the content.
	return raw
		.replace(new RegExp(String.raw`^\*\*${NOTE_LABEL}\s*:?\s*`, 'iu'), '')
		.replace(/\*\*$/u, '')
		.trim();
};

/**
 * Parse the audit body into structured data. Pure: no filesystem, no
 * network. The caller (an MCP tool or a test) reads the file and passes
 * the raw markdown.
 */
export const parseAuditBody = (path: string, body: string): IAuditDocument => {
	const { slug, source } = deriveSourceFromPath(path);
	return {
		path,
		slug,
		source,
		summary: extractSummary(body),
		findings: extractFindings(body),
		scores: extractScores(body),
		note: extractNote(body),
	};
};

const tryParseAuditBody = (
	path: string,
	body: string,
): IAuditDocument | undefined => {
	try {
		return parseAuditBody(path, body);
	} catch {
		// Intentional: one malformed audit must not abort the whole batch.
		return undefined;
	}
};

/** Convenience: parse all `*.md` files in a directory. Pure: takes the list. */
export const parseAuditFiles = (
	files: ReadonlyArray<{ path: string; body: string }>,
): readonly IAuditDocument[] => {
	const docs: IAuditDocument[] = [];
	const seen = new Set<string>();
	for (const f of files) {
		if (seen.has(f.path)) continue;
		seen.add(f.path);
		const parsed = tryParseAuditBody(f.path, f.body);
		if (parsed !== undefined) docs.push(parsed);
	}
	return docs;
};
