import {
	toolJsonBounded,
	compactOutputSchema,
	type IToolRegistration,
} from '@delendai/core/public';
import z from 'zod';

import {
	buildLogFindingReport,
	diagnoseServerLog,
} from '../intake/log-diagnosis.helper';
import { readServerLogText } from '../intake/server-log-reader.helper';
import {
	validateSafeReport,
	validateSerializedSafeReport,
} from '../privacy-validator.helper';
import { LOG_DIAGNOSIS_CAUSES } from '../contracts/interfaces/log-intake.interface';
import type {
	IDiagnoseLogToolOptions,
	ILogDiagnosis,
	ILogFinding,
} from '../contracts/interfaces/log-intake.interface';

import type { IDiagnoseLogIssueOutcome } from '../contracts/interfaces/diagnose-log.interface';

export type { IDiagnoseLogIssueOutcome } from '../contracts/interfaces/diagnose-log.interface';

/**
 * diagnose-log.tool.ts — q00014 S3.
 *
 * `error_reporting_diagnose_log`: paste a host's MCP server log, get
 * back what is actually wrong with it and what to do about it.
 *
 * Two properties define this tool.
 *
 * **It reads freely and reports only on request.** Diagnosing is
 * read-only and local, so it needs no permission. Opening an issue
 * sends something to a public repository, so it happens only when the
 * call carries an explicit confirmation naming the finding — never as a
 * side effect of asking what the log says, and never for "all findings".
 *
 * **The outgoing DTO is built from the classification, never from the
 * log.** A log line routinely contains absolute paths, branch names and
 * source fragments; the user's binding constraint is that a report
 * carries bug information and nothing about their code. `buildLogFinding
 * Report` therefore constructs the DTO out of a fixed remediation table
 * plus counts and digests, and this tool still runs both privacy
 * validators over the result and the serialised body before anything
 * leaves. A validator rejection is a refusal to submit, not a warning.
 */

/** Cap on pasted log size accepted in one call — roughly 4 MB of text. */
const MAX_LOG_CHARS = 4_000_000;

const ConfirmSchema = z
	.object({
		/** Must be literally true. An absent or false value never submits. */
		confirm: z.literal(true),
		/** The `shapeId` of the one finding to report. */
		shapeId: z.string().min(1),
	})
	.strict();

const DiagnoseLogInputSchema = z
	.object({
		logText: z
			.string()
			.min(1)
			.max(MAX_LOG_CHARS)
			.describe(
				'Raw server-log text as the host wrote it, prefixes included.',
			),
		windowSeconds: z.number().int().positive().optional(),
		stormThreshold: z.number().int().positive().optional(),
		floodThreshold: z.number().int().positive().optional(),
		openIssue: ConfirmSchema.optional().describe(
			'Omit to diagnose only. Present with confirm:true opens ONE issue for the named finding.',
		),
	})
	.strict();

const FindingSchema = z
	.object({
		cause: z.enum(LOG_DIAGNOSIS_CAUSES),
		confidence: z.enum(['high', 'medium', 'low']),
		occurrences: z.number(),
		shapeId: z.string(),
		code: z.string().optional(),
		trigger: z.string().optional(),
		windowSeconds: z.number().optional(),
		firstSeenAt: z.string().optional(),
		lastSeenAt: z.string().optional(),
		probableCause: z.string(),
		nextAction: z.string(),
		suspectModule: z.string().optional(),
	})
	.strict();

/**
 * Internal only — validates the handler's own output before returning
 * it. The declared wire `outputSchema` stays `compactOutputSchema()` so
 * `tools/list` does not pay to describe a shape the model needs only
 * after calling.
 */
