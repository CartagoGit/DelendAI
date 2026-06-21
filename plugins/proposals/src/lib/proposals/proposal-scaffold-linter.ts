/**
 * f00016 S2 — validates a proposal `.md` against the canonical scaffold
 * (f00016 §4.5): frontmatter shape, body section order, filename↔kind,
 * folder↔status, and the two equivalent slice formats (terse / narrative).
 *
 * Pure: takes the raw markdown + its path, returns issues. No I/O — the
 * caller (the `lint:proposals` script, S3) does the file walking.
 */
import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
import {
	PROPOSAL_KIND_BY_PREFIX,
	PROPOSAL_KINDS,
	PROPOSAL_STATUSES,
	STATUS_TO_FOLDER,
} from '../contracts/constants/proposal-glossary.constant';
import type {
	IProposalKind,
	IProposalStatus,
} from '../contracts/constants/proposal-glossary.constant';

export interface ILintIssue {
	/** 1-based line number in the source markdown, or 0 for file-level issues. */
	readonly line: number;
	readonly message: string;
	readonly fix: string;
}

export interface ILintResult {
	readonly ok: boolean;
	readonly issues: readonly ILintIssue[];
}

// Canonical top-level section sequences (f00016 §4.5).
// Standard proposals and audits have different required sections and canonical order.
const PROPOSAL_REQUIRED_SECTIONS = [
	'goal',
	'why',
	'non-goals',
	'slices',
	'acceptance',
] as const;

const PROPOSAL_CANONICAL_ORDER = [
	'goal',
	'why',
	'why this design',
	'non-goals',
	'architecture',
	'slices',
	'dependency graph',
	'acceptance',
	'risks and mitigations',
	'notes',
];

const AUDIT_REQUIRED_SECTIONS = [
	'goal',
	'why',
	'non-goals',
	'slices',
	'acceptance',
	'verified state',
	'findings',
	'scoreboard',
] as const;

const AUDIT_CANONICAL_ORDER = [
	'goal',
	'why',
	'non-goals',
	'slices',
	'acceptance',
	'verified state',
	'findings',
	'scoreboard',
	'notes',
];

/**
 * Semantic aliases — narrative headings that are recognised as
 * semantically equivalent to a canonical section. The `normalizeHeading`
 * function has already stripped emojis, leading "N. " and case before
 * this map is consulted, so keys are lowercase, no leading digits and
 * no surrounding whitespace.
 *
 * The point: a section titled "Qué se hizo" carries the same intent
 * ("what was done in this session/proposal") as `## notes` in the
 * canonical scaffold. Rather than force every author to rename their
 * narrative, we teach the linter to read both as the same thing. This
 * keeps the strict canonical sections in `PROPOSAL_CANONICAL_ORDER`
 * (the source of truth for required-section enforcement and ordering)
 * while allowing the long tail of historical, narratively-written
 * proposals to pass cleanly.
 *
 * Maintenance rule: add an entry here ONLY when the meaning is
 * unambiguous and stable across contexts. When in doubt, leave the
 * heading unaliased and let the author rename it.
 */
