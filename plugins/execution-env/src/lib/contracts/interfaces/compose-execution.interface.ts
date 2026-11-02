import type { IEnvRedactionPolicy } from './env-redaction.interface';
import type { IProcessRunner } from './process-runner.interface';

/** How a compose service is used as an execution environment. */
export interface IComposeExecutionOptions {
	/** Directory the compose file is contained to and commands start in. */
	readonly workspaceRoot: string;
	/** Compose file path, relative to the workspace root. */
	readonly composeFile: string;
	readonly service: string;
	readonly projectName?: string;
	readonly user?: string;
	readonly workdir?: string;
	/** Host variables forwarded by name; their values never appear here. */
	readonly passEnv?: readonly string[];
	/** Start the services this one depends on. Off by default. */
	readonly withDependencies?: boolean;
	/** The service must declare limits at or below these. */
	readonly requireLimits?: {
		readonly memoryBytes?: number;
		readonly cpus?: number;
	};
	readonly dryRun?: boolean;
	readonly runner?: IProcessRunner;
	readonly redaction?: IEnvRedactionPolicy;
}
