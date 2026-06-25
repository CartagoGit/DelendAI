/**
 * proposal-narrative-patterns.ts — r00003 S7 (F2, S + O + D).
 *
 * The structural proposal linter (`proposal-scaffold-linter.ts`) used to
 * carry a large hardcoded catalogue of *narrative* H2-heading aliases —
 * Spanish audit phrasings, emoji section titles, and host/project-specific
 * strings like `copilot · minimax-m3` and `mcp-vertex`. That data is not
 * structural: it encodes the history of one project's audit notes. Baking
 * it into the runtime linter violated:
 *
 *   - **SRP**: the linter validated *structure* AND remembered one host's
 *     narrative history.
 *   - **OCP**: a new narrative heading meant editing the linter source.
 *   - **DIP**: there was no seam to inject a different host's vocabulary.
 *
 * This module owns the narrative-pattern concern behind
 * `INarrativePatternProvider`. The linter now depends on the provider, not
 * on a literal array:
 *
 *   - A host that wants NO narrative aliases passes
 *     `ctx.options.proposalNarrativePatterns: []` (or its own list) and the
 *     linter validates pure structure.
 *   - The historical catalogue below stays available as an opt-in default
 *     (`createDefaultNarrativePatternProvider`) so this repo's own audits
 *     under `docs/mcp-vertex/proposals/done/audits/` keep linting clean.
 *
 * The aliases map a normalised H2 heading to ONE OR MORE canonical section
 * names; the first entry is the canonical default. The list is a tuple
 * array (not an object literal) because some heading strings legitimately
 * map to more than one category, which a `Record` literal could not hold.
 */

export type INarrativeAliasEntry = readonly [string, string];

export interface INarrativePatternProvider {
	/**
	 * Normalised-heading → ordered canonical-section names. The first
	 * entry per key is the canonical default the linter applies.
	 */
	readonly aliases: Readonly<Record<string, readonly string[]>>;
}

/** Collapse a tuple list into the lookup the linter reads. Later entries
 *  with the same key extend (not overwrite) the value, preserving the
 *  divergent historical mappings that accumulated over time. */
export const buildNarrativeAliases = (
	entries: ReadonlyArray<INarrativeAliasEntry>,
): Readonly<Record<string, readonly string[]>> =>
	entries.reduce<Record<string, string[]>>((acc, [key, val]) => {
		const existing = acc[key];
		if (existing === undefined) acc[key] = [val];
		else if (!existing.includes(val)) existing.push(val);
		return acc;
	}, {});

/**
 * The historical, host/project-specific narrative catalogue. Opt-in: a
 * host injects this (or its own list) through
 * `ctx.options.proposalNarrativePatterns`. It is NOT structural; do not
 * treat membership here as part of the canonical scaffold contract.
 */
export const HISTORICAL_AUDIT_NARRATIVE_ENTRIES: ReadonlyArray<INarrativeAliasEntry> =
	[
		// === `notes` (post-mortem / status / continuation / housekeeping) ===
		['qué se hizo', 'notes'],
		['qué se hizo (todo ✅ con tests, commiteado)', 'notes'],
		[
			'pendiente para 11/10 (requiere decisión o es alcance grande)',
			'notes',
		],
		['pendiente para 11/10 (cola §0)', 'notes'],
		['🔖 cómo continuar en la oficina', 'notes'],
		['🔖 cómo continuar', 'notes'],
		['estado de la cola §0 (n1–n23)', 'notes'],
		['estado al cerrar (20:10)', 'notes'],
		['estado git (importante para la oficina)', 'notes'],
		['estado', 'notes'],
		['🏁 estado y continuación (casa, 2026-06-17)', 'notes'],
		[
			'🌐 nuevo workstream — distribución + web (w1/w2), 2026-06-17',
			'notes',
		],
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
		[
			'📋 análisis: el plugin `proposals` — complejidad vs. necesidad',
			'notes',
		],
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
		[
			'6. capacidades candidatas (tools / skills / agentes / plugins)',
			'notes',
		],
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
		[
			'7-ter. tercera ronda agnóstica (18-06) — hallazgos asimilados',
			'notes',
		],
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
		[
			'10. dogfooding: lo que el proyecto aún no se aplica a sí mismo',
			'notes',
		],
		[
			'10. sesión 20-06 — l111: crash de orquestación + docsdir desalineado',
			'notes',
		],
		['11. arquitectura general — diagnóstico final', 'notes'],
		[
			'11. qué está fatal, mal, regular, bien, muy bien y perfecto',
			'notes',
		],
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
		[
			'2. el fix (mínimo, sin dependencias, sin tocar api)',
			'why this design',
		],
		['3. the fix', 'why this design'],
		[
			'3. el fix (mínimo, sin dependencias, sin tocar api)',
			'why this design',
		],
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
		[
			'🔴 fatal — errores críticos o de diseño que deben corregirse',
			'notes',
		],
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

/**
 * Default provider: the historical catalogue, so this repo's existing
 * audits keep passing without per-file config. Hosts that want a strict,
 * structure-only linter inject an empty provider instead.
 */
export const createDefaultNarrativePatternProvider =
	(): INarrativePatternProvider => ({
		aliases: buildNarrativeAliases(HISTORICAL_AUDIT_NARRATIVE_ENTRIES),
	});

/** Empty provider: no narrative aliases. The linter validates pure
 *  structure; only the canonical section names are recognised. */
export const createEmptyNarrativePatternProvider =
	(): INarrativePatternProvider => ({ aliases: {} });

/**
 * Build a provider from a host-supplied list of `[heading, canonical]`
 * tuples (`ctx.options.proposalNarrativePatterns`). Defensive: ignores
 * malformed entries so a bad config row can never throw inside the linter.
 */
export const createNarrativePatternProvider = (
	entries: ReadonlyArray<INarrativeAliasEntry> | undefined,
): INarrativePatternProvider => {
	if (entries === undefined) return createDefaultNarrativePatternProvider();
	const clean = entries.filter(
		(e): e is INarrativeAliasEntry =>
			Array.isArray(e) &&
			e.length === 2 &&
			typeof e[0] === 'string' &&
			typeof e[1] === 'string',
	);
	return { aliases: buildNarrativeAliases(clean) };
};
