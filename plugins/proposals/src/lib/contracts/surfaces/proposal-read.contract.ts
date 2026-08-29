import z from 'zod';

/**
 * r00018 S1 — diseño del surface consolidado de lectura.
 *
 * Este contrato documenta el mapa legacy -> surface propuesto y define
 * unions discriminadas compactas reutilizables para la futura
 * consolidación sin ampliar el contrato público actual.
 */

export const PROPOSAL_READ_SURFACE_ID = 'proposal_read';

export const PROPOSAL_READ_LEGACY_TOOLS = [
	'get_proposal',
	'list_proposals',
	'search_proposals',
	'get_proposal_metadata',
	'get_proposal_slices',
	'get_proposal_history',
	'get_proposal_review_log',
] as const;

export const proposalReadDescription =
	'Read a proposal or list them with filters.';

const nullableStringSchema = z.string().nullable();

export const proposalReadViewSchema = z.enum([
	'list',
	'detail',
	'history',
	'slices',
	'review',
]);

export const proposalReadDetailSchema = z.enum(['compact', 'normal', 'full']);

const proposalReadFiltersSchema = z
	.object({
		status: z.string().min(1).optional(),
		track: z.string().min(1).optional(),
		kind: z.string().min(1).optional(),
	})
	.strict();

/** x00298: default page size for `proposal_read` when the caller omits `limit`. */
export const PROPOSAL_READ_DEFAULT_PAGE_SIZE = 20;

const proposalReadPaginationSchema = z
	.object({
		limit: z
			.int()
			.positive()
			.max(100)
			.default(PROPOSAL_READ_DEFAULT_PAGE_SIZE),
		cursor: z.string().min(1).optional(),
	})
	.strict();

export const proposalReadInputSchema = z.discriminatedUnion('view', [
	z
		.object({
			view: z.literal('list'),
			filters: proposalReadFiltersSchema.optional(),
			pagination: proposalReadPaginationSchema.optional(),
		})
		.strict(),
	z
		.object({
			view: z.literal('detail'),
			proposalId: z.string().min(1),
			detail: proposalReadDetailSchema.optional(),
		})
		.strict(),
	z
		.object({
			view: z.literal('history'),
			proposalId: z.string().min(1),
		})
		.strict(),
	z
		.object({
			view: z.literal('slices'),
			proposalId: z.string().min(1),
		})
		.strict(),
	z
		.object({
			view: z.literal('review'),
			proposalId: z.string().min(1),
		})
		.strict(),
]);

const proposalSummarySchema = z
	.object({
		id: z.string(),
		status: z.string(),
		kind: nullableStringSchema,
		track: z.string(),
		title: z.string(),
		summary: z.string(),
		progress: nullableStringSchema,
		next: nullableStringSchema,
	})
	.strict();

const proposalSliceSchema = z
	.object({
		id: z.string(),
		status: z.string(),
		title: z.string().optional(),
	})
	.strict();

const proposalAcceptanceSchema = z
	.object({
		command: z.string(),
		expect: z.string(),
	})
	.strict();

const proposalHistoryEntrySchema = z
	.object({
		timestamp: z.string(),
		action: z.string(),
		agent: z.string().optional(),
		note: z.string().optional(),
	})
	.strict();

const proposalReviewEntrySchema = z
	.object({
		timestamp: z.string(),
		action: z.enum(['submit', 'approve', 'request_changes']),
		agent: z.string(),
		note: z.string().optional(),
	})
	.strict();

const proposalDetailSchema = proposalSummarySchema
	.extend({
		priority: nullableStringSchema,
		parentPlan: nullableStringSchema,
		auditSection: nullableStringSchema,
		related: z.array(z.string()),
		slices: z.array(proposalSliceSchema),
		acceptance: z.array(proposalAcceptanceSchema),
	})
	.strict();

/**
 * The per-view output shapes, discriminated on `view`. This union exists
 * ONLY to preserve the narrow TypeScript types (`IProposalReadOutput`)
 * and runtime validation for the handlers — it is NOT safe to hand a
 * `z.union`/`z.discriminatedUnion` root straight to the MCP SDK's
 * `outputSchema`: `structuredContent` must serialize from a single object
 * root, and an unwrapped union is silently dropped at `listTools` (the
 * e2e invariant "every registered tool declares an outputSchema" then
 * fails, exactly the drift that bit p00012/proposal_get and
 * close_plan). See the envelope + the `view`-discriminated helper below.
 */
const proposalReadViewSchemas = z.discriminatedUnion('view', [
	z
		.object({
			view: z.literal('list'),
			proposals: z.array(proposalSummarySchema),
			nextCursor: z.string().nullable().optional(),
		})
		.strict(),
	z
		.object({
			view: z.literal('detail'),
			level: proposalReadDetailSchema,
			proposal: proposalDetailSchema,
		})
		.strict(),
	z
		.object({
			view: z.literal('history'),
			history: z.array(proposalHistoryEntrySchema),
		})
		.strict(),
	z
		.object({
			view: z.literal('slices'),
			slices: z.array(proposalSliceSchema),
		})
		.strict(),
	z
		.object({
			view: z.literal('review'),
			reviews: z.array(proposalReviewEntrySchema),
		})
		.strict(),
]);

/**
 * Narrow per-view output type used by the tool handlers (discriminator
 * `view` is retained so a `switch (output.view)` still narrows).
 */
export type IProposalReadOutput = z.infer<typeof proposalReadViewSchemas>;

/**
 * The MCP-safe root envelope. `proposal_get` is registered through the
 * compact `proposal_read` surface (r00018), whose handler returns the
 * narrow union; before handing structured content to the SDK the output
 * is wrapped as `payload` (an object), and the tool's wire envelope is
 * always this single object root. Kept non-strict to tolerate SDK-
 * injected fields (cursor pagination, etc.).
 */
export const proposalReadOutputSchema = z.object({
	// One field per discriminated view; exactly one pair is present and
	// validated by proposalReadViewSchemas in the handler return.
	proposals: z.array(proposalSummarySchema).optional(),
	nextCursor: z.string().nullable().optional(),
	level: proposalReadDetailSchema.optional(),
	proposal: proposalDetailSchema.optional(),
	history: z.array(proposalHistoryEntrySchema).optional(),
	slices: z.array(proposalSliceSchema).optional(),
	reviews: z.array(proposalReviewEntrySchema).optional(),
});

export type IProposalReadInput = z.infer<typeof proposalReadInputSchema>;
export type IProposalReadView = z.infer<typeof proposalReadViewSchema>;
