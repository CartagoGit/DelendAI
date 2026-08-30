/**
 * branch-protection-contracts.ts — the SRP-adjacent data contracts for
 * the branch-protection adapter (extracted to keep the adapter under the
 * 400-LOC SRP ceiling; the adapter keeps the behaviour, this file owns
 * the public types).
 *
 * Single-purpose: type definitions only. No I/O, no parsing, no policy —
 * anything behavioural lives in `branch-protection-adapter.ts`.
 */

/** Forge vendors the adapter can classify a remote URL into. */
export type ForgeProvider = 'github' | 'gitlab' | 'unknown';

/** Resolves a remote host to a forge provider, including self-hosted hosts. */
export type ForgeProviderResolver = (remoteHost: string) => ForgeProvider;

/** Lifecycle of the last remote branch-protection refresh. */
export type BranchProtectionState = 'fresh' | 'stale' | 'unsupported' | 'error';

/**
 * Result of `BranchProtectionRefreshResult.refresh()`. `fresh` carries
 * the full remote snapshot (provider + host + branches); every failure
 * mode keeps the observed remote identity when known so the status tool
 * can surface `remoteName`/`remoteHost` even when the refresh fails.
 */
export type BranchProtectionRefreshResult =
	| {
			readonly ok: true;
			readonly state: 'fresh';
			readonly provider: Exclude<ForgeProvider, 'unknown'>;
			readonly remoteName: string;
			readonly remoteHost: string;
			readonly remoteBranches: readonly string[];
			readonly effectiveBranches: readonly string[];
	  }
	| {
			readonly ok: false;
			readonly state: Exclude<BranchProtectionState, 'fresh'>;
			readonly reason: string;
			readonly provider?: ForgeProvider;
			readonly remoteName?: string;
			readonly remoteHost?: string;
			readonly remoteBranches: readonly string[];
			readonly effectiveBranches: readonly string[];
	  };

/** The surface the branch-protection tool and the status tool consume. */
export interface BranchProtectionAdapter {
	refresh(): Promise<BranchProtectionRefreshResult>;
	getLastResult(): BranchProtectionRefreshResult | undefined;
}

/**
 * A remote resolved to a known forge vendor, so the adapter knows which
 * CLI (`gh` / `glab`) can query protected branches.
 */
export interface SupportedRemoteRepository {
	readonly remoteName: string;
	readonly remoteHost: string;
	readonly provider: 'github' | 'gitlab';
	readonly owner: string;
	readonly repository: string;
}
