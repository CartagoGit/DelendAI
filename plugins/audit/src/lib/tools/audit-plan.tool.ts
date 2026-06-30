import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import {
	buildBrief,
	UNIVERSAL_SCOPES,
	type AuditMode,
	type ILayerConfig,
} from '../services/audit-brief.service';

import { z } from 'zod';

// --- output schemas --------------------------------------------------------

const PlanOutputSchema = z.object({
	scope: z.string(),
	mode: z.enum(['general', 'specific', 'monorepo']),
	markdown: z.string(),
	dimensions: z.array(z.string()),
	/**
	 * Scopes available for THIS audit invocation. In monorepo mode the
	 * list is filtered to the projects the caller asked for, so the
	 * model pastes the brief knowing exactly which slices are covered.
	 */
	availableScopes: z.array(
		z.object({
			name: z.string(),
			label: z.string(),
			kind: z.enum(['universal', 'layer']),
		}),
	),
	/** The monorepo projects selected for this audit, when applicable. */
	projects: z.array(z.string()),
});

// --- input schema ----------------------------------------------------------

const PlanInputSchema = z.object({
	/**
	 * Scope to audit. Accepts any universal scope (`full`, `security`,
	 * `tokens`, `tests`, `docs`) or any layer name configured via
	 * `options.layers`. Defaults to `full`.
	 */
	scope: z.string().optional(),
	/**
	 * Audit mode. Three values:
	 *
	 *  - `general` — whole-project audit (default for `scope: 'full'`).
	 *  - `specific` — targeted audit of a single dimension or layer.
	 *  - `monorepo` — restrict the audit to a subset of the configured
	 *    layers via `projects`. The host's brief surfaces the selected
	 *    projects explicitly so reviewers can tell at a glance which
	 *    slice of the monorepo was covered.
	 *
	 * When omitted, the tool infers the mode from `scope` + `projects`
	 * (see `inferMode` in `audit-brief.service`).
	 */
	mode: z.enum(['general', 'specific', 'monorepo']).optional(),
	/**
	 * Monorepo project filter. Accepts a list of layer names from the
	 * host's `options.layers`; layers not in the list are dropped from
	 * this audit (but stay configured for future runs). Empty/missing
	 * ⇒ audit every configured layer (general mode).
	 */
	projects: z.array(z.string().min(1)).optional(),
});

// --- builders --------------------------------------------------------------

export interface IPlanToolOptions {
	readonly namespacePrefix: string;
	/**
	 * Default scoring dimensions surfaced in the brief and in the tool
	 * output. When omitted, falls back to `SCORE_DIMENSIONS` (canonical).
	 * The host wires this from `ctx.options.dimensions` when present.
	 */
	readonly dimensions?: readonly string[];
	/**
	 * Host-defined codebase layers. Each layer becomes an available scope
	 * and gets its own reading-phase section in the generated brief.
	 * Wired from `ctx.options.layers`.
	 */
	readonly layers?: readonly ILayerConfig[];
	/**
	 * Project name rendered in the brief header and in the
	 * "no layers configured" fallback. Wired from
	 * `ctx.options.projectName`. Defaults to `"the project"` so the
	 * brief stays agnostic for hosts that never set it.
	 */
	readonly projectName?: string;
	/**
	 * Config file path rendered in the "no layers configured" hint
	 * (e.g. `mcp-vertex.config.json`, `app.toml`, `<config-file>`).
	 * Wired from `ctx.options.configFileName`. Defaults to
	 * `"<config-file>"` to avoid leaking any specific host vocabulary.
	 */
	readonly configFileName?: string;
	/**
	 * Host-specific cross-cutting invariants rendered into the brief's
	 * "Invariantes transversales" block (after the universal defaults).
	 * Wired from `ctx.options.crossCuttingAdditions`.
	 */
	readonly crossCuttingAdditions?: readonly string[];
}

/**
 * Infer the audit mode from the tool inputs when the caller did not
 * pass an explicit `mode`. Pure: same inputs always yield the same
 * inferred mode. Mirrors `inferMode` in `audit-brief.service` so the
 * tool layer can short-circuit invalid combinations BEFORE building
 * the markdown.
 */
const inferMode = (
	scope: string,
	layers: readonly ILayerConfig[],
	projects: readonly string[] | undefined,
): AuditMode => {
	if (projects && projects.length > 0) return 'monorepo';
	if (scope === 'full') return 'general';
	if (
		scope in (UNIVERSAL_SCOPES as readonly string[]) ||
		layers.some((l) => l.name === scope)
	) {
		return 'specific';
	}
	return 'general';
};

