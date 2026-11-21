/** Stable, copy-pasteable mode identifiers (use these in config + tests). */
export const COMMIT_AUTHOR_MODES = ['git', 'agent', 'bot', 'named'] as const;

export type CommitAuthorMode = (typeof COMMIT_AUTHOR_MODES)[number];

/**
 * Static, project-agnostic identification of the host/extension and
 * model currently driving the agent. The CLI loader fills these
 * from `delendai.config.json#commitAuthor` plus the MCP
 * `clientInfo` payload; programmatic hosts pass them in directly.
 */
export interface ICommitAuthorIdentity {
	/**
	 * MCP `clientInfo.name` mapped through the usage-tracking
	 * extension table (see `docs/delendai/wiki/08-usage-tracking-plugin.md`).
	 * `vscode-copilot`, `claude-code`, `codex-cli`, `cursor`,
	 * `aider`, `continue`, … Falls back to `'agent'` when unknown.
	 */
	readonly clientName: string;
	/** Model identifier (e.g. `MiniMax-M3`, `claude-opus-4`). */
	readonly modelName: string;
}

/**
 * User-supplied bits for the `named` mode. Empty strings fall back to
 * `identity.clientName` / a derived default so the resolver never has
 * to special-case "missing human" elsewhere.
 */
export interface ICommitAuthorNamed {
	/** Human display name. Falls back to `identity.clientName`. */
	readonly humanName: string;
	/** Human email. Falls back to `<clientName>@local`. */
	readonly humanEmail: string;
}

/**
 * Effective resolution input. Defaults to the union of the three
 * sub-interfaces so callers can pass just the fields they know
 * (tests, for instance, only set `mode` + `identity`).
 */
export interface ICommitAuthorInput {
	/** Which mode to apply. */
	readonly mode: CommitAuthorMode;
	/** Required for `agent`/`bot`/`named`; harmless for `git`. */
	readonly identity: ICommitAuthorIdentity;
	/** Required for `named`; harmless for the other modes. */
	readonly named: ICommitAuthorNamed;
}

/** Outcome of the resolver. */
export interface ICommitAuthorResolution {
	/**
	 * `Name <email>` string suitable for `git commit --author=`. Never
	 * empty: a configured-but-unresolvable `git` mode surfaces as a
	 * reason so the caller can surface a clear error to the user
	 * instead of producing a commit with the OS hostname as author.
	 */
	readonly authorFlag: string;
	/** Human-readable label (for tool output + audit logs). */
	readonly label: string;
	/**
	 * Why no commit was produced. Absent on success — the engine
	 * treats its presence as "refuse + return toolError".
	 */
	readonly reason?: string;
}
