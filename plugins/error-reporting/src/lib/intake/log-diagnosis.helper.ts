import {
	StormDetector,
	inferSuggestedFix,
} from '@delendai/commit-policy/lib/services/storm-detector';
import { createPushCircuit } from '@delendai/commit-policy/lib/services/push-circuit';

import { isMcpVertexErrorCode } from '../contracts/constants/error-codes.constant';
import {
	buildIssueBody,
	buildIssueTitle,
	signatureOf,
} from '../signature.helper';
import type {
	ILogDiagnosis,
	ILogDiagnosisOptions,
	ILogFinding,
	ILogFindingReport,
	ILogRemediation,
	IServerLogEvent,
	IServerLogReadResult,
	ILogDiagnosisCause,
} from '../contracts/interfaces/log-intake.interface';
import type { ISafeMcpVertexReport } from '../contracts/interfaces/reporter.interface';

/**
 * log-diagnosis.ts — q00014 S3.
 *
 * Turn the reader's classified events into a **diagnosis**: a probable
 * cause and the concrete next action, for each pattern the log actually
 * contains.
 *
 * Reuse, not reimplementation. Two components already exist for the two
 * kinds of repetition this has to recognise, and both were written from
 * the same incidents:
 *
 *  - `StormDetector` (commit-policy) counts repeats of a `(trigger,
 *    code)` tuple inside a sliding window. That is the *burst* case —
 *    the 2026-09-03 `WORKSPACE_HAS_NO_FILES` flood, hundreds of lines a
 *    second.
 *  - `createPushCircuit` (commit-policy) counts *consecutive identical*
 *    failures with no window at all. That is the *slow loop* case — the
 *    twelve-hour push retry at one attempt a minute, which no sliding
 *    window would ever call a storm. Its docstring is the description of
 *    that exact bug.
 *
 * Duplicating either would recreate the class of defect that cost this
 * project a day: two copies of one rule, drifting. Both are imported
 * across the plugin boundary through the workspace's
 * `@delendai/<plugin>/lib/*` deep-path alias.
 *
 * Privacy: `probableCause` and `nextAction` are looked up from
 * {@link REMEDIATIONS}, a table keyed by the closed `ILogDiagnosisCause`
 * set. No branch of this module reads a finding's prose out of the log.
 * The only log-derived values that reach a finding are a count, a masked
 * shape digest, a timestamp and a refusal code — and the code is dropped
 * again at the DTO boundary unless it is a known mcp-vertex error code.
 */

const DEFAULT_WINDOW_SECONDS = 30;
const DEFAULT_STORM_THRESHOLD = 5;
/** Repeats of one otherwise-unexplained line shape before it is a flood. */
const DEFAULT_FLOOD_THRESHOLD = 50;

/**
 * Synthetic clock spacing for logs with no host timestamps. One
 * millisecond per line keeps ordering and keeps every line of an
 * untimestamped paste inside any sane window, so the detector degrades
 * to "count of identical refusals" rather than to silence.
 */
const SYNTHETIC_MS_PER_LINE = 1;

/**
 * Fixed remediation copy. This table is the privacy boundary: a finding's
 * prose comes from here and from nowhere else, so no amount of hostile
 * log content can steer what a report says.
 */
