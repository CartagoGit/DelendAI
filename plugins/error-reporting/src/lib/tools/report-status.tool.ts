import {
	toolJsonBounded,
	compactOutputSchema,
	type IToolRegistration,
} from '@delendai/core/public';
import z from 'zod';

import { DEFAULT_TARGET_REPO } from '../contracts/constants/options.constant';
import { SAFE_REPORTER_FAILURE_CODES } from '../contracts/constants/safe-reporter-failure-codes.constant';
import {
	ISSUE_CLASSIFICATIONS,
	type IssueClassification,
} from '../contracts/interfaces/reporter.interface';
import type {
	IReportStatusHealth,
	IReportStatusOutput,
	IReportStatusToolOptions,
} from '../contracts/interfaces/report-status.interface';
import type { IReportRecord } from '../contracts/interfaces/report-store.interface';
import type { IFunnelCounters } from '../contracts/interfaces/funnel-counters.interface';

const ReportStatusInputSchema = z.object({}).strict();

/** Cap on how many recent records `report_status` surfaces. */
const MAX_RECENT_REPORTS = 20;

const SAFE_DTO_FIELDS = [
	'reporterVersion',
	'mcpVertexVersion',
	'packageId',
	'safeToolId',
	'toolOwner',
	'toolCategory',
	'errorCode',
	'failureClass',
	'classification',
	'fingerprint',
	'mcpFrames',
	'syntheticExample',
	'environmentClass',
] as const;

const ISSUE_BODY_TABLE_FIELDS = [
	'packageId',
	'reporterVersion',
	'mcpVertexVersion',
	'classification',
	'failureClass',
	'fingerprint',
	'safeToolId',
	'toolOwner',
	'toolCategory',
	'errorCode',
	'environmentClass',
] as const;

const ISSUE_BODY_SECTION_FIELDS = [
	'mcpFrames',
	'syntheticExample',
	'safeReportPayloadJson',
	'disableInstructions',
] as const;

const EXCLUDED_HOST_PROJECT_FIELDS = [
	'message',
	'stack',
	'args',
	'result',
	'workspace',
	'cwd',
	'paths',
	'projectRepo',
	'hostRepo',
	'branch',
	'files',
	'env',
	'headers',
	'prompts',
	'urls',
] as const;

const ClassificationSchema = z.enum(ISSUE_CLASSIFICATIONS);

const HealthSchema = z
	.object({
		lastFailureCode: z.enum(SAFE_REPORTER_FAILURE_CODES).optional(),
		consecutiveFailureCount: z.number(),
		circuitOpenUntil: z.string().optional(),
		circuitOpen: z.boolean(),
		lastAttemptAt: z.string().optional(),
		lastAttemptAgeMs: z.number().optional(),
	})
	.strict();

const FunnelSchema = z
	.object({
		observedFailures: z.number(),
		ignoredNonFailures: z.number(),
		notVertexInternal: z.number(),
		privacyBlocked: z.number(),
		deduplicated: z.number(),
		rateLimited: z.number(),
		submissionAttempted: z.number(),
		submissionSucceeded: z.number(),
		submissionFailed: z.number(),
		lastObservedAt: z.string().optional(),
		lastClassifiedAt: z.string().optional(),
		lastSubmittedAt: z.string().optional(),
		lastFailureCode: z.enum(SAFE_REPORTER_FAILURE_CODES).optional(),
		circuitOpenUntil: z.string().optional(),
	})
	.strict();

