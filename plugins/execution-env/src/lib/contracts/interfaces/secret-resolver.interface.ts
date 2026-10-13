/** A secret taken from a variable of the host process. */
export interface ISecretEnvReference {
	readonly kind: 'env';
	/** Name the command sees the secret under. */
	readonly name: string;
	/** Host variable to read; defaults to `name`. */
	readonly from?: string;
}

/** A secret taken from the content of a file on the host. */
export interface ISecretFileReference {
	readonly kind: 'file';
	readonly name: string;
	readonly path: string;
}

/** Hand the host's ssh-agent socket to the environment. */
export interface ISecretAgentReference {
	readonly kind: 'ssh-agent-forward';
}

/** Where a secret comes from; the value is never part of the reference. */
export type ISecretReference =
	| ISecretEnvReference
	| ISecretFileReference
	| ISecretAgentReference;

/** What the resolver reads from; injected so specs need no real host. */
export interface ISecretSources {
	readonly env: Readonly<Record<string, string | undefined>>;
	readFile(path: string): Promise<string>;
}

/** Resolved secrets, held in memory only. */
export interface IResolvedSecrets {
	/** Variable name to value, for the environment the command runs in. */
	readonly values: Readonly<Record<string, string>>;
	/** Path of the agent socket when agent forwarding was requested. */
	readonly agentSocket?: string;
	/** Names that were resolved, safe to log. */
	readonly names: readonly string[];
	/** Replace every resolved value found in `text` with the placeholder. */
	redact(text: string): string;
}