const REMEDIATIONS: Readonly<Record<ILogDiagnosisCause, ILogRemediation>> = {
	'push-retry-loop': {
		probableCause:
			'An automatic push is being refused for a reason that cannot change between attempts (a policy, not a race), and the scheduler keeps retrying it. Observed live for twelve hours at one attempt a minute.',
		nextAction:
			'Compare the configured push branch against the branch this repository actually accepts direct pushes to. Either point it at a working branch or relax the discipline, then push once to close the breaker.',
		suspectModule: '@delendai/commit-policy/lib/services/push-scheduler',
	},
	'stdout-protocol-corruption': {
		probableCause:
			'The host could not parse a JSON-RPC frame. In an MCP stdio server stdout IS the protocol channel, so this means runtime code wrote to stdout — typically a stray console.log or console.info.',
		nextAction:
			'Run the no-stdout-in-runtime lint. Move every runtime write to console.warn or console.error (stderr), or to the logs plugin.',
		suspectModule: '@delendai/core/lib/transport',
	},
	'pathspec-mismatch': {
		probableCause:
			'git add was handed a path that no longer existed when it ran — an ephemeral file (a mutex, a lock) present in the dirty set at scope time and gone by staging time. One such path fails the whole commit.',
		nextAction:
			'Exclude ephemeral paths from the staged set rather than from the dirty scan, and ignore them. Do not blanket-filter every lock file: the package lockfile must stay committable.',
		suspectModule: '@delendai/commit-policy/lib/services/git-extra',
	},
	'refusal-storm': {
		probableCause:
			'One refusal code is repeating many times inside a short window. A refusal that repeats identically is a procedure defect, not a transient failure — nothing was learned after the first occurrence.',
		nextAction:
			'Read the repeating code through the commit-policy storms tool for its per-storm repair recipe, then fix the producer rather than silencing the line.',
	},
	'plugin-load-failure': {
		probableCause:
			'A plugin failed during load, register or context build. Its tools are absent from the surface for the whole session, which usually presents to an agent as a missing tool rather than as an error.',
		nextAction:
			'Run the doctor command and read its plugin-failure section. A managed-lazy surface silently demotes to eager when one plugin is unindexed, so check the preset-drift gate too.',
		suspectModule: '@delendai/core/lib/plugins/load-plugins',
	},
	'log-flood': {
		probableCause:
			'A single line shape dominates the log. Past cause: the event id written on each line was the entire serialised event, emitted twice per slice, so a slice declaring twenty files produced kilobytes of stderr per attempt.',
		nextAction:
			'Find the writer of the repeating shape and give it a short stable digest instead of the full payload, or demote it to console.debug behind a debug flag.',
	},
};

const CONFIDENCE_BY_CAUSE: Readonly<
	Record<ILogDiagnosisCause, ILogFinding['confidence']>
> = {
	'push-retry-loop': 'high',
	'stdout-protocol-corruption': 'high',
	'pathspec-mismatch': 'high',
	'refusal-storm': 'high',
	'plugin-load-failure': 'medium',
	'log-flood': 'medium',
};

const timestampOf = (event: IServerLogEvent): number =>
	event.atMs ?? event.lineNumber * SYNTHETIC_MS_PER_LINE;

/** ISO only for real host timestamps; a synthetic clock is not a time. */
const isoOf = (event: IServerLogEvent | undefined): string | undefined =>
	event?.atMs === undefined ? undefined : new Date(event.atMs).toISOString();

const buildFinding = (input: {
	readonly cause: ILogDiagnosisCause;
	readonly occurrences: number;
	readonly shapeId: string;
	readonly code?: string | undefined;
	readonly trigger?: string | undefined;
	readonly windowSeconds?: number | undefined;
	readonly first?: IServerLogEvent | undefined;
	readonly last?: IServerLogEvent | undefined;
	readonly extraAction?: string | undefined;
}): ILogFinding => {
	const remediation = REMEDIATIONS[input.cause];
	const firstSeenAt = isoOf(input.first);
	const lastSeenAt = isoOf(input.last);
	return {
		cause: input.cause,
		confidence: CONFIDENCE_BY_CAUSE[input.cause],
		occurrences: input.occurrences,
		shapeId: input.shapeId,
		...(input.code !== undefined ? { code: input.code } : {}),
		...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
		...(input.windowSeconds !== undefined
			? { windowSeconds: input.windowSeconds }
			: {}),
		...(firstSeenAt !== undefined ? { firstSeenAt } : {}),
		...(lastSeenAt !== undefined ? { lastSeenAt } : {}),
		probableCause: remediation.probableCause,
		nextAction:
			input.extraAction === undefined
				? remediation.nextAction
				: `${remediation.nextAction} ${input.extraAction}`,
		...(remediation.suspectModule !== undefined
			? { suspectModule: remediation.suspectModule }
			: {}),
	};
};

const eventsOfKind = (
	events: readonly IServerLogEvent[],
	kind: IServerLogEvent['kind'],
): readonly IServerLogEvent[] => events.filter((event) => event.kind === kind);

/** Group by masked shape so "identical" means identical line, not similar. */
const groupByShape = (
	events: readonly IServerLogEvent[],
): ReadonlyMap<string, readonly IServerLogEvent[]> => {
	const groups = new Map<string, IServerLogEvent[]>();
	for (const event of events) {
		const bucket = groups.get(event.shapeId);
		if (bucket === undefined) groups.set(event.shapeId, [event]);
		else bucket.push(event);
	}
	return groups;
};

