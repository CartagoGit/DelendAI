import type { ISafeMcpVertexReport } from './reporter.interface';

/**
 * The closed set of shapes the server-log reader recognises.
 *
 * Deliberately small. Every kind here corresponds to a class of bug
 * that reading a host's MCP log has actually surfaced in this repo
 * (2026-09-02 / 2026-09-03): a push retried forever, `console.*`
 * corrupting the JSON-RPC channel, a plugin that never registered,
 * a refusal repeating once per slice event. Anything that does not
 * match one of these is *skipped*, never guessed at — an unknown
 * line is not evidence.
 *
 * `event-repetition` is the escape hatch: a line that carries no
 * recognised marker but repeats far more often than any healthy log
 * line should is itself a finding, and its shape digest is enough to
 * say so without quoting the line.
 */
export const SERVER_LOG_EVENT_KINDS = [
	'refusal',
	'protocol-corruption',
	'plugin-load-failure',
	'push-failure',
	'pathspec-failure',
	'event-repetition',
] as const;

export type IServerLogEventKind = (typeof SERVER_LOG_EVENT_KINDS)[number];

/**
 * One recognised line, reduced to its classification.
 *
 * `shapeId` is a digest of the line with its variable parts masked, so
 * two occurrences of the same log line collapse to the same id while
 * the line's own bytes are never carried. It is the only identity the
 * outgoing DTO is allowed to use.
 *
 * `detail` is a short, already-masked excerpt kept **for the local
 * answer only** — it helps a human or an agent recognise the line in
 * their own log. It is never copied into a report DTO; see
 * `buildLogFindingReport` in `log-diagnosis.ts`.
 */
export interface IServerLogEvent {
	readonly kind: IServerLogEventKind;
	readonly lineNumber: number;
	readonly atMs?: number | undefined;
	readonly level?: string | undefined;
	readonly code?: string | undefined;
	readonly trigger?: string | undefined;
	readonly shapeId: string;
	readonly detail?: string | undefined;
}

/** How often one masked line shape occurred across the whole read. */
export interface IServerLogShapeCount {
	readonly shapeId: string;
	readonly count: number;
	readonly firstLineNumber: number;
	readonly kind?: IServerLogEventKind | undefined;
}

export interface IServerLogReadResult {
	readonly events: readonly IServerLogEvent[];
	readonly shapes: readonly IServerLogShapeCount[];
	readonly linesRead: number;
	readonly linesSkipped: number;
	/** True when the reader stopped early on its own bounds. */
	readonly truncated: boolean;
}

export interface IServerLogReaderOptions {
	/** Hard cap on lines consumed. Default 200_000. */
	readonly maxLines?: number | undefined;
	/** Hard cap on retained classified events. Default 5_000. */
	readonly maxEvents?: number | undefined;
	/** Hard cap on distinct tracked line shapes. Default 2_000. */
	readonly maxShapes?: number | undefined;
	/** Longest line the reader will look at, in characters. Default 8_192. */
	readonly maxLineLength?: number | undefined;
}

/**
 * The closed set of conclusions the diagnoser can reach. Each one maps
 * to a fixed remediation entry — probable cause and next action are
 * looked up from a table keyed by this value, never assembled from the
 * log text.
 */
export const LOG_DIAGNOSIS_CAUSES = [
	'push-retry-loop',
	'stdout-protocol-corruption',
	'pathspec-mismatch',
	'refusal-storm',
	'plugin-load-failure',
	'log-flood',
] as const;

export type ILogDiagnosisCause = (typeof LOG_DIAGNOSIS_CAUSES)[number];

export type ILogDiagnosisConfidence = 'high' | 'medium' | 'low';

/** Fixed remediation copy for one cause. Pure data, no log input. */
export interface ILogRemediation {
	readonly probableCause: string;
	readonly nextAction: string;
	/** `@delendai/…`-rooted module most likely responsible, if known. */
	readonly suspectModule?: string | undefined;
}

export interface ILogFinding {
	readonly cause: ILogDiagnosisCause;
	readonly confidence: ILogDiagnosisConfidence;
	readonly occurrences: number;
	readonly shapeId: string;
	readonly code?: string | undefined;
	readonly trigger?: string | undefined;
	readonly windowSeconds?: number | undefined;
	readonly firstSeenAt?: string | undefined;
	readonly lastSeenAt?: string | undefined;
	readonly probableCause: string;
	readonly nextAction: string;
	readonly suspectModule?: string | undefined;
}

export interface ILogDiagnosis {
	readonly findings: readonly ILogFinding[];
	readonly linesRead: number;
	readonly linesSkipped: number;
	readonly truncated: boolean;
}

export interface ILogDiagnosisOptions {
	/** Sliding window handed to the shared storm detector. Default 30s. */
	readonly windowSeconds?: number | undefined;
	/** Repeats within the window before a refusal counts as a storm. Default 5. */
	readonly stormThreshold?: number | undefined;
	/** Repeats of one unclassified shape before it counts as a flood. Default 50. */
	readonly floodThreshold?: number | undefined;
}

/**
 * A finding promoted to an outgoing issue. Carries the safe DTO the
 * privacy validator already governs plus the classification-derived
 * title; there is no channel here for raw log text by construction.
 */
export interface ILogFindingReport {
	readonly report: ISafeMcpVertexReport;
	readonly title: string;
	readonly body: string;
}

export interface IDiagnoseLogToolOptions {
	readonly namespacePrefix: string;
	readonly mcpVertexVersion: string;
	readonly reporterVersion: string;
	/** Injected so the tool can open an issue only when asked to. */
	readonly submit?:
		| ((input: ILogFindingReport) => Promise<{ readonly ok: boolean }>)
		| undefined;
}
