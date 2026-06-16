// Round-context public types + constants. Split out of round-context.ts
// to tame the 884-line engine (N20). round-context.ts re-exports these,
// so every existing `from '../swarm/round-context'` import keeps working.

import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';

// ---------------------------------------------------------------------------
// Core docs (the canonical "core four" the proposal names)
// ---------------------------------------------------------------------------

/**
 * The four core documents whose stable hashes anchor the round context.
 *
 * - `README.md` — top-level workspace README.
 * - `docs/proposals/index.json` — proposal registry.
 * - `.github/copilot-instructions.md` — root Copilot instructions.
 * - `the proposal-workflow knowledge` — the
 *   proposal workflow skill (the doc subagents consult to understand
 *   proposal governance).
 */
// the default doc set is HOST-AGNOSTIC (workspace README +
// proposal index). Hosts inject their full list (instructions files,
// skill docs…) through the `coreDocs` parameter of
// `computeCoreDocHashes`.
export const CORE_DOCS = ['README.md', 'docs/proposals/index.json'] as const;

export type ICoreDocRelPath = string;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IRoundContextLock {
	readonly taskId: string;
	readonly agent: string;
	readonly ownershipCount: number;
	readonly filesPreview: readonly string[];
	readonly lastSeen: string;
	readonly parentTaskId?: string;
}

export interface IRoundContextAgent {
	readonly agent: string;
	readonly taskId: string;
	readonly slot: string;
	readonly depth: number;
	readonly lastSeen: string;
	readonly adopted: boolean;
}

export type IRoundContextSourceState = 'ok' | 'missing' | 'corrupt';

export interface IRoundContextSourceMeta {
	readonly state: IRoundContextSourceState;
	readonly fingerprint: string;
	readonly timestamp: string | null;
	readonly ageMinutes: number | null;
	readonly temporallyStale: boolean;
}

export interface IRoundContextSources {
	readonly chatContext: IRoundContextSourceMeta;
	readonly checkpoint: IRoundContextSourceMeta;
	readonly lock: IRoundContextSourceMeta;
	readonly registry: IRoundContextSourceMeta;
}

export interface IRoundContextChatContext {
	readonly proposalIds: readonly string[];
	readonly topic?: string;
	readonly lastUpdated?: string;
}

export interface IRoundContextCheckpoint {
	readonly proposalId?: string;
	readonly status?: string;
	readonly selectedTask?: string;
	readonly nextAction?: string;
	readonly updatedAt?: string;
}

export interface IRoundContextProposalPortfolio {
	readonly sourceState: IRoundContextSourceState;
	readonly strategy: 'index' | 'fallback-scan';
	readonly activeIds: readonly string[];
	readonly activeOverflowCount: number;
	readonly activeCount: number;
	readonly pendingCount: number;
	readonly inProgressCount: number;
}

export interface IRoundContextResumeHint {
	readonly mode: 'resume' | 'next' | 'unknown';
	readonly proposalId: string;
	readonly reason: string;
	readonly taskId?: string;
}

export interface IRoundContextDigest {
	readonly roundId: string;
	readonly activeProposalId: string;
	readonly currentTaskId: string;
	readonly activeLocks: readonly IRoundContextLock[];
	readonly activeAgents: readonly IRoundContextAgent[];
	readonly coreDocHashes: Readonly<Record<string, string>>;
	readonly sources: IRoundContextSources;
	readonly chatContext: IRoundContextChatContext;
	readonly checkpoint: IRoundContextCheckpoint;
	readonly proposalPortfolio: IRoundContextProposalPortfolio;
	readonly resumeHint: IRoundContextResumeHint;
	readonly createdAt: string;
	readonly digestVersion: 1;
}

export interface IRoundContextDigestInput {
	readonly roundId: string;
	readonly activeProposalId: string;
	readonly currentTaskId: string;
	readonly activeLocks: readonly IRoundContextLock[];
	readonly activeAgents: readonly IRoundContextAgent[];
	readonly coreDocHashes: Readonly<Record<string, string>>;
	readonly sources: IRoundContextSources;
	readonly chatContext: IRoundContextChatContext;
	readonly checkpoint: IRoundContextCheckpoint;
	readonly proposalPortfolio: IRoundContextProposalPortfolio;
	readonly resumeHint: IRoundContextResumeHint;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * The default path where the round-context digest is published.
 *
 * Resolved at call time against the current workspace so the helper
 * works regardless of which package directory the process was launched
 * from.
 */
export const DEFAULT_ROUND_CONTEXT_PATH =
	DEFAULT_PATH_LAYOUT.roundContextDigestFile;

export const ROUND_CONTEXT_DIGEST_VERSION = 1 as const;
export const ACTIVE_PROPOSAL_PREVIEW_LIMIT = 5;