/** A single occurrence of a fatal-by-itself kind is already a finding. */
const singleOccurrenceFindings = (
	events: readonly IServerLogEvent[],
	kind: IServerLogEvent['kind'],
	cause: ILogDiagnosisCause,
): readonly ILogFinding[] =>
	[...groupByShape(eventsOfKind(events, kind))].map(([shapeId, group]) =>
		buildFinding({
			cause,
			occurrences: group.length,
			shapeId,
			first: group[0],
			last: group[group.length - 1],
		}),
	);

/**
 * The slow loop. `createPushCircuit` opens on consecutive *identical*
 * failures with no time window, which is what separates a policy refusal
 * from a race. Feeding one group of same-shape push failures through a
 * fresh breaker reproduces exactly the decision the live scheduler makes,
 * so the log diagnosis and the running server cannot disagree.
 *
 * Only an opened breaker becomes a finding. One or two failed pushes are
 * a normal bad afternoon; the bug is the retrying.
 */
const pushLoopFindings = (
	events: readonly IServerLogEvent[],
): readonly ILogFinding[] => {
	const findings: ILogFinding[] = [];
	for (const [shapeId, group] of groupByShape(
		eventsOfKind(events, 'push-failure'),
	)) {
		const circuit = createPushCircuit();
		let opened = false;
		for (const _occurrence of group) {
			// The shape digest IS the refusal's identity: two attempts
			// that mask to the same shape failed for the same
			// unchangeable reason.
			if (circuit.record({ ok: false, refusal: shapeId }).open) {
				opened = true;
			}
		}
		if (!opened) continue;
		findings.push(
			buildFinding({
				cause: 'push-retry-loop',
				occurrences: group.length,
				shapeId,
				first: group[0],
				last: group[group.length - 1],
			}),
		);
	}
	return findings;
};

/**
 * The burst. Delegates entirely to `StormDetector`: same window, same
 * threshold, same `(trigger, code)` key as the live engine, so a storm
 * diagnosed from a log and a storm diagnosed in-process agree.
 */
const refusalStormFindings = (
	events: readonly IServerLogEvent[],
	options: ILogDiagnosisOptions,
): readonly ILogFinding[] => {
	const refusals = eventsOfKind(events, 'refusal');
	if (refusals.length === 0) return [];

	const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
	const threshold = options.stormThreshold ?? DEFAULT_STORM_THRESHOLD;
	const detector = new StormDetector({ windowSeconds, threshold });
	const firstByKey = new Map<string, IServerLogEvent>();
	const lastByKey = new Map<string, IServerLogEvent>();
	const shapeByKey = new Map<string, string>();

	let lastTimestamp = 0;
	for (const event of refusals) {
		const code = event.code ?? 'UNKNOWN';
		const trigger = event.trigger ?? 'unknown';
		const timestamp = timestampOf(event);
		lastTimestamp = Math.max(lastTimestamp, timestamp);
		detector.observe({ timestamp, code, trigger });
		const key = `${trigger} ${code}`;
		if (!firstByKey.has(key)) firstByKey.set(key, event);
		lastByKey.set(key, event);
		shapeByKey.set(key, event.shapeId);
	}

	return detector
		.snapshot(lastTimestamp)
		.storms.filter((storm) => storm.exceedsThreshold)
		.map((storm) => {
			const key = `${storm.trigger} ${storm.code}`;
			const suggested = inferSuggestedFix(storm.code);
			return buildFinding({
				cause: 'refusal-storm',
				occurrences: storm.count,
				shapeId: shapeByKey.get(key) ?? '',
				code: storm.code,
				trigger: storm.trigger,
				windowSeconds: storm.windowSeconds,
				first: firstByKey.get(key),
				last: lastByKey.get(key),
				...(suggested !== undefined ? { extraAction: suggested } : {}),
			});
		});
};

/**
 * Any line shape — recognised or not — that repeats past the flood
 * threshold and is not already explained by another finding. This is the
 * catch-all that would have caught the serialised-event-id flood, which
 * matched none of the marker patterns and was still the worst thing in
 * the log.
 */
const floodFindings = (
	read: IServerLogReadResult,
	options: ILogDiagnosisOptions,
	explainedShapes: ReadonlySet<string>,
): readonly ILogFinding[] => {
	const threshold = options.floodThreshold ?? DEFAULT_FLOOD_THRESHOLD;
	return read.shapes
		.filter(
			(shape) =>
				shape.count >= threshold && !explainedShapes.has(shape.shapeId),
		)
		.map((shape) =>
			buildFinding({
				cause: 'log-flood',
				occurrences: shape.count,
				shapeId: shape.shapeId,
			}),
		);
};

