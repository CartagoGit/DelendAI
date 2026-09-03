import z from 'zod';

import {
	KPI_DETAIL_LEVELS,
	KPI_DIMENSIONS,
	KPI_VIEW_STATUSES,
	PROJECT_KPI_VIEWS,
} from '../contracts/kpi-query.interface';

const DISPLAY_UNITS = [
	'score',
	'count',
	'ratio',
	'tokens',
	'usd',
	'bytes',
	'ms',
] as const;

const TREND_DIRECTIONS = ['up', 'down', 'stable', 'unknown'] as const;
const FINDING_SEVERITIES = ['info', 'warning', 'error'] as const;

export const ProjectKpisSourceSchema = z
	.object({
		id: z.string(),
		kind: z.enum([
			'snapshot',
			'history',
			'trend',
			'usage-summary',
			'invocations',
			'activation-kpis',
		]),
		status: z.enum(KPI_VIEW_STATUSES),
		observedAt: z.string().optional(),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisRecommendationSchema = z
	.object({
		tool: z.string(),
		priority: z.enum(['now', 'next', 'later']),
		reason: z.string(),
	})
	.strict();

export const ProjectKpisDisplayMetricSchema = z
	.object({
		key: z.string(),
		label: z.string(),
		status: z.enum(KPI_VIEW_STATUSES),
		unit: z.enum(DISPLAY_UNITS),
		source: z.string(),
		value: z.number().finite().optional(),
		observedAt: z.string().optional(),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisTrendMetricSchema = z
	.object({
		key: z.string(),
		label: z.string(),
		direction: z.enum(TREND_DIRECTIONS),
		status: z.string(),
		source: z.string(),
		sampleCount: z.number().int().min(0),
		currentAt: z.string().optional(),
		currentValue: z.number().finite().optional(),
		previousAt: z.string().optional(),
		previousValue: z.number().finite().optional(),
		delta: z.number().finite().optional(),
		deltaPercent: z.number().finite().optional(),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisHistoryEntrySchema = z
	.object({
		generatedAt: z.string(),
		persistedAt: z.string(),
		healthScore: z.number().finite().optional(),
		calls: z.number().finite().optional(),
		totalTokens: z.number().finite().optional(),
		costUsdStatus: z.string(),
		costUsd: z.number().finite().optional(),
		tokenSavingsStatus: z.string(),
		tokenSavings: z.number().finite().optional(),
		financialSavingsUsdStatus: z.string(),
		financialSavingsUsd: z.number().finite().optional(),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisBreakdownItemSchema = z
	.object({
		key: z.string(),
		status: z.enum(KPI_VIEW_STATUSES),
		calls: z.number().int().min(0).optional(),
		successfulCalls: z.number().int().min(0).optional(),
		failedCalls: z.number().int().min(0).optional(),
		errors: z.number().int().min(0).optional(),
		totalTokens: z.number().int().min(0).optional(),
		costUsd: z.number().min(0).optional(),
		tokensSaved: z.number().int().min(0).optional(),
		averageLatencyMs: z.number().finite().nullable().optional(),
		utilityPer1kTokens: z.number().finite().optional(),
		lastSeenAt: z.string().nullable().optional(),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisBreakdownSchema = z
	.object({
		dimension: z.enum(KPI_DIMENSIONS),
		status: z.enum(KPI_VIEW_STATUSES),
		source: z.string(),
		totalItems: z.number().int().min(0),
		items: z.array(ProjectKpisBreakdownItemSchema),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisIssueSchema = z
	.object({
		ts: z.string(),
		plugin: z.string(),
		tool: z.string(),
		requestType: z.string(),
		outcome: z.string(),
		classification: z.string(),
		correlationId: z.string().nullable(),
		message: z.string(),
		incongruence: z.boolean(),
		iteration: z.number().int().nullable(),
	})
	.strict();

export const ProjectKpisFindingSchema = z
	.object({
		id: z.string(),
		severity: z.enum(FINDING_SEVERITIES),
		status: z.enum(KPI_VIEW_STATUSES),
		summary: z.string(),
		evidence: z.string(),
		recommendation: z.string().optional(),
	})
	.strict();

export const ProjectKpisSnapshotSectionSchema = z
	.object({
		status: z.enum(KPI_VIEW_STATUSES),
		source: z.string(),
		generatedAt: z.string(),
		windowDays: z.number().int().positive(),
		highlights: z.array(ProjectKpisDisplayMetricSchema),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisHistorySectionSchema = z
	.object({
		status: z.enum(KPI_VIEW_STATUSES),
		source: z.string(),
		entries: z.array(ProjectKpisHistoryEntrySchema),
		trends: z.array(ProjectKpisTrendMetricSchema),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisIssuesSectionSchema = z
	.object({
		status: z.enum(KPI_VIEW_STATUSES),
		source: z.string(),
		items: z.array(ProjectKpisIssueSchema),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisFindingsSectionSchema = z
	.object({
		status: z.enum(KPI_VIEW_STATUSES),
		source: z.string(),
		items: z.array(ProjectKpisFindingSchema),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisActivationSectionSchema = z
	.object({
		status: z.enum(KPI_VIEW_STATUSES),
		source: z.string(),
		sessionCount: z.number().int().min(0),
		meanPrecision: z.number().finite().optional(),
		meanRecall: z.number().finite().optional(),
		meanChurn: z.number().finite().optional(),
		note: z.string().optional(),
	})
	.strict();

export const ProjectKpisOutputSchema = z
	.object({
		contract: z.literal('project-kpis.view'),
		version: z.literal(1),
		view: z.enum(PROJECT_KPI_VIEWS),
		detail: z.enum(KPI_DETAIL_LEVELS),
		status: z.enum(KPI_VIEW_STATUSES),
		generatedAt: z.string(),
		window: z
			.object({
				from: z.string(),
				to: z.string(),
				windowDays: z.number().int().positive(),
				limit: z.number().int().positive(),
			})
			.strict(),
		dimensions: z.array(z.enum(KPI_DIMENSIONS)),
		filter: z
			.object({
				provider: z.string().optional(),
				plugin: z.string().optional(),
				tool: z.string().optional(),
				agent: z.string().optional(),
				extension: z.string().optional(),
				model: z.string().optional(),
				requestType: z.string().optional(),
				outcome: z
					.enum(['success', 'error', 'timeout', 'fallback'])
					.optional(),
				error: z.string().optional(),
			})
			.strict()
			.optional(),
		summary: z.string(),
		sources: z.array(ProjectKpisSourceSchema),
		privacy: z
			.object({
				observedMcpOnly: z.boolean(),
				limitations: z.array(z.string()),
			})
			.strict(),
		recommendations: z.array(ProjectKpisRecommendationSchema),
		/**
		 * Flat, view-independent projection of the display metrics this
		 * response already computed (today: `snapshot.highlights`, when a
		 * snapshot is present). Lets an agent read headline numbers without
		 * knowing which named section they live in. Never invents a number
		 * that isn't already present elsewhere in the payload.
		 */
		metrics: z.array(ProjectKpisDisplayMetricSchema),
		/** Where to fetch the full-detail payload for this view, if the caller wants it. */
		detailUri: z.string().optional(),
		/** Opaque cursor for a follow-up call that continues a paginated view. */
		nextCursor: z.string().optional(),
		snapshot: ProjectKpisSnapshotSectionSchema.optional(),
		history: ProjectKpisHistorySectionSchema.optional(),
		breakdowns: z.array(ProjectKpisBreakdownSchema).optional(),
		issues: ProjectKpisIssuesSectionSchema.optional(),
		findings: ProjectKpisFindingsSectionSchema.optional(),
		activation: ProjectKpisActivationSectionSchema.optional(),
		bytes: z.number().int().positive(),
		truncated: z.boolean(),
		originalBytes: z.number().int().positive().optional(),
	})
	.strict();

export type IProjectKpisOutput = z.infer<typeof ProjectKpisOutputSchema>;

/**
 * Discovery envelope: this — not `ProjectKpisOutputSchema` — is what gets
 * registered as the tool's `outputSchema`. It describes the invariant
 * frame (`contract`, `version`, `view`, `detail`, `status`, `generatedAt`,
 * `summary`, `metrics[]`, `bytes`, `truncated`, plus optional
 * `detailUri`/`nextCursor`) in full, and accepts every voluminous
 * per-view section (`snapshot`, `history`, `breakdowns`, `issues`,
 * `findings`, `activation`, `window`, `dimensions`, `filter`, `sources`,
 * `privacy`, `recommendations`, `originalBytes`) as opaque `z.unknown()`
 * rather than re-describing their shape at discovery time.
 *
 * HARD CONSTRAINT: this schema MUST accept every payload
 * `ProjectKpisOutputSchema` accepts — MCP clients validate
 * `structuredContent` against whichever `outputSchema` the tool
 * advertised, so an envelope that is any stricter than the real contract
 * would reject genuine responses. `output-schema-size.spec.ts` and the
 * round-trip test in `project-kpis.tool.spec.ts` both assert this by
 * parsing the same real payload against both schemas. The full typed
 * contract (`ProjectKpisOutputSchema`) is unchanged and stays the asset
 * — only what gets described at discovery time shrinks.
 */
export const ProjectKpisEnvelopeSchema = z
	.object({
		contract: z.literal('project-kpis.view'),
		version: z.literal(1),
		view: z.enum(PROJECT_KPI_VIEWS),
		detail: z.enum(KPI_DETAIL_LEVELS),
		status: z.enum(KPI_VIEW_STATUSES),
		generatedAt: z.string(),
		summary: z.string(),
		metrics: z.array(ProjectKpisDisplayMetricSchema),
		bytes: z.number().int().positive(),
		truncated: z.boolean(),
		detailUri: z.string().optional(),
		nextCursor: z.string().optional(),
		window: z
			.unknown()
			.optional()
			.describe(
				'Full shape: ProjectKpisOutputSchema.window (project-kpis.view contract).',
			),
		dimensions: z
			.unknown()
			.optional()
			.describe(
				'Full shape: ProjectKpisOutputSchema.dimensions (project-kpis.view contract).',
			),
		filter: z
			.unknown()
			.optional()
			.describe(
				'Full shape: ProjectKpisOutputSchema.filter (project-kpis.view contract).',
			),
		sources: z
			.unknown()
			.optional()
			.describe(
				'Full shape: ProjectKpisOutputSchema.sources (project-kpis.view contract).',
			),
		privacy: z
			.unknown()
			.optional()
			.describe(
				'Full shape: ProjectKpisOutputSchema.privacy (project-kpis.view contract).',
			),
		recommendations: z
			.unknown()
			.optional()
			.describe(
				'Full shape: ProjectKpisOutputSchema.recommendations (project-kpis.view contract).',
			),
		snapshot: z
			.unknown()
			.optional()
			.describe(
				'Voluminous per-view section; full shape: ProjectKpisOutputSchema.snapshot (project-kpis.view contract).',
			),
		history: z
			.unknown()
			.optional()
			.describe(
				'Voluminous per-view section; full shape: ProjectKpisOutputSchema.history (project-kpis.view contract).',
			),
		breakdowns: z
			.unknown()
			.optional()
			.describe(
				'Voluminous per-view section; full shape: ProjectKpisOutputSchema.breakdowns (project-kpis.view contract).',
			),
		issues: z
			.unknown()
			.optional()
			.describe(
				'Voluminous per-view section; full shape: ProjectKpisOutputSchema.issues (project-kpis.view contract).',
			),
		findings: z
			.unknown()
			.optional()
			.describe(
				'Voluminous per-view section; full shape: ProjectKpisOutputSchema.findings (project-kpis.view contract).',
			),
		activation: z
			.unknown()
			.optional()
			.describe(
				'Voluminous per-view section; full shape: ProjectKpisOutputSchema.activation (project-kpis.view contract).',
			),
		originalBytes: z
			.unknown()
			.optional()
			.describe(
				'Full shape: ProjectKpisOutputSchema.originalBytes (project-kpis.view contract).',
			),
	})
	.strict();

export type IProjectKpisEnvelope = z.infer<typeof ProjectKpisEnvelopeSchema>;
