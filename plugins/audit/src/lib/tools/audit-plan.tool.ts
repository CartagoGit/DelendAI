import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import {
	buildBrief,
	UNIVERSAL_SCOPES,
	type ILayerConfig,
} from '../services/audit-brief.service';

import { z } from 'zod';

// --- output schemas --------------------------------------------------------

const PlanOutputSchema = z.object({
	scope: z.string(),
	markdown: z.string(),
	dimensions: z.array(z.string()),
	/** All scopes available for this host (universal + configured layers). */
	availableScopes: z.array(
		z.object({
			name: z.string(),
			label: z.string(),
			kind: z.enum(['universal', 'layer']),
		}),
	),
});

// --- input schema ----------------------------------------------------------

const PlanInputSchema = z.object({
	/**
	 * Scope to audit. Accepts any universal scope (`full`, `security`,
	 * `tokens`, `tests`, `docs`) or any layer name configured via
	 * `options.layers`. Defaults to `full`.
	 */
	scope: z.string().optional(),
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
 * `<prefix>_audit_plan { scope? }` — return the canonical brief an
 * agent can paste into a fresh model session. Pure: no I/O.
 */
export const buildPlanRegistration = (
	options: IPlanToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	const defaultDimensions = options.dimensions;
	const configuredLayers = options.layers ?? [];

	// All scopes available for this host.
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

	return {
		id: 'audit_plan',
		summary:
			'Return the canonical audit brief (markdown). Paste it into a fresh model session to elicit an audit in the format `@mcp-vertex/audit` expects.',
		descriptionKey: 'audit_plan',
		tags: ['audit', 'orientation'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_audit_plan`,
				{
					description:
						'Return the canonical audit brief (markdown) for the requested scope. Universal scopes: `full` (default), `security`, `tokens`, `tests`, `docs`. Additional layer scopes depend on host configuration (`options.layers`). Paste the output into any model session to elicit a structured audit.',
					inputSchema: PlanInputSchema,
					outputSchema: PlanOutputSchema,
				},
				async (args: { scope?: string | undefined }) => {
					const scope = args.scope ?? 'full';
					if (!allAvailableNames.includes(scope)) {
						return toolError(
							`unknown scope "${scope}"`,
							`Available scopes: ${allAvailableNames.join(', ')}.`,
						);
					}
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
					return toolJson({
						scope,
						markdown: buildBrief(scope, {
							dimensions,
							layers: configuredLayers,
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
						availableScopes: allAvailable,
					});
				},
			);
		},
	};
};
