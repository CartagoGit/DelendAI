/**
 * A proposal family is a namespace of work units (in the host project:
 * `f` fixes, `a` audits, `p` proposals, `g` games). mcp-vertex only
 * knows the mechanics; the host supplies the actual families.
 */
export interface IProposalFamily {
	/** Single-letter (or short) id prefix, e.g. `p`. */
	readonly prefix: string;
	/** Human description of what lives in this family. */
	readonly description: string;
}

/**
 * Host configuration of the proposal store: which families exist, in
 * which order they cascade when picking work, and how the proposal
 * folders are laid out under `IHostPathLayout.proposalsDir`.
 */
export interface IProposalStoreConfig {
	readonly families: readonly IProposalFamily[];
	/**
	 * Resolution order when the orchestrator picks the next work
	 * unit, expressed as family prefixes, e.g. `['f', 'a', 'p', 'g']`.
	 */
	readonly familyCascade: readonly string[];
	/**
	 * Logical folder names mapped to directories relative to
	 * `proposalsDir`, e.g. `{ historical: 'historical', fixes: 'fixes' }`.
	 */
	readonly folders: Readonly<Record<string, string>>;
	/**
	 * Frontmatter keys (beyond the core set: id, type, status, track,
	 * created, budget, swarmBudget, continuityPolicy,
	 * acceptanceCriteria) that the host wants parsed and preserved.
	 */
	readonly frontmatterExtensions?: readonly string[] | undefined;
}