/**
 * Order findings by how badly each breaks the session. A corrupted
 * protocol channel makes every other symptom untrustworthy, so it is
 * always first.
 */
const CAUSE_ORDER: readonly ILogDiagnosisCause[] = [
	'stdout-protocol-corruption',
	'push-retry-loop',
	'pathspec-mismatch',
	'plugin-load-failure',
	'refusal-storm',
	'log-flood',
];

/** Diagnose a read log. Pure: same input, same findings, no I/O. */
export const diagnoseServerLog = (
	read: IServerLogReadResult,
	options: ILogDiagnosisOptions = {},
): ILogDiagnosis => {
	const findings: ILogFinding[] = [
		...singleOccurrenceFindings(
			read.events,
			'protocol-corruption',
			'stdout-protocol-corruption',
		),
		...pushLoopFindings(read.events),
		...singleOccurrenceFindings(
			read.events,
			'pathspec-failure',
			'pathspec-mismatch',
		),
		...singleOccurrenceFindings(
			read.events,
			'plugin-load-failure',
			'plugin-load-failure',
		),
		...refusalStormFindings(read.events, options),
	];

	const explained = new Set(findings.map((finding) => finding.shapeId));
	findings.push(...floodFindings(read, options, explained));

	findings.sort((left, right) => {
		const byCause =
			CAUSE_ORDER.indexOf(left.cause) - CAUSE_ORDER.indexOf(right.cause);
		return byCause === 0 ? right.occurrences - left.occurrences : byCause;
	});

	return {
		findings,
		linesRead: read.linesRead,
		linesSkipped: read.linesSkipped,
		truncated: read.truncated,
	};
};

/** Package a finding attributes to, when it names a suspect module. */
const packageIdOf = (finding: ILogFinding): string => {
	const suspect = finding.suspectModule;
	if (suspect === undefined) return '@delendai/error-reporting';
	const segments = suspect.split('/');
	const scope = segments[0];
	const name = segments[1];
	return scope !== undefined && name !== undefined
		? `${scope}/${name}`
		: '@delendai/error-reporting';
};

/**
 * Build the outgoing artefacts for one finding.
 *
 * Constructed from the classification, never from the log. Every field
 * is either a constant of this module, a value from
 * {@link REMEDIATIONS}, a count, a masked shape digest, or a refusal
 * code that survived `isMcpVertexErrorCode` — a closed set. There is no
 * code path here that can copy a log line, a project path or a source
 * fragment into the DTO, which is why the privacy validator has nothing
 * left to catch by the time it runs. It still runs; see the tool.
 */
export const buildLogFindingReport = (input: {
	readonly finding: ILogFinding;
	readonly mcpVertexVersion: string;
	readonly reporterVersion: string;
}): ILogFindingReport => {
	const { finding } = input;
	const packageId = packageIdOf(finding);
	const frameFile = finding.suspectModule ?? '@delendai/error-reporting';
	const errorCode =
		finding.code !== undefined && isMcpVertexErrorCode(finding.code)
			? finding.code
			: undefined;

	const report: ISafeMcpVertexReport = {
		reporterVersion: input.reporterVersion,
		mcpVertexVersion: input.mcpVertexVersion,
		packageId,
		toolOwner: 'mcp-vertex',
		toolCategory: 'analysis',
		...(errorCode !== undefined ? { errorCode } : {}),
		failureClass: 'UNKNOWN_INTERNAL',
		classification: 'BUG',
		fingerprint: signatureOf({
			mcpVertexVersion: input.mcpVertexVersion,
			packageId,
			componentId: finding.cause,
			...(errorCode !== undefined ? { errorCode } : {}),
			failureClass: 'UNKNOWN_INTERNAL',
			classification: 'BUG',
			mcpFrames: [{ file: frameFile }],
		}),
		mcpFrames: [{ file: frameFile }],
	};

	const body = [
		buildIssueBody(report),
		'',
		'### Server-log diagnosis',
		'',
		`- cause: ${finding.cause}`,
		`- confidence: ${finding.confidence}`,
		`- occurrences: ${finding.occurrences}`,
		`- line shape: ${finding.shapeId}`,
		...(finding.windowSeconds !== undefined
			? [`- window: ${finding.windowSeconds}s`]
			: []),
		'',
		`Probable cause. ${finding.probableCause}`,
		'',
		`Next action. ${finding.nextAction}`,
		'',
		'No log text is included: this report is built from the classification only.',
	].join('\n');

	return { report, title: buildIssueTitle(report), body };
};
