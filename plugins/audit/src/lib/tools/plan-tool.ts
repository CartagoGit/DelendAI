import { z } from 'zod';

import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import { buildBrief, type AuditScope, ALL_SCOPES } from '../brief';

// --- output schemas --------------------------------------------------------

const PlanOutputSchema = z.object({
	scope: z.enum(ALL_SCOPES as readonly [AuditScope, ...AuditScope[]]),
	markdown: z.string(),
	dimensions: z.array(z.string()),
});

// --- input schema ----------------------------------------------------------

const PlanInputSchema = z.object({
	scope: z
		.enum(ALL_SCOPES as readonly [AuditScope, ...AuditScope[]])
		.optional(),
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
						'Return the canonical audit brief (markdown) that the agent can paste into any model session to elicit an audit in the format `@mcp-vertex/audit` can consolidate. Optional `scope` narrows the audit focus (default `full`).',
					inputSchema: PlanInputSchema,
					outputSchema: PlanOutputSchema,
				},
				async (args: { scope?: AuditScope | undefined }) => {
					const scope: AuditScope = args.scope ?? 'full';
					if (!ALL_SCOPES.includes(scope)) {
						return toolError(
							`unknown scope "${scope}"`,
							`Allowed scopes: ${ALL_SCOPES.join(', ')}.`,
						);
					}
					// Resolve dimensions per call: explicit config wins, then
					// the canonical default. We don't pass per-call overrides
					// here (the input schema has no `dimensions` field on
					// purpose — rubric tweaks are a host-level config concern,
					// not a per-tool-call concern).
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
						markdown: buildBrief(scope, { dimensions }),
						dimensions,
					});
				},
			);
		},
	};
};