/**
 * `<prefix>_audit_plan { scope?, mode?, projects? }` — return the
 * canonical brief an agent can paste into a fresh model session. Pure:
 * no I/O.
 */
export const buildPlanRegistration = (
	options: IPlanToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	const defaultDimensions = options.dimensions;
	const configuredLayers = options.layers ?? [];

	// All scopes available for this host (universal + every configured
	// layer, ignoring any monorepo filter — `mode` and `projects` are
	// runtime parameters, not configuration).
	const universalAvailable = UNIVERSAL_SCOPES.map((name) => ({
		name,
		label: name, // labels are resolved in buildBrief
		kind: 'universal' as const,
	}));
	const layerAvailable = configuredLayers.map((l) => ({
		name: l.name,
		label: l.label,
		kind: 'layer' as const,
	}));
	const allAvailable = [...universalAvailable, ...layerAvailable];
	const allAvailableNames = allAvailable.map((s) => s.name);
	const configuredLayerNames = new Set(configuredLayers.map((l) => l.name));

	return {
		id: 'audit_plan',
		summary:
			'Return the canonical audit brief (markdown) — supports general / specific / monorepo modes. Paste it into a fresh model session to elicit an audit in the format `@mcp-vertex/audit` expects.',
		descriptionKey: 'audit_plan',
		tags: ['audit', 'orientation'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_audit_plan`,
				{
					description:
						'Return the canonical audit brief (markdown) for the requested scope and mode. Universal scopes: `full` (default), `security`, `tokens`, `tests`, `docs`. Layer scopes depend on host configuration (`options.layers`). Modes: `general` (whole project, default for `scope: full`), `specific` (one dimension/layer), `monorepo` (filter layers via `projects`). Paste the output into any model session to elicit a structured audit.',
					inputSchema: PlanInputSchema,
					outputSchema: PlanOutputSchema,
				},
				async (args: {
					scope?: string | undefined;
					mode?: AuditMode | undefined;
					projects?: readonly string[] | undefined;
				}) => {
					const scope = args.scope ?? 'full';
					if (!allAvailableNames.includes(scope)) {
						return toolError(
							`unknown scope "${scope}"`,
							`Available scopes: ${allAvailableNames.join(', ')}.`,
						);
					}
					// Validate the monorepo project filter BEFORE
					// calling buildBrief so typos surface as tool
					// errors instead of silently producing a partial
					// brief.
					const projects = args.projects ?? [];
					if (projects.length > 0) {
						const unknown = projects.filter(
							(p) => !configuredLayerNames.has(p),
						);
						if (unknown.length > 0) {
							return toolError(
								`unknown project(s): ${unknown.join(', ')}`,
								`Available layer projects for monorepo mode: ${[...configuredLayerNames].join(', ') || '(none configured)'}.`,
							);
						}
					}
					const mode =
						args.mode ?? inferMode(scope, configuredLayers, projects);
					const dimensions = defaultDimensions ?? [
						'Arquitectura',
						'Contratos e interfaces',
						'Eficiencia de tokens',
						'Anti-deadlock / concurrencia',
						'Calidad de código fuente',
						'Documentación',
						'Tests',
						'Seguridad operacional',
						'Genericidad',
					];
					// Filter the available-scopes list to the monorepo
					// subset when `projects` is provided so the model
					// does not waste cycles reading the wrong files.
					const availableScopes =
						mode === 'monorepo'
							? allAvailable.filter(
									(s) =>
										s.kind === 'universal' ||
										configuredLayerNames.has(s.name) &&
											projects.includes(s.name),
								)
							: allAvailable;
					return toolJson({
						scope,
						mode,
						markdown: buildBrief(scope, {
							dimensions,
							layers: configuredLayers,
							mode,
							projects,
							...(options.projectName !== undefined
								? { projectName: options.projectName }
								: {}),
							...(options.configFileName !== undefined
								? { configFileName: options.configFileName }
								: {}),
							...(options.crossCuttingAdditions !== undefined
								? {
										crossCuttingAdditions:
											options.crossCuttingAdditions,
									}
								: {}),
						}),
						dimensions,
						availableScopes,
						projects,
					});
				},
			);
		},
	};
};