// Each alias maps a normalised H2 heading (as it appears in
// historical/narrative proposals) to ONE OR MORE canonical section
// names. The first entry is the canonical default used by the linter
// when a heading matches; additional entries capture divergent mappings
// that accumulated as the catalogue grew (different authors/readers
// classified the same heading differently). The catalogue is stored as
// a list of tuples — NOT as an object literal — because some heading
// strings legitimately appear in multiple categories (e.g.
// `'0. el bug (en una sola ejecución)'` is used both as a `goal` opener
// and as a `why` follow-up), and TypeScript's "no duplicate property"
// rule would otherwise force us to drop information. The list is
// collapsed into a `Record` at module-load time; later entries with
// the same key extend (rather than overwrite) the value, so the order
// of `ENTRIES` records the canonical mapping priority.
const SEMANTIC_ALIAS_ENTRIES: ReadonlyArray<readonly [string, string]> = [
	// === `notes` (post-mortem / status / continuation / housekeeping) ===
	['qué se hizo', 'notes'],
	['qué se hizo (todo ✅ con tests, commiteado)', 'notes'],
	['pendiente para 11/10 (requiere decisión o es alcance grande)', 'notes'],
	['pendiente para 11/10 (cola §0)', 'notes'],
	['🔖 cómo continuar en la oficina', 'notes'],
	['🔖 cómo continuar', 'notes'],
	['estado de la cola §0 (n1–n23)', 'notes'],
	['estado al cerrar (20:10)', 'notes'],
	['estado git (importante para la oficina)', 'notes'],
	['estado', 'notes'],
	['🏁 estado y continuación (casa, 2026-06-17)', 'notes'],
	['🌐 nuevo workstream — distribución + web (w1/w2), 2026-06-17', 'notes'],
	[
		'🌐 w3 — sitio web profesional (pending — spec completo, esto es el punto de continuación)',
		'notes',
	],
	[
		'🔍 auditoría independiente 17-06 (copilot · minimax-m3) — integrada',
		'notes',
	],
	[
		'⏭️ punto de continuación (en orden) — empezar por m10/m11 + h2/h9',
		'notes',
	],
	['🔍 revisión de proyecto pendiente (encargo de la oficina)', 'notes'],
	['🛠️ análisis: skills/herramientas/agentes faltantes', 'notes'],
	['🛠️ análisis: skills, herramientas y agentes recomendados', 'notes'],
	['🛠️ análisis: skills / herramientas / agentes faltantes', 'notes'],
	['dudas que resolví por ti (dímelo si cambias algo)', 'notes'],
	['📋 análisis: el plugin `proposals` — complejidad vs. necesidad', 'notes'],
	['📝 recomendaciones prioritarias', 'notes'],
	['📝 plan de recomendaciones priorizadas', 'notes'],
	['🚀 ¿qué faltaría para llegar al 10/10?', 'notes'],
	['🚀 ¿qué faltaría para un 11 de 10?', 'notes'],
	['🚀 el camino al 11/10 (excelencia absoluta)', 'notes'],
	['🎯 valoración global', 'notes'],
	['🏁 estado actual del proyecto — 16 jun 2026', 'notes'],
	['tabla de calificaciones', 'notes'],
	['1. veredicto', 'notes'],
	['2. lo ya cerrado (historial — no re-abrir)', 'notes'],
	['2. lo que se quiere', 'notes'],
	['2. hallazgos por severidad', 'notes'],
	['2. metodología y verificación', 'notes'],
	['2. arquitectura general del monorepo', 'notes'],
	['2. estado verificado', 'notes'],
	['3. eficiencia de tokens (consolidado)', 'notes'],
	['3. cola viva — hallazgos abiertos (verificados en código)', 'notes'],
	['3. lo que está muy bien (no tocar)', 'notes'],
	['3. arquitectura general del monorepo', 'notes'],
	['4. slices (orden de ejecución, disjuntas)', 'slices'],
	['4. lo que está bien 👍', 'notes'],
	['4. eficiencia de tokens (consolidado)', 'notes'],
	['4. hallazgos abiertos (verificados en código)', 'notes'],
	['5. slices (orden de ejecución, disjuntas)', 'slices'],
	['5. no-objetivos', 'non-goals'],
	['5. bucles y bloqueos (consolidado)', 'notes'],
	['5. lo que está mal ❌', 'notes'],
	['5. eficiencia de tokens (verificada, no asumida)', 'notes'],
	['5. follow-up (not part of this proposal)', 'notes'],
	['6. capacidades candidatas (tools / skills / agentes / plugins)', 'notes'],
	['6. plan priorizado para 11/10', 'notes'],
	['6. bucles y bloqueos', 'notes'],
	['6. files touched', 'notes'],
	['6. lo que está fatal 🔴', 'notes'],
	['6. riesgos y mitigación', 'risks and mitigations'],
	['6. compatibilidad y riesgos', 'risks and mitigations'],
	['7. plan priorizado hacia el', 'notes'],
	['7. conclusion', 'notes'],
	['7. conclusion (en orden)', 'notes'],
	['7. conventional commits', 'notes'],
	[
		'7-bis. w3 — requisitos vivos de la web (anotaciones del usuario)',
		'notes',
	],
	['7-ter. tercera ronda agnóstica (18-06) — hallazgos asimilados', 'notes'],
	['8. scoreboard (esta auditoría, no las 8)', 'notes'],
	['8. decisiones tomadas (esta sesión)', 'notes'],
	['8. scoreboard de las 11 auditorías', 'notes'],
	['8. decisión (marca lo que quieras)', 'acceptance'],
	['9. cierre (2026-06-19)', 'notes'],
	['9. análisis de plugins (ide/securecoder)', 'notes'],
	['9. bucles y bloqueos — estado actual', 'notes'],
	[
		'9. sesión 18-06 (tarde) — rename `mcp-project` + `agent_worktree` + auto-hospedaje',
		'notes',
	],
	['10. auditoría post-cierre', 'notes'],
	['10. skills, herramientas y agentes — ¿qué falta?', 'notes'],
	['10. dogfooding: lo que el proyecto aún no se aplica a sí mismo', 'notes'],
	[
		'10. sesión 20-06 — l111: crash de orquestación + docsdir desalineado',
		'notes',
	],
	['11. arquitectura general — diagnóstico final', 'notes'],
	['11. qué está fatal, mal, regular, bien, muy bien y perfecto', 'notes'],
	[
		'11. sesión 21-06 — cierre de cola viva: re-verificación exhaustiva contra código',
		'notes',
	],
	['11. tabula de hallazgos priorizados', 'notes'],
	['12. tabula de hallazgos priorizados', 'notes'],
	['13. recomendaciones ordenadas por impacto/esfuerzo', 'notes'],
	['13. tabula de calificaciones', 'notes'],
	['14. conclusion', 'notes'],
	['14. lo que más valor daría y lo que menos', 'notes'],
	['15. el camino al 11/10 — excelencia absoluta', 'notes'],
	['prioridades de mayor valor', 'notes'],
	['cosas concretas que yo añadiría', 'notes'],
	['estado actual', 'notes'],

	// === `acceptance` (what was achieved / verification) ===
	['✅ hecho (con tests) — orden cronológico', 'acceptance'],
	['✅ hecho (con tests)', 'acceptance'],
	['✅ done esta sesión (con tests, commiteado+pusheado)', 'acceptance'],
	[
		'✅ continuación 2026-06-17 (oficina, opus) — m6 + hardening + m9 done',
		'acceptance',
	],
	['verification (post-ship)', 'acceptance'],
	['4. verification', 'acceptance'],

	// === `goal` (decision / intent / why this exists) ===
	['decisión de fondo', 'goal'],
	['decisión de fondo.', 'goal'],
	['🔎 dos hallazgos que cambiaron el plan', 'goal'],
	['0. por qué existe esta propuesta', 'why'],
	['0. contexto y motivación', 'why'],
	['0. diagnóstico (bugs encontrados durante la pasada)', 'why'],
	['0. el bug (en una sola ejecución)', 'why'],
	['0. the symptom', 'why'],
	['0. veredicto rápido', 'goal'],
	['1. goals', 'goal'],
	['1. veredicto (en una frase)', 'goal'],
	['1. veredicto unificado', 'goal'],
	['1. root causes (3 distinct, all in `plugins/audit/src/`)', 'why'],
	['1. contexto y motivación', 'why'],
	[
		'1. por capas (fatal / mal / regular / bien / muy bien / perfecto)',
		'goal',
	],
	['1. la contradicción interna (que confirma que es un bug)', 'why'],
	['1. resumen ejecutivo', 'goal'],
	['2. por qué importa', 'why'],
	['2. the fix', 'why this design'],
	['2. the fix.', 'why this design'],
	['2. el fix (mínimo, sin dependencias, sin tocar api)', 'why this design'],
	['3. the fix', 'why this design'],
	['3. el fix (mínimo, sin dependencias, sin tocar api)', 'why this design'],
	['3. diseño', 'why this design'],
	[
		'3. estructura del plugin (siguiendo el patrón del repo)',
		'why this design',
	],
	['3. what was not changed', 'why this design'],
	['3. definición de done', 'acceptance'],
	['7. definition of done', 'acceptance'],
	['8. definition of done', 'acceptance'],
	['3. definition of done', 'acceptance'],

	// === `non-goals` (deferred / left-out / out of scope) ===
	['⏸️ dejado a propósito (con motivo)', 'non-goals'],
	[
		'⏸️ dejado a propósito (con motivo) — recomiendo una tanda dedicada',
		'non-goals',
	],
	['plus', 'non-goals'],

	// === `risks and mitigations` ===
	['risk register', 'risks and mitigations'],
	['riesgos y mitigación', 'risks and mitigations'],
	['riesgos', 'risks and mitigations'],

	// === `slices` (numbered execution steps) ===
	['0. el bug (en una sola ejecución)', 'goal'],
	['5. slices (siguiendo el patrón disjoint)', 'slices'],
	['4. slices (siguiendo el patrón disjoint)', 'slices'],
	['4. slices (orden de ejecución, disjuntas)', 'slices'],
	['5. slices (orden de ejecución, disjuntas)', 'slices'],
	['4. tests', 'acceptance'],
	['5. tests', 'acceptance'],
	['6. tests', 'acceptance'],

	// === `why` (motivation / context / root cause) ===
	['0. contexto y motivación', 'why'],
	['1. contexto y motivación', 'why'],

	// === `architecture` (design / how it fits) ===
	['implementation', 'architecture'],
	['7. conventional commits', 'architecture'],
	// === Custom / domain-specific (added as the catalogue grew) ===
	['orden por defecto', 'why this design'],
	['out of scope (lo que no toca)', 'non-goals'],
	['out of scope', 'non-goals'],
	['scope', 'why this design'],
	['acceptance (global)', 'acceptance'],
	['acceptance criteria', 'acceptance'],
	['acceptance checklist', 'non-goals'],
	['acceptance evidence', 'non-goals'],
	['acceptance evidence (checklist)', 'non-goals'],
	['decisión de schema (kind, override, boost)', 'why this design'],
	['contract change', 'why this design'],
	['hard rules (cannot be broken)', 'non-goals'],
	['the honest constraint', 'why this design'],
	['decisión de schema', 'why this design'],
	['notes (cross-references)', 'non-goals'],
	['renumbering plan', 'notes'],
	['migration safety net', 'notes'],
	['risks', 'risks and mitigations'],
	['coordination notes', 'notes'],
	['coordination with f119', 'notes'],
	['estructura solid propuesta', 'why this design'],
	// === Audit-narrative emoji sections (recognised as "notes" since they
	//     are post-hoc commentary, not part of the proposal's plan) ===
	['📊 resumen ejecutivo', 'notes'],
	['📊 resumen ejecutivo y opinión general', 'notes'],
	['🔴 fatal — errores críticos o de diseño que deben corregirse', 'notes'],
	[
		'🔴 fatal — bloqueantes o fallos críticos para swarms concurrentes',
		'notes',
	],
	['🔴 fatal — errores que deben corregirse sin excusa', 'notes'],
	['🔴 fatal — errores que deben corregirse sin escusa', 'notes'],
	['🟠 muy mal — problemas serios que degradan la calidad', 'notes'],
	[
		'🟠 mal (muy mal) — problemas serios que degradan la consistencia y la fiabilidad',
		'notes',
	],
	[
		'🟠 muy mal — problemas serios que degradan la calidad o genericidad',
		'notes',
	],
	['🟡 regular — funciona pero mejorable', 'notes'],
	[
		'🟡 regular — deuda técnica y operaciones ineficientes o bloqueantes',
		'notes',
	],
	['🟢 como debe estar — correcto y funcional', 'notes'],
	['🟢 como debe estar — correcto, estándar y coherente', 'notes'],
	['✅ bien — por encima de lo esperado', 'notes'],
	['✅ bien — por encima de la media / implementación limpia', 'notes'],
	['🌟 muy bien — excelente ejecución', 'notes'],
	['🌟 muy bien — excelente ejecución técnica', 'notes'],
	['💎 perfecto — referencia de la que enorgullecerse', 'notes'],
	['💎 perfecto — diseño ejemplar y de referencia', 'notes'],
	['🔮 análisis: eficiencia de tokens para agentes', 'notes'],
	['🔮 análisis: eficiencia de tokens para modelos', 'notes'],
	['🔄 análisis: posibles bucles y bloqueos', 'notes'],
	['🔄 análisis: bucles y bloqueos en la orquestación', 'notes'],
];