// Internal only — used to validate the handler's own output before
// returning it (`.parse()` below). NOT the declared wire `outputSchema`;
// v00129 S1 (AUD-B01) replaces that with `compactOutputSchema()` so
// `tools/list` doesn't pay ~3.9 KB to describe a shape the model only
// needs after calling. The real response payload is unchanged.
const ReportStatusInternalSchema = z
	.object({
		enabled: z.boolean(),
		labels: z.array(z.string()),
		destination: z
			.object({
				targetRepo: z.string(),
				source: z.literal('default'),
				allowlistedRepos: z.array(z.string()),
				transport: z.literal('gh issue create'),
				forwardsProjectHeadersOrEnv: z.literal(false),
			})
			.strict(),
		classificationTaxonomy: z.array(ClassificationSchema),
		transmittedFields: z
			.object({
				safeDtoFields: z.array(z.string()),
				issueBodyTableFields: z.array(z.string()),
				issueBodySectionFields: z.array(z.string()),
				excludedHostProjectFields: z.array(z.string()),
			})
			.strict(),
		projectContextSent: z.literal(false),
		privacyStatement: z.string(),
		enableConfig: z.literal(
			'plugins.error-reporting.options.enabled = true',
		),
		health: HealthSchema,
		funnel: FunnelSchema,
		recentReports: z.array(
			z
				.object({
					fingerprint: z.string(),
					classification: ClassificationSchema,
					attemptCount: z.number(),
					lastAttemptAt: z.string().optional(),
					lastSuccessAt: z.string().optional(),
					lastFailureCode: z
						.enum(SAFE_REPORTER_FAILURE_CODES)
						.optional(),
					consecutiveFailureCount: z.number().optional(),
					circuitOpenUntil: z.string().optional(),
					issueNumber: z.number().optional(),
					issueUrl: z.string().optional(),
				})
				.strict(),
		),
	})
	.strict();

const sortIsoDesc = (left?: string, right?: string): number =>
	(right ?? '').localeCompare(left ?? '');

/** Picks the record in the worst observable state: most consecutive
 * failures first, most recently attempted as the tie-break. `undefined`
 * when nothing has ever failed. */
const worstRecordOf = (
	records: readonly IReportRecord[],
): IReportRecord | undefined =>
	records.reduce<IReportRecord | undefined>((worst, record) => {
		if (worst === undefined) return record;
		if (record.consecutiveFailureCount > worst.consecutiveFailureCount) {
			return record;
		}
		if (record.consecutiveFailureCount < worst.consecutiveFailureCount) {
			return worst;
		}
		return (record.lastAttemptAt ?? '') > (worst.lastAttemptAt ?? '')
			? record
			: worst;
	}, undefined);

/**
 * AUD-G01: reduces every fingerprint's dedupe record down to the one
 * glanceable health signal `report_status` answers with no arguments.
 * Pure and exported so the "stale breaker re-evaluates" behavior is
 * directly testable without spinning up the tool's MCP wiring.
 */
export const healthOf = (
	records: readonly IReportRecord[],
	nowMs: number,
): IReportStatusHealth => {
	const worst = worstRecordOf(records);
	const circuitOpenUntilMs =
		worst?.circuitOpenUntil !== undefined
			? Date.parse(worst.circuitOpenUntil)
			: undefined;
	const circuitOpen =
		circuitOpenUntilMs !== undefined &&
		!Number.isNaN(circuitOpenUntilMs) &&
		nowMs < circuitOpenUntilMs;
	const lastAttemptAtMs =
		worst?.lastAttemptAt !== undefined
			? Date.parse(worst.lastAttemptAt)
			: undefined;
	return {
		...(worst?.lastFailureCode !== undefined
			? { lastFailureCode: worst.lastFailureCode }
			: {}),
		consecutiveFailureCount: worst?.consecutiveFailureCount ?? 0,
		...(worst?.circuitOpenUntil !== undefined
			? { circuitOpenUntil: worst.circuitOpenUntil }
			: {}),
		circuitOpen,
		...(worst?.lastAttemptAt !== undefined
			? { lastAttemptAt: worst.lastAttemptAt }
			: {}),
		...(lastAttemptAtMs !== undefined && !Number.isNaN(lastAttemptAtMs)
			? { lastAttemptAgeMs: Math.max(0, nowMs - lastAttemptAtMs) }
			: {}),
	};
};