const DiagnoseLogInternalSchema = z
	.object({
		linesRead: z.number(),
		linesSkipped: z.number(),
		truncated: z.boolean(),
		findings: z.array(FindingSchema),
		issue: z
			.object({
				attempted: z.boolean(),
				submitted: z.boolean(),
				shapeId: z.string(),
				title: z.string().optional(),
				refusedBecause: z.string().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

/**
 * Run the privacy gate and, only if it passes, hand the report to the
 * injected submitter. Exported so the boundary is testable without MCP
 * wiring — the test that proves no project data escapes calls this.
 */
export const submitLogFinding = async (input: {
	readonly finding: ILogFinding;
	readonly options: IDiagnoseLogToolOptions;
}): Promise<IDiagnoseLogIssueOutcome> => {
	const { finding, options } = input;
	const built = buildLogFindingReport({
		finding,
		mcpVertexVersion: options.mcpVertexVersion,
		reporterVersion: options.reporterVersion,
	});

	const dtoCheck = validateSafeReport(built.report);
	if (!dtoCheck.ok) {
		return {
			attempted: true,
			submitted: false,
			shapeId: finding.shapeId,
			refusedBecause: `privacy:${dtoCheck.reasonCode}`,
		};
	}
	// The issue body is a second surface with its own way out: validate
	// the serialised text too, not just the structured DTO.
	const bodyCheck = validateSerializedSafeReport(built.body);
	if (!bodyCheck.ok) {
		return {
			attempted: true,
			submitted: false,
			shapeId: finding.shapeId,
			refusedBecause: `privacy-body:${bodyCheck.reasonCode}`,
		};
	}
	if (options.submit === undefined) {
		return {
			attempted: true,
			submitted: false,
			shapeId: finding.shapeId,
			title: built.title,
			refusedBecause: 'no-submitter-configured',
		};
	}
	const outcome = await options.submit(built);
	return {
		attempted: true,
		submitted: outcome.ok,
		shapeId: finding.shapeId,
		title: built.title,
		...(outcome.ok ? {} : { refusedBecause: 'submit-failed' }),
	};
};

const findingOf = (
	diagnosis: ILogDiagnosis,
	shapeId: string,
): ILogFinding | undefined =>
	diagnosis.findings.find((finding) => finding.shapeId === shapeId);

/**
 * Diagnose a pasted MCP server log: repeated refusals, protocol
 * corruption on stdout, plugin load failures, push retry loops and
 * single-shape log floods, each with a probable cause and a next action.
 */
export const buildDiagnoseLogRegistration = (
	options: IDiagnoseLogToolOptions,
): IToolRegistration => ({
	id: 'diagnose_log',
	tags: ['error-reporting', 'diagnostics', 'logs'],
	summary:
		'Diagnose a pasted MCP server log: probable cause and next action per pattern.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_diagnose_log`,
			{
				description:
					"Parse a host's MCP server stderr log and diagnose it: refusal storms, JSON-RPC corruption caused by writes to stdout, plugin load failures, push retry loops, and floods of one repeated line. Read-only unless the call carries openIssue.confirm=true naming a single finding, in which case one GitHub issue is opened from the classification only — no log text, paths or source ever leave.",
				inputSchema: DiagnoseLogInputSchema,
				outputSchema: compactOutputSchema(),
			},
			async (args) => {
				const read = await readServerLogText(args.logText);
				const diagnosis = diagnoseServerLog(read, {
					...(args.windowSeconds !== undefined
						? { windowSeconds: args.windowSeconds }
						: {}),
					...(args.stormThreshold !== undefined
						? { stormThreshold: args.stormThreshold }
						: {}),
					...(args.floodThreshold !== undefined
						? { floodThreshold: args.floodThreshold }
						: {}),
				});

				let issue: IDiagnoseLogIssueOutcome | undefined;
				if (args.openIssue !== undefined) {
					const target = findingOf(diagnosis, args.openIssue.shapeId);
					issue =
						target === undefined
							? {
									attempted: false,
									submitted: false,
									shapeId: args.openIssue.shapeId,
									refusedBecause: 'unknown-finding',
								}
							: await submitLogFinding({
									finding: target,
									options,
								});
				}

				return toolJsonBounded(
					DiagnoseLogInternalSchema.parse({
						linesRead: diagnosis.linesRead,
						linesSkipped: diagnosis.linesSkipped,
						truncated: diagnosis.truncated,
						findings: diagnosis.findings,
						...(issue !== undefined ? { issue } : {}),
					}),
				);
			},
		);
	},
});
