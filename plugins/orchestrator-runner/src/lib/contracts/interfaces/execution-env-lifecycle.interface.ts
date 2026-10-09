/**
 * The two calls the runner needs from an execution environment. It is
 * declared here, structurally, so the runner does not depend on the
 * package that provides environments: anything with this shape works.
 */
export interface ILifecycleEnvironment {
	readonly id: string;
	prepare(): Promise<{ readonly ok: boolean; readonly reason?: string }>;
	teardown(): Promise<{ readonly ok: boolean; readonly reason?: string }>;
}

/** One line of the slice log about the environment. */
export interface IEnvironmentLogEntry {
	readonly phase: 'prepare' | 'teardown';
	readonly environment: string;
	readonly ok: boolean;
	readonly durationMs: number;
	readonly reason?: string;
}

/** What running a slice inside an environment produced. */
export interface IEnvironmentRunOutcome<T> {
	/** False when `prepare` failed and the slice never started. */
	readonly started: boolean;
	/** The slice's own result; absent when it never started or threw. */
	readonly result?: T;
	/** Why the slice did not complete; absent on success. */
	readonly failure?: string;
	readonly log: readonly IEnvironmentLogEntry[];
}

/** Clock and sink injected so specs control time and capture the log. */
export interface IEnvironmentRunOptions {
	readonly now?: () => number;
	readonly onLog?: (entry: IEnvironmentLogEntry) => void;
}
