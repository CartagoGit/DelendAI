import type { IEnvRedactionPolicy } from './env-redaction.interface';
import type { IProcessRunner } from './process-runner.interface';

/** What the local adapter is built from. */
export interface ILocalExecutionOptions {
	/** Directory commands start in and files are contained to. */
	readonly workspaceRoot: string;
	readonly dryRun?: boolean;
	readonly runner?: IProcessRunner;
	/** The environment commands inherit; defaults to `process.env`. */
	readonly baseEnv?: Readonly<Record<string, string | undefined>>;
	readonly redaction?: IEnvRedactionPolicy;
}
