/**
 * diagram-proposals.tool.ts — f00132 S2: two tools in one file.
 *
 *   - `diagram_erd` — re-renders the database plugin's
 *     `IDatabaseSchema` as a mermaid `erDiagram`. Pure passthrough;
 *     the schema is supplied inline (the database plugin's
 *     `db_schema` tool produces it; the diagram tool never reads
 *     the DB itself).
 *   - `diagram_proposals` — emits the proposal DFA stateDiagram
 *     annotated with the current per-status counts. The counts
 *     map is supplied inline (the proposals plugin's
 *     `proposal_board` produces it; the diagram tool never
 *     touches the registry).
 *
 * Both tools are pure over injected data, per the S2 spec.
 */

import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';
import type { IDatabaseSchema } from '@delendai/database/public';

import { buildMermaidEr } from '../erd/build-erd';
import { buildProposalDfaMermaid } from '../erd/build-proposal-dfa';

const PROPOSAL_STATUSES = [
	'ready',
	'in-progress',
	'review',
	'done',
	'paused',
	'blocked',
	'retired',
] as const;

export interface IDiagramProposalsToolOptions {
	readonly namespacePrefix: string;
}

const idSchema = z.string();
const countEntry = z.object({
	ready: z.number().int().nonnegative().optional(),
	'in-progress': z.number().int().nonnegative().optional(),
	review: z.number().int().nonnegative().optional(),
	done: z.number().int().nonnegative().optional(),
	paused: z.number().int().nonnegative().optional(),
	blocked: z.number().int().nonnegative().optional(),
	retired: z.number().int().nonnegative().optional(),
});

/**
 * Build the two-tool registration for `<prefix>_diagram_erd` and
 * `<prefix>_diagram_proposals`. Both tools share the options
 * struct; both are read-only (no effects).
 */
export const buildDiagramProposalsToolRegistrations = (
	options: IDiagramProposalsToolOptions,
): readonly IToolRegistration[] => [
	{
		id: 'diagram_erd',
		summary:
			'Render an `IDatabaseSchema` (from the database plugin) as a mermaid erDiagram.',
		tags: ['diagram', 'erd'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_diagram_erd`,
				{
					description:
						'Take the schema object the database plugin produces (`db_schema`) and render it as a mermaid `erDiagram` (renders natively in the docs site + artifacts). Pure passthrough: the diagram tool never touches the database — pass the schema as `schema` and the tool returns the mermaid string. Cardinality is inferred from FK uniqueness; if the inference cannot classify, the edge is drawn as `one-to-many` (the conservative default).',
					inputSchema: z.object({
						// Structural validation of IDatabaseSchema (the shape
						// buildMermaidEr consumes): reject non-object
						// schemas, schemas without `tables`, and tables
						// missing the fields the renderer dereferences
						// (name / columns / indexes / foreignKeys) BEFORE
						// the handler runs. `.passthrough()` keeps extra
						// fields (driver, table.schema, column metadata…)
						// so the database plugin's richer projection still
						// validates. A bare `z.unknown()` used to accept any
						// scalar here and only failed at runtime.
						schema: z
							.object({
								tables: z.array(
									z
										.object({
											name: z.string(),
											columns: z.array(z.unknown()),
											indexes: z.array(z.unknown()),
											foreignKeys: z.array(z.unknown()),
										})
										.passthrough(),
								),
							})
							.passthrough(),
					}),
					outputSchema: z.object({
						mermaid: z.string(),
						tables: z.number().int().nonnegative(),
						relationships: z.number().int().nonnegative(),
					}),
				},
				async (args: { schema: unknown }) => {
					const schema = args.schema as IDatabaseSchema;
					if (
						schema === null ||
						typeof schema !== 'object' ||
						!Array.isArray((schema as { tables?: unknown }).tables)
					) {
						return toolError(
							"diagram_erd: `schema` must be an IDatabaseSchema object (use the database plugin's `db_schema` tool to produce one).",
							'Call <prefix>_db_schema first and pass the returned object as `schema`.',
						);
					}
					const mermaid = buildMermaidEr(schema);
					return toolJson({
						mermaid,
						tables: schema.tables.length,
						relationships: schema.tables.reduce(
							(total, table) => total + table.foreignKeys.length,
							0,
						),
					});
				},
			);
		},
	},
	{
		id: 'diagram_proposals',
		summary:
			'Render the proposal status DFA as a mermaid stateDiagram, optionally annotated with current per-status counts.',
		tags: ['diagram', 'orientation'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_diagram_proposals`,
				{
					description:
						'Emit the proposal status finite automaton (DFA) as a mermaid `stateDiagram-v2`. The counts map (from the proposals plugin `proposal_board`) is optional — omit it to render the bare DFA, or pass the per-status counts to annotate each node with `[N]`. The DFA edges come from `PROPOSAL_STATUS_TRANSITIONS` and are emitted in alphabetical order so the output is stable across runs. Pure passthrough: the tool never reads the registry.',
					inputSchema: z.object({
						counts: countEntry.optional(),
					}),
					outputSchema: z.object({
						mermaid: z.string(),
						statuses: z.array(idSchema),
						edges: z.number().int().nonnegative(),
						annotated: z.array(idSchema),
					}),
				},
				async (args) => {
					try {
						const counts = (args.counts ?? {}) as Partial<
							Record<(typeof PROPOSAL_STATUSES)[number], number>
						>;
						const mermaid = buildProposalDfaMermaid(counts);
						// The renderer emits a deterministic set of edges;
						// re-count them by inspecting the generated mermaid
						// so the tool seam stays narrow (no need to import
						// PROPOSAL_STATUS_TRANSITIONS here — the renderer
						// encodes the same DFA by construction).
						const renderedEdges = mermaid
							.split('\n')
							.filter((line) => line.includes('-->')).length;
						return toolJson({
							mermaid,
							statuses: [...PROPOSAL_STATUSES],
							edges: renderedEdges,
							annotated: PROPOSAL_STATUSES.filter(
								(status) => (counts[status] ?? 0) > 0,
							),
						});
					} catch (err) {
						return toolError(
							`diagram_proposals failed: ${(err as Error).message}`,
							'Pass an optional `counts` map of per-status counts, or omit it for the bare DFA.',
						);
					}
				},
			);
		},
	},
];