// Collapse the tuple list into the lookup the rest of the linter reads.
// Each key keeps every canonical section it has been classified as, in
// the order it appears in `SEMANTIC_ALIAS_ENTRIES` — so the first entry
// (the canonical default) wins via `aliased[0]`, while audit tooling
// can later read the full list if it wants the divergent mappings.
const SEMANTIC_ALIASES: Readonly<Record<string, readonly string[]>> =
	SEMANTIC_ALIAS_ENTRIES.reduce<Record<string, string[]>>(
		(acc, [key, val]) => {
			const existing = acc[key];
			if (existing === undefined) acc[key] = [val];
			else if (!existing.includes(val)) existing.push(val);
			return acc;
		},
		{},
	);

const normalizeHeading = (raw: string): string =>
	raw
		.replace(/^#{1,6}\s*/, '')
		.replace(/^\d+\.\s*/, '')
		.trim()
		.toLowerCase();

/**
 * Map a normalised heading to its canonical section name. Returns
 * `null` when the heading is not recognised (neither in the canonical
 * list nor in `SEMANTIC_ALIASES`).
 */
const resolveCanonicalSection = (normalized: string): string | null => {
	if (PROPOSAL_CANONICAL_ORDER.includes(normalized)) return normalized;
	if (AUDIT_CANONICAL_ORDER.includes(normalized)) return normalized;
	const aliased = SEMANTIC_ALIASES[normalized];
	// Aliases are ordered: the first entry is the canonical default.
	// Subsequent entries record divergent historical mappings that
	// accumulated as the catalogue grew (different authors/readers
	// classified the same heading differently) — they're preserved so
	// future audit tooling can still surface them.
	return aliased?.[0] ?? null;
};

interface IHeadingMatch {
	readonly line: number;
	readonly raw: string;
	readonly normalized: string;
}

/**
 * `true` at index `i` means line `i` (0-based) is inside a fenced code
 * block (```...```). Headings/slices written as illustrative examples
 * inside a fence (this linter's own §4.5 documents the scaffold using
 * `markdown` fences full of literal `## Goal` lines) must not be parsed
 * as real document structure.
 */
const computeFencedLineMask = (lines: readonly string[]): boolean[] => {
	// A CommonMark fenced code block opens with a run of ≥3 backticks
	// (optionally followed by an info string) on a line by itself, and
	// closes with a run of backticks at least as long as the opener.
	// A fence of 4+ backticks lets authors embed 3-backtick spans
	// inside (e.g. an example that documents code itself). The previous
	// implementation only matched exactly 3 backticks and toggled the
	// state on every match, so a 4-backtick block counted as two
	// open/close pairs and the rest of the file was treated as
	// "inside" — which is why headings like `## acceptance` got
	// missed.
	const mask: boolean[] = [];
	let fenceRun = 0; // length of the open fence, 0 when outside any
	for (const line of lines) {
		const trimmed = line.trim();
		const m = /^(```+)(.*)$/.exec(trimmed);
		if (m) {
			const run = m[1]?.length ?? 0;
			if (fenceRun === 0) {
				// Opening fence.
				fenceRun = run;
				mask.push(true); // the delimiter line itself is "inside"
			} else if (run >= fenceRun && (m[2] ?? '').trim() === '') {
				// Closing fence: at least as many backticks, no info string.
				fenceRun = 0;
				mask.push(true);
			} else {
				// Looks like a fence but doesn't close — treat as content.
				mask.push(fenceRun > 0);
			}
			continue;
		}
		mask.push(fenceRun > 0);
	}
	return mask;
};

const findH2Headings = (markdown: string): IHeadingMatch[] => {
	const lines = markdown.split('\n');
	const fenced = computeFencedLineMask(lines);
	const out: IHeadingMatch[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (fenced[i]) continue;
		const line = lines[i] ?? '';
		if (/^##\s+/.test(line) && !/^###/.test(line)) {
			out.push({
				line: i + 1,
				raw: line,
				normalized: normalizeHeading(line),
			});
		}
	}
	return out;
};

const lintSections = (markdown: string, kind?: string): ILintIssue[] => {
	const canonicalOrder =
		kind === 'audit' ? AUDIT_CANONICAL_ORDER : PROPOSAL_CANONICAL_ORDER;
	const requiredSections =
		kind === 'audit' ? AUDIT_REQUIRED_SECTIONS : PROPOSAL_REQUIRED_SECTIONS;
	const canonicalIndex = (name: string): number =>
		canonicalOrder.indexOf(name);

	const issues: ILintIssue[] = [];
	const headings = findH2Headings(markdown);
	// `seen` is keyed by the *resolved canonical* section name, so a
	// narrative heading aliased to `notes` and a literal `## notes`
	// collide as one section (and trigger the duplicate-section lint).
	const seen = new Map<string, IHeadingMatch>();

	for (const h of headings) {
		const resolved = resolveCanonicalSection(h.normalized);
		if (resolved === null) {
			issues.push({
				line: h.line,
				message: `unrecognized section heading "${h.raw.trim()}" — not part of the canonical scaffold`,
				fix: `Rename to one of: ${canonicalOrder.join(', ')} (a leading "N. " is fine).`,
			});
			continue;
		}
		if (seen.has(resolved)) {
			issues.push({
				line: h.line,
				message: `duplicate section "${resolved}"`,
				fix: 'Merge the duplicate sections into one.',
			});
			continue;
		}
		seen.set(resolved, h);
	}

	for (const required of requiredSections) {
		if (!seen.has(required)) {
			issues.push({
				line: 0,
				message: `missing required section "${required}"`,
				fix: `Add a "## ${required}" section.`,
			});
		}
	}

	// Order: the canonical-index sequence of the headings actually present
	// (known ones only) must be non-decreasing. We use the *resolved*
	// canonical name so that a narrative heading aliased to, e.g.,
	// `notes` is compared against the canonical position of `notes`.
	const present = headings
		.map((h) => ({ h, resolved: resolveCanonicalSection(h.normalized) }))
		.filter(
			(x): x is { h: IHeadingMatch; resolved: string } =>
				x.resolved !== null,
		);
	for (let i = 1; i < present.length; i++) {
		const prev = present[i - 1];
		const curr = present[i];
		if (!prev || !curr) continue;
		if (canonicalIndex(curr.resolved) < canonicalIndex(prev.resolved)) {
			issues.push({
				line: curr.h.line,
				message: `section "${curr.resolved}" appears after "${prev.resolved}", out of canonical order`,
				fix: `Reorder so the sections follow: ${canonicalOrder.join(' → ')}.`,
			});
		}
	}

	return issues;
};

interface ISliceCheck {
	readonly sliceLine: number;
	readonly title: string;
}

const findSliceHeadings = (markdown: string): ISliceCheck[] => {
	const lines = markdown.split('\n');
	const fenced = computeFencedLineMask(lines);
	const out: ISliceCheck[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (fenced[i]) continue;
		const line = lines[i] ?? '';
		const m = line.match(/^###\s+(S\d+)\s+—\s+(.+)$/);
		if (m) out.push({ sliceLine: i + 1, title: line.trim() });
	}
	return out;
};

/**
 * A slice block runs from its heading to the next `##`/`###` heading (or
 * EOF). Resolves to the four logical fields under either format (f00016
 * §4.5): terse (`**Files**`/`**Command**`/`**Expect**` bullets) or
 * narrative (`(excl. ...)` in the heading + `**Gate**` bullet, which
 * combines Command + an implicit `Expect: exit0`).
 */
const lintSlice = (
	markdown: string,
	slice: ISliceCheck,
	nextHeadingLine: number,
): ILintIssue[] => {
	const issues: ILintIssue[] = [];
	const lines = markdown.split('\n');
	const block = lines.slice(slice.sliceLine, nextHeadingLine - 1).join('\n');

	const hasStatus = /\*\*Status\*\*:/.test(block);
	const hasFilesField = /\*\*Files\*\*:/.test(block);
	const hasCommandField = /\*\*Command\*\*:/.test(block);
	const hasExpectField = /\*\*Expect\*\*:/.test(block);
	const hasExclFiles = /\(excl\.\s*`/.test(slice.title);
	const hasGate = /\*\*Gate\*\*:/.test(block);

	if (!hasStatus) {
		issues.push({
			line: slice.sliceLine,
			message: `slice "${slice.title}" has no **Status** field`,
			fix: 'Add `- **Status**: pending|in-progress|review|done`.',
		});
	}

	const filesResolved = hasFilesField || hasExclFiles;
	if (!filesResolved) {
		issues.push({
			line: slice.sliceLine,
			message: `slice "${slice.title}" does not resolve a Files field (no **Files** bullet, no "(excl. ...)" in the heading)`,
			fix: 'Add `- **Files**: [...]` or list the files in `(excl. `path`, ...)` in the heading.',
		});
	}

	const commandExpectResolved =
		(hasCommandField && hasExpectField) || hasGate;
	if (!commandExpectResolved) {
		issues.push({
			line: slice.sliceLine,
			message: `slice "${slice.title}" does not resolve Command+Expect (no **Command**/**Expect** pair, no **Gate**)`,
			fix: 'Add `- **Command**: ...` + `- **Expect**: ...`, or a single `- **Gate**: <command>` (implies Expect: exit0).',
		});
	}

	return issues;
};

const lintSlices = (markdown: string): ILintIssue[] => {
	const issues: ILintIssue[] = [];
	const slices = findSliceHeadings(markdown);
	const lines = markdown.split('\n');

	if (slices.length === 0) {
		// Only an issue if there IS a Slices section at all — lintSections
		// already flags a missing Slices section; an empty one is a
		// separate, narrower problem. `resolveCanonicalSection` covers
		// both literal `## Slices` and narrative aliases (e.g.
		// `## 5. Slices (siguiendo el patrón disjoint)`).
		const hasSlicesSection = findH2Headings(markdown).some(
			(h) => resolveCanonicalSection(h.normalized) === 'slices',
		);
		if (hasSlicesSection) {
			issues.push({
				line: 0,
				message:
					'the Slices section has no `### S<N> — <title>` entries',
				fix: 'Add at least one slice.',
			});
		}
		return issues;
	}

	for (let i = 0; i < slices.length; i++) {
		const slice = slices[i];
		if (!slice) continue;
		const next = slices[i + 1];
		const nextLine = next ? next.sliceLine : lines.length + 1;
		issues.push(...lintSlice(markdown, slice, nextLine));
	}
	return issues;
};

const lintFilenameAndFolder = (
	path: string,
	frontmatter: Record<string, unknown>,
): ILintIssue[] => {
	const issues: ILintIssue[] = [];
	const filename = path.split('/').pop() ?? path;
	const m = filename.match(/^([a-z])(\d{3,})-[a-z0-9-]+\.md$/);
	if (!m) {
		issues.push({
			line: 0,
			message: `filename "${filename}" does not match the canonical pattern`,
			fix: 'Rename to `<prefix><NNN>-<kebab-slug>.md` (lowercase prefix, ≥3 digits).',
		});
		return issues;
	}
	const prefix = m[1] ?? '';
	const kind = frontmatter.kind;
	const kindFromPrefix = PROPOSAL_KIND_BY_PREFIX[prefix];
	if (kindFromPrefix === undefined) {
		issues.push({
			line: 0,
			message: `filename prefix "${prefix}" is not a known kind prefix`,
			fix: `Use one of: ${Object.values(PROPOSAL_KINDS)
				.map((k) => k.prefix)
				.join(', ')} (or the retired legacy "p").`,
		});
	} else if (typeof kind === 'string' && kind !== kindFromPrefix) {
		issues.push({
			line: 0,
			message: `filename starts with "${prefix}" (kind=${kindFromPrefix}) but frontmatter.kind = "${kind}"`,
			fix: `Either rename the file to start with "${
				PROPOSAL_KINDS[kind as IProposalKind]?.prefix ?? '?'
			}", or set frontmatter kind: ${kindFromPrefix}.`,
		});
	}

	const status = frontmatter.status;
	if (typeof status === 'string' && status in PROPOSAL_STATUSES) {
		const expectedFolder = STATUS_TO_FOLDER[status as IProposalStatus];
		const pathParts = path.split('/');
		// f00001: terminal statuses (`done`, `retired`) may live under a kind
		// sub-folder (e.g. `done/audits/a00007-...`) as a filesystem-only
		// organisation convention. The check is **status-driven, not
		// position-driven**: walk the ancestor chain from the file
		// upward; the FIRST ancestor whose name matches a known status
		// folder is the file's effective status folder. That ancestor
		// must equal the expected folder. This is robust against future
		// re-orderings of path segments, against any number of nested
		// sub-folders (e.g. `done/audits/2024/...`), and against paths
		// that don't start with `docs/proposals/` (e.g. absolute or
		// relative-from-cwd).
		const STATUS_FOLDER_NAMES = new Set<string>(
			Object.values(STATUS_TO_FOLDER),
		);
		// Skip the filename itself (last segment); walk parents nearest-first.
		const ancestorFolders = pathParts.slice(0, -1);
		const nearestStatusAncestor = ancestorFolders.find((seg) =>
			STATUS_FOLDER_NAMES.has(seg),
		);
		const matches = nearestStatusAncestor === expectedFolder;
		const immediateParent = pathParts[pathParts.length - 2];
		if (!matches) {
			issues.push({
				line: 0,
				message: `frontmatter status "${status}" expects folder "${expectedFolder}" but the nearest status ancestor is "${nearestStatusAncestor ?? '(none)'}" (immediate parent: "${immediateParent}")`,
				fix: `Move the file to docs/proposals/${expectedFolder}/ (or to docs/proposals/${expectedFolder}/<kind-subfolder>/ for terminal statuses), or update status to match its current folder.`,
			});
		}
	}

	return issues;
};

const lintFrontmatter = (
	markdown: string,
): { issues: ILintIssue[]; frontmatter: Record<string, unknown> } => {
	const issues: ILintIssue[] = [];
	const block = extractYamlBlock(markdown);
	if (block === null) {
		return {
			issues: [
				{
					line: 0,
					message: 'no YAML frontmatter block found',
					fix: 'Add a `---`-delimited frontmatter block at the top of the file.',
				},
			],
			frontmatter: {},
		};
	}
	const frontmatter = parseFrontmatterBlock(block);

	const requiredStringFields = [
		'id',
		'kind',
		'title',
		'status',
		'date',
		'track',
	];
	for (const field of requiredStringFields) {
		if (
			typeof frontmatter[field] !== 'string' ||
			frontmatter[field] === ''
		) {
			issues.push({
				line: 0,
				message: `frontmatter is missing required field "${field}"`,
				fix: `Add "${field}: <value>" to the frontmatter.`,
			});
		}
	}

	if (
		typeof frontmatter.kind === 'string' &&
		!(frontmatter.kind in PROPOSAL_KINDS)
	) {
		issues.push({
			line: 0,
			message: `frontmatter kind "${frontmatter.kind}" is not one of the 13 known kinds`,
			fix: `Use one of: ${Object.keys(PROPOSAL_KINDS).join(', ')}.`,
		});
	}

	if (
		typeof frontmatter.status === 'string' &&
		!(frontmatter.status in PROPOSAL_STATUSES)
	) {
		issues.push({
			line: 0,
			message: `frontmatter status "${frontmatter.status}" is not one of the 7 known statuses`,
			fix: `Use one of: ${Object.keys(PROPOSAL_STATUSES).join(', ')}.`,
		});
	}

	if (
		typeof frontmatter.id === 'string' &&
		!/^[a-z]\d{3,}$/.test(frontmatter.id)
	) {
		issues.push({
			line: 0,
			message: `frontmatter id "${frontmatter.id}" does not match /^[a-z]\\d{3,}$/`,
			fix: 'Use a single lowercase letter followed by ≥3 digits (e.g. f00014 padded per f00023, or f114 legacy).',
		});
	}

	if (typeof frontmatter.title === 'string' && frontmatter.title.length < 8) {
		issues.push({
			line: 0,
			message: 'frontmatter title is shorter than 8 characters',
			fix: 'Write a more descriptive title.',
		});
	}

	return { issues, frontmatter: frontmatter as Record<string, unknown> };
};

export const lintProposalMarkdown = (args: {
	readonly path: string;
	readonly markdown: string;
}): ILintResult => {
	const { issues: frontmatterIssues, frontmatter } = lintFrontmatter(
		args.markdown,
	);
	const kind =
		typeof frontmatter.kind === 'string' ? frontmatter.kind : undefined;
	const issues: ILintIssue[] = [
		...frontmatterIssues,
		...lintFilenameAndFolder(args.path, frontmatter),
		...lintSections(args.markdown, kind),
		...lintSlices(args.markdown),
	];
	return { ok: issues.length === 0, issues };
};
