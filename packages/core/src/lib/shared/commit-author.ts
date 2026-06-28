/**
 * Commit-author policy — f00082.
 *
 * A single, project-agnostic policy that turns a configured mode into
 * the concrete `git --author="Name <email>"` flag the shared git
 * engine should pass on every commit it produces (see
 * `git-write.ts#commitAndPush`). Lives in `packages/core` because:
 *
 *   - Both `@mcp-vertex/git`'s `git_commit` tool AND
 *     `@mcp-vertex/proposals`' `auto_work` persist step need it; a
 *     copy in either plugin would silently drift.
 *   - The core stays the single place that can be audited for "what
 *     touches the filesystem/git outside a plugin's own sandbox"
 *     (AGENTS.md R1). The author flag is part of that surface.
 *
 * ## Modes
 *
 *   | mode      | author flag                                                |
 *   |-----------|------------------------------------------------------------|
 *   | `git`     | `git config user.name/email` of the repo (DEFAULT)         |
 *   | `agent`   | `<clientName> <clientName@local>` from MCP `clientInfo`    |
 *   | `bot`     | `<clientName>-bot <…-bot@users.noreply.github.com>`        |
 *   | `named`   | `"<humanName> (<modelName>)" <humanEmail>`                 |
 *
 * `git` is the default because most users want the agent's commits
 * to land under their own identity, so the worktree doesn't grow a
 * second author and the user does not have to maintain two
 * `git log --author` filters. `agent` / `bot` keep the commit
 * attributed to the agent (useful for filtering or compliance);
 * `named` keeps the human author visible while annotating the
 * model that wrote the patch (e.g. `Cartago (M3-minimax)`).
 *
 * `none` is intentionally NOT a mode: "respect git config" is what
 * `git` does already (it reads the same source), and a literal
 * `none` would let a runtime `--author=` flag slip past unnoticed.
 */

/** Stable, copy-pasteable mode identifiers (use these in config + tests). */
export const COMMIT_AUTHOR_MODES = ['git', 'agent', 'bot', 'named'] as const;
export type CommitAuthorMode = (typeof COMMIT_AUTHOR_MODES)[number];

/**
 * Static, project-agnostic identification of the host/extension and
 * model currently driving the agent. The CLI loader fills these
 * from `mcp-vertex.config.json#commitAuthor` plus the MCP
 * `clientInfo` payload; programmatic hosts pass them in directly.
 */
export interface ICommitAuthorIdentity {
	/**
	 * MCP `clientInfo.name` mapped through the usage-tracking
	 * extension table (see `docs/mcp-vertex/wiki/08-usage-tracking-plugin.md`).
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

/**
 * Trivial `git config user.name/email` lookup, injectable so the
 * caller can use the shared `IGitRunner` (tests inject a fake).
 *
 * Returns `undefined` for either field when the lookup fails — the
 * resolver treats that as "git user not configured" and surfaces a
 * clear reason instead of guessing.
 */
export interface IGitConfigReader {
	readonly getUserName: () => Promise<string | undefined>;
	readonly getUserEmail: () => Promise<string | undefined>;
}

/**
 * Build a reader around the shared git runner.
 * Runs `git config user.name` and `git config user.email`; either
 * lookup can fail silently (returns `undefined`) so a half-configured
 * git is reported as a reason, not as a phantom commit.
 */
export const createGitConfigReader = (
	run: (args: readonly string[]) => Promise<{
		readonly ok: boolean;
		readonly output: string;
		readonly reason?: string;
	}>,
): IGitConfigReader => ({
	getUserName: async () => {
		const r = await run(['config', 'user.name']);
		return r.ok && r.output.trim().length > 0 ? r.output.trim() : undefined;
	},
	getUserEmail: async () => {
		const r = await run(['config', 'user.email']);
		return r.ok && r.output.trim().length > 0 ? r.output.trim() : undefined;
	},
});

const asEmail = (local: string, domain = 'local'): string =>
	`${local.replace(/[^a-zA-Z0-9._-]/gu, '-')}@${domain}`;

/**
 * Resolve the configured mode into a concrete `--author` flag. Pure:
 * no `process.cwd()`, no filesystem, no `process.env`. Tests pass a
 * mock `IGitConfigReader`; production callers pass the one built
 * from the shared git runner.
 */
export const resolveCommitAuthor = async (
	input: ICommitAuthorInput,
	gitConfig: IGitConfigReader,
): Promise<ICommitAuthorResolution> => {
	const identity = input.identity;
	const named = input.named;
	const clientName = identity.clientName || 'agent';
	const modelName = identity.modelName || 'unknown-model';
	const fallbackEmail = asEmail(clientName);

	switch (input.mode) {
		case 'git': {
			const [name, email] = await Promise.all([
				gitConfig.getUserName(),
				gitConfig.getUserEmail(),
			]);
			if (!name || !email) {
				return {
					authorFlag: '',
					label: 'git',
					reason: 'mode "git" requires `git config user.name` and `user.email`; run `git config user.name "Your Name"` and `git config user.email "you@example.com"` first.',
				};
			}
			return {
				authorFlag: `${name} <${email}>`,
				label: `git (${name} <${email}>)`,
			};
		}
		case 'agent': {
			const authorFlag = `${clientName} <${fallbackEmail}>`;
			return { authorFlag, label: `agent (${authorFlag})` };
		}
		case 'bot': {
			const email = asEmail(
				`${clientName}-bot`,
				'users.noreply.github.com',
			);
			const authorFlag = `${clientName}-bot <${email}>`;
			return { authorFlag, label: `bot (${authorFlag})` };
		}
		case 'named': {
			const displayName = named.humanName.trim() || clientName || 'agent';
			const email = named.humanEmail.trim() || fallbackEmail;
			// Quoted to survive the parentheses / spaces; git accepts
			// the surrounding quotes on the `--author` value.
			const authorFlag = `"${displayName} (${modelName})" <${email}>`;
			return {
				authorFlag,
				label: `named (${displayName} (${modelName}) <${email}>)`,
			};
		}
	}
};