const buildOutput = (input: {
	readonly recentReports: readonly {
		readonly fingerprint: string;
		readonly classification: IssueClassification;
		readonly attemptCount: number;
		readonly lastAttemptAt?: string;
		readonly lastSuccessAt?: string;
		readonly lastFailureCode?:
			| (typeof SAFE_REPORTER_FAILURE_CODES)[number]
			| undefined;
		readonly consecutiveFailureCount?: number;
		readonly circuitOpenUntil?: string;
		readonly issueNumber?: number;
		readonly issueUrl?: string;
	}[];
	readonly options: IReportStatusToolOptions['options'];
	readonly health: IReportStatusHealth;
	readonly funnel: IFunnelCounters;
}): IReportStatusOutput => ({
	enabled: input.options.enabled,
	labels: [...input.options.labels],
	destination: {
		targetRepo: DEFAULT_TARGET_REPO,
		source: 'default',
		allowlistedRepos: [DEFAULT_TARGET_REPO],
		transport: 'gh issue create',
		forwardsProjectHeadersOrEnv: false,
	},
	classificationTaxonomy: [...ISSUE_CLASSIFICATIONS],
	transmittedFields: {
		safeDtoFields: [...SAFE_DTO_FIELDS],
		issueBodyTableFields: [...ISSUE_BODY_TABLE_FIELDS],
		issueBodySectionFields: [...ISSUE_BODY_SECTION_FIELDS],
		excludedHostProjectFields: [...EXCLUDED_HOST_PROJECT_FIELDS],
	},
	projectContextSent: false,
	privacyStatement:
		'Only the safe ISafeMcpVertexReport DTO and the issue body derived from it are transmitted. No host-project content is sent: no message, stack, args, workspace, paths, repo names, prompts, env, headers or tool outputs.',
	enableConfig: 'plugins.error-reporting.options.enabled = true',
	health: input.health,
	funnel: input.funnel,
	recentReports: input.recentReports,
});

/**
 * Read-only introspection of the auto-reporting state: whether it is
 * on, where it reports to, and the recent de-duplication records.
 * Lets an agent (or a human) confirm the plugin is wired without
 * waiting for a failure to happen.
 */
export const buildReportStatusRegistration = (
	options: IReportStatusToolOptions,
): IToolRegistration => ({
	id: 'report_status',
	tags: ['error-reporting', 'diagnostics'],
	summary:
		'Show the auto error-reporting state (enabled, target repo, recent reports).',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_report_status`,
			{
				description:
					'Read-only transparency report for automatic mcp-vertex error reporting: enablement, fixed allowlisted destination, exact transmitted fields, privacy exclusions, and recent de-duplication records with classification.',
				inputSchema: ReportStatusInputSchema,
				outputSchema: compactOutputSchema(),
			},
			async () => {
				const nowMs = Date.now();
				const records = await options.store.all();
				const funnel = (await options.funnel?.read()) ?? {
					observedFailures: 0,
					ignoredNonFailures: 0,
					notVertexInternal: 0,
					privacyBlocked: 0,
					deduplicated: 0,
					rateLimited: 0,
					submissionAttempted: 0,
					submissionSucceeded: 0,
					submissionFailed: 0,
				};
				return toolJsonBounded(
					ReportStatusInternalSchema.parse(
						buildOutput({
							recentReports: records
								.slice()
								.sort((a, b) =>
									sortIsoDesc(
										a.lastAttemptAt ?? a.lastSuccessAt,
										b.lastAttemptAt ?? b.lastSuccessAt,
									),
								)
								.slice(0, MAX_RECENT_REPORTS)
								.map((record) => ({
									fingerprint: record.fingerprint,
									classification: record.classification,
									attemptCount: record.attemptCount,
									...(record.lastAttemptAt !== undefined
										? {
												lastAttemptAt:
													record.lastAttemptAt,
											}
										: {}),
									...(record.lastSuccessAt !== undefined
										? {
												lastSuccessAt:
													record.lastSuccessAt,
											}
										: {}),
									...(record.lastFailureCode !== undefined
										? {
												lastFailureCode:
													record.lastFailureCode,
											}
										: {}),
									...(record.consecutiveFailureCount > 0
										? {
												consecutiveFailureCount:
													record.consecutiveFailureCount,
											}
										: {}),
									...(record.circuitOpenUntil !== undefined
										? {
												circuitOpenUntil:
													record.circuitOpenUntil,
											}
										: {}),
									...(record.issueNumber !== undefined
										? { issueNumber: record.issueNumber }
										: {}),
									...(record.issueUrl !== undefined
										? { issueUrl: record.issueUrl }
										: {}),
								})),
							options: options.options,
							health: healthOf(records, nowMs),
							funnel,
						}),
					),
				);
			},
		);
	},
});
