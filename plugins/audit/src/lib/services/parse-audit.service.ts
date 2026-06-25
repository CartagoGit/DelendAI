/**
 * Parse one audit document into an {@link IAuditDocument}.
 *
 * The parser is intentionally **permissive**: it accepts the variant
 * shapes the existing audits in `docs/mcp-vertex/proposals/done/` use (different
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

/** Normalised severity tokens the parser maps onto the canonical set. */
const SEVERITY_PATTERNS: ReadonlyArray<{
	readonly pattern: RegExp;
	readonly mapsTo: AuditSeverity;
}> = [
	{ pattern: /\bFATAL\b/u, mapsTo: 'FATAL' },
	{ pattern: /\bMUY\s*MAL\b/u, mapsTo: 'MUY_MAL' },
	{ pattern: /\b(?:MEJORABLE|MEJORA)\b/u, mapsTo: 'MEJORABLE' },
	{ pattern: /\b(?:OK|BIEN)\b/u, mapsTo: 'OK' },
	{ pattern: /\bMUY\s*BIEN\b/u, mapsTo: 'MUY_BIEN' },
	{ pattern: /\bPERFECTO\b/u, mapsTo: 'PERFECTO' },
];

/** Map the source file name to the source identity. */
const deriveSourceFromPath = (
	path: string,
): { slug: string; source: IAuditSource } => {
	const base = path.split('/').pop() ?? path;
	const noExt = base.replace(/\.md$/u, '');
	// Conventional shape: `DD-MM-YYYY- <Host> (<Model>)[ <suffix>]`
	// or `DD-MM-YYYY- Auditoría ... (<Model>)` for unified audits.
	const m =
		/^(\d{2}-\d{2}-\d{4})[-\s]+(?:Auditor[íi]a\s+)?(.+?)\(([^)]+)\)(.*)$/u.exec(
			noExt,
		);
	if (!m) {
		return {
			slug: noExt,
			source: { host: 'unknown', model: 'unknown', date: '' },
		};
	}
	const [, date, head, model, _tail] = m as unknown as [
		string,
		string,
		string,
		string,
		string,
	];
	const host = head.replace(/\s*\(.*$/u, '').trim() || 'unknown';
	const dateIso = date.replace(/^(\d{2})-(\d{2})-(\d{4})$/u, '$3-$2-$1');
	return {
		slug: noExt,
		source: { host, model: model.trim(), date: dateIso },
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
			if (/^##\s+.*(Resumen|Summary|Executive)/iu.test(trimmed)) {
				inSummary = true;
			}
			continue;
		}
		if (/^##\s+/u.test(trimmed)) break;
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
		if (!currentSeverity) continue;
		if (/^###\s+\d+\.\s+/u.test(line)) {
			flush();
			currentTitle = line.replace(/^###\s+\d+\.\s+/u, '').trim();
			currentDetail = [];
			currentFiles = [];
			continue;
		}
		if (currentTitle.length === 0) continue;
		// Capture "Fichero" / "Archivo" hints to seed `files[]`.
		const fileMatch =
			/\*\*Fichero[a-z]?\s*:?\*\*?\s*:?\s*`?([^`\n]+)`?/u.exec(line);
		if (fileMatch?.[1]) {
			for (const candidate of fileMatch[1].split(',')) {
				// Strip backticks, asterisks, and any trailing line
				// anchor (`#L42` / `#L42-L58`) so callers can match on
				// the canonical path alone.
				const trimmed = candidate
					.trim()
					.replace(/[`*]/g, '')
					.replace(/#L[\w-]+$/u, '')
					.trim();
				if (trimmed.length > 0 && !currentFiles.includes(trimmed)) {
					currentFiles.push(trimmed);
				}
			}
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
		const cleanCell = (s: string): string =>
			s
				.replace(/^\*\*\s*/u, '')
				.replace(/\s*\*\*$/u, '')
				.trim();
		const dim = cleanCell(cells[0] ?? '');
		const scoreCell = cleanCell(cells[1] ?? '');
		const comment = cells.slice(2).join(' | ');
		const scoreMatch = /^(\d+)\s*\/\s*10$/u.exec(scoreCell);
		const score = scoreMatch?.[1]
			? Number.parseInt(scoreMatch[1], 10)
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

/** Final note: paragraph after `**Nota final:**` or `**Nota global:**`. */
const extractNote = (body: string): string => {
	// Tolerant: the source audits vary in formatting. We find the line
	// that mentions `Nota final` or `Nota global`, then strip the
	// surrounding `**` emphasis and any leading colon. This handles
	// every observed shape: `**Nota final: 8/10 — ...**`,
	// `**Nota global 7/10 — ...**`, and unbolded variants.
	const m = /\*\*Nota\s+(?:final|global)[^\n]*\*\*/iu.exec(body);
	const raw = m?.[0] ?? '';
	// Strip the `**` emphasis and the `Nota final:` label, keeping
	// only the actual note content.
	return raw
		.replace(/^\*\*Nota\s+(?:final|global)\s*:?\s*/iu, '')
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

/** Convenience: parse all `*.md` files in a directory. Pure: takes the list. */
export const parseAuditFiles = (
	files: ReadonlyArray<{ path: string; body: string }>,
): readonly IAuditDocument[] => {
	const docs: IAuditDocument[] = [];
	const seen = new Set<string>();
	for (const f of files) {
		if (seen.has(f.path)) continue;
		seen.add(f.path);
		try {
			docs.push(parseAuditBody(f.path, f.body));
		} catch {
			/* swallow — invalid audits are reported by the consolidator */
		}
	}
	return docs;
};
