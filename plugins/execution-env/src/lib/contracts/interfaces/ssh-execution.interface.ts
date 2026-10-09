import type { IEnvRedactionPolicy } from './env-redaction.interface';
import type { IProcessRunner } from './process-runner.interface';

/** How the remote side parses and quotes the command it is given. */
export type ISshRemoteDialect = 'posix' | 'powershell';

/** A host to hop through, connected to with `-J`. */
export interface ISshJumpHost {
	readonly host: string;
	readonly user?: string;
	readonly port?: number;
}

/** How a remote host is reached; every default is the safe one. */
export interface ISshExecutionOptions {
	readonly host: string;
	readonly user?: string;
	readonly port?: number;
	readonly identityFile?: string;
	/** Use keys held by a running ssh-agent. Defaults to true. */
	readonly useAgent?: boolean;
	/** Hop through a jump host. */
	readonly jumpHost?: ISshJumpHost;
	/** An argument vector run to reach the host; `%h` and `%p` are expanded by ssh. */
	readonly proxyCommand?: readonly string[];
	/** Hand the local agent to the remote side. Off unless set. */
	readonly forwardAgent?: boolean;
	/** Defaults to `yes`: an unknown host key is a refusal, not a prompt. */
	readonly strictHostKeyChecking?: 'yes' | 'accept-new';
	readonly knownHostsFile?: string;
	readonly keepAliveIntervalSec?: number;
	readonly keepAliveCountMax?: number;
	/** Defaults to `posix`. */
	readonly remoteDialect?: ISshRemoteDialect;
	readonly dryRun?: boolean;
	readonly runner?: IProcessRunner;
	readonly redaction?: IEnvRedactionPolicy;
}
