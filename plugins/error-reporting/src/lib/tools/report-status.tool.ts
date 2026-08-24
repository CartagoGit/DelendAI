import {
	toolJsonBounded,
	type IToolRegistration,
} from '@mcp-vertex/core/public';
import z from 'zod';

import { DEFAULT_TARGET_REPO } from '../contracts/constants/options.constant';
import { SAFE_REPORTER_FAILURE_CODES } from '../contracts/constants/safe-reporter-failure-codes.constant';
import {
	ISSUE_CLASSIFICATIONS,
	type IssueClassification,
} from '../contracts/interfaces/reporter.interface';
import type {
	IReportStatusOutput,
	IReportStatusToolOptions,
} from '../contracts/interfaces/report-status.interface';

const ReportStatusInputSchema = z.object({}).strict();

/** Cap on how many recent records `report_status` surfaces. */
const MAX_RECENT_REPORTS = 20;

const SAFE_DTO_FIELDS = [
	'reporterVersion',
	'mcpVertexVersion',
	'packageId',
	'toolId',
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
	'toolId',
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

const ReportStatusOutputSchema = z
	.object({
		enabled: z.boolean(),
		labels: z.array(z.string()),
		destination: z
			.object({
				targetRepo: z.string(),
				source: z.enum(['default', 'operator-configured']),
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
		disableConfig: z.literal(
			'plugins.error-reporting.options.enabled = false',
		),
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
					issueNumber: z.number().optional(),
					issueUrl: z.string().optional(),
				})
				.strict(),
		),
	})
	.strict();

const targetRepoSourceOf = (
	targetRepo: string,
): 'default' | 'operator-configured' =>
	targetRepo === DEFAULT_TARGET_REPO ? 'default' : 'operator-configured';

const sortIsoDesc = (left?: string, right?: string): number =>
	(right ?? '').localeCompare(left ?? '');

const buildOutput = (
	recentReports: readonly {
		readonly fingerprint: string;
		readonly classification: IssueClassification;
		readonly attemptCount: number;
		readonly lastAttemptAt?: string;
		readonly lastSuccessAt?: string;
		readonly lastFailureCode?:
			| (typeof SAFE_REPORTER_FAILURE_CODES)[number]
			| undefined;
		readonly issueNumber?: number;
		readonly issueUrl?: string;
	}[],
	options: IReportStatusToolOptions['options'],
): IReportStatusOutput => ({
	enabled: options.enabled,
	labels: [...options.labels],
	destination: {
		targetRepo: options.targetRepo,
		source: targetRepoSourceOf(options.targetRepo),
		allowlistedRepos: [options.targetRepo],
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
	disableConfig: 'plugins.error-reporting.options.enabled = false',
	recentReports,
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
				outputSchema: ReportStatusOutputSchema,
			},
			async () => {
				const recentReports = await options.store.all();
				return toolJsonBounded(
					ReportStatusOutputSchema.parse(
						buildOutput(
							recentReports
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
									...(record.issueNumber !== undefined
										? { issueNumber: record.issueNumber }
										: {}),
									...(record.issueUrl !== undefined
										? { issueUrl: record.issueUrl }
										: {}),
								})),
							options.options,
						),
					),
				);
			},
		);
	},
});
