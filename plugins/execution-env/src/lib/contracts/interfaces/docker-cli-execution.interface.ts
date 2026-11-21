import type { IEnvRedactionPolicy } from './env-redaction.interface';
import type { IProcessRunner } from './process-runner.interface';

/** One host path made visible inside the container. */
export interface IDockerMount {
	readonly hostPath: string;
	readonly containerPath: string;
	/** Defaults to true: a mount is read-only unless it says otherwise. */
	readonly readOnly?: boolean;
}

/** How a Docker container is configured; every default is the safe one. */
export interface IDockerCliOptions {
	readonly image: string;
	/** Host paths to mount. Nothing is mounted unless listed here. */
	readonly mounts?: readonly IDockerMount[];
	/** Defaults to `none`. */
	readonly network?: string;
	/** Defaults to `1000:1000`. */
	readonly user?: string;
	/** Directory inside the container commands start in. */
	readonly workdir?: string;
	/** Defaults to `always`: the container is removed at teardown. */
	readonly cleanupOnExit?: 'always' | 'never';
	/** Variables set on the container itself. */
	readonly env?: Readonly<Record<string, string>>;
	/** Defaults to a generated, unique name. */
	readonly containerName?: string;
	/** Required to mount the host's docker socket. */
	readonly allowDockerSocket?: boolean;
	readonly dryRun?: boolean;
	readonly runner?: IProcessRunner;
	readonly redaction?: IEnvRedactionPolicy;
	/** Injected so specs get a stable name. */
	readonly nameSuffix?: () => string;
}
