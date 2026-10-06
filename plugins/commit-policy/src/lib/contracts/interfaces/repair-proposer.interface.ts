/**
 * repair-proposer.interface.ts — the shapes of an auto-filed repair
 * proposal request and its result, plus the PORT the proposer needs
 * a host to inject before it can file anything.
 *
 * `now` is kept on the options for callers that want to
 * deterministically reproduce a past boot's outputs in a test, but
 * the canonical id is derived from `IStorm.firstSeenAt` (lifetime
 * identity), not from `now` — so two runs on the same storm
 * always produce the same filename.
 *
 * ## Why a port (x00535 S1)
 *
 * The proposer used to `import { allocateNextProposalId, buildSwarmPaths,
 * proposalFolderFor, syncProposalRegistry } from '@delendai/proposals/public'`.
 * That single import site was one of the three edges in a real
 * dependency cycle across the manifests:
 *
 *   plugins/proposals -> plugins/error-reporting -> plugins/commit-policy
 *   -> plugins/proposals
 *
 * No build order satisfies a cycle, so the builder could only complete
 * under `DELENDAI_BUILD_ALLOW_CYCLES=1`. Cutting the edge means
 * commit-policy must depend on a SHAPE IT DECLARES ITSELF rather than
 * on the proposals package: `IProposalStorePort` is that shape. Whoever
 * owns both plugins (the host, a test, or a future core-level
 * registry) supplies the implementation; commit-policy never names the
 * provider.
 *
 * The port is OPTIONAL, following the same convention `ctx.logs` uses
 * in `IMcpPluginContext` for a capability that only exists when a peer
 * plugin is loaded: absent means "no proposal store reachable", and the
 * proposer degrades to reporting that in `IRepairProposalResult.reason`
 * instead of filing. Auto-filing a repair proposal is a nice-to-have;
 * refusing to commit because the proposals plugin is not loaded would
 * not be.
 */

import type { IStorm } from './storm-detector.interface';

/**
 * The subset of the proposals path layout the proposer reads. A
 * structural subset of the proposals plugin's `IHostPathLayout`, so an
 * adapter can return that value directly.
 */
export interface IProposalStoreLayout {
	/** Workspace-relative proposals root, e.g. `docs/delendai/proposals`. */
	readonly proposalsDir: string;
	/** Workspace-relative registry index, e.g. `.cache/delendai/proposals/index.json`. */
	readonly proposalIndexFile: string;
	/** Workspace-relative shared id counter file. */
	readonly proposalIdCountersFile: string;
}

/** One entry of a registry sync, as the proposer reads it. */
export interface IProposalRegistryEntry {
	readonly id: string;
	readonly file: string;
}

/** What a registry sync reports back. */
export interface IProposalRegistrySyncResult {
	readonly proposals: readonly IProposalRegistryEntry[];
}

/**
 * The four operations the proposer needs from a proposal store:
 * resolve the layout, allocate a canonical id from the SHARED counter
 * (never a hand-rolled one — see the `xauto-` orphan in the module
 * header of `repair-proposer.ts`), and re-sync the registry index so a
 * file on disk cannot stay invisible.
 */
export interface IProposalStorePort {
	/** Derive the proposal store layout from the host's cache/docs roots. */
	readonly buildSwarmPaths: (
		cacheDir: string,
		docsDir: string,
	) => IProposalStoreLayout;
	/** Allocate the next canonical id for `prefix` from the shared counter. */
	readonly allocateNextProposalId: (
		prefix: string,
		dirs: {
			readonly proposalsDirAbs: string;
			readonly counterPathAbs: string;
		},
	) => Promise<string>;
	/** Re-scan the proposals dir and rewrite the registry index. */
	readonly syncProposalRegistry: (
		workspaceRoot: string,
		layout: {
			readonly proposalsDir: string;
			readonly proposalIndexFile: string;
		},
	) => Promise<IProposalRegistrySyncResult>;
}

export interface IRepairProposerOptions {
	readonly workspaceRoot: string;
	readonly cacheDir: string;
	readonly docsDir: string;
	/**
	 * The injected proposal store. Absent = no store reachable this
	 * boot; every storm that would have been filed comes back
	 * `proposed: false` with a reason saying so.
	 */
	readonly proposalStore?: IProposalStorePort;
	/**
	 * @deprecated kept for backward compat with tests; the
	 * proposal id is allocated canonically from the proposals
	 * counter, so `now` only stabilises timestamps in tests.
	 */
	readonly now?: Date;
}

export interface IRepairProposalResult {
	readonly storm: IStorm;
	readonly filePath: string;
	readonly proposed: boolean;
	readonly reason: string;
}
