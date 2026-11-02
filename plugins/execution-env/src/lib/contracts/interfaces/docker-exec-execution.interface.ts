import type { IEnvRedactionPolicy } from './env-redaction.interface';
import type { IProcessRunner } from './process-runner.interface';

/** An existing container, such as a compose sidecar, used as an environment. */
export interface IDockerExecOptions {
	/** Container name or id. */
	readonly container: string;
	/** Run commands as this user instead of the container's own. */
	readonly user?: string;
	readonly workdir?: string;
	readonly dryRun?: boolean;
	readonly runner?: IProcessRunner;
	readonly redaction?: IEnvRedactionPolicy;
}
