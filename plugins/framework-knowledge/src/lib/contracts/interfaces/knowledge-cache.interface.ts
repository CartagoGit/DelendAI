/**
 * knowledge-cache.interface.ts — the contract of the on-disk knowledge
 * cache.
 *
 * One directory per framework and resolved version. The common path
 * reads only the summary file; the evidence file is opened when a
 * caller asks why one rule says what it says.
 */
import type {
	IKnowledgeEvidence,
	IKnowledgeForce,
	IKnowledgeRecord,
} from './knowledge-record.interface';

/** Which cache directory a record set belongs to. */
export interface IKnowledgeCacheKey {
	readonly frameworkId: string;
	/** The concrete installed version, e.g. `17.3.2`. */
	readonly version: string;
}

/** A record without its evidence: all the common path needs. */
export interface IKnowledgeSummaryEntry {
	readonly id: string;
	readonly topic: string;
	readonly statement: string;
	readonly force: IKnowledgeForce;
	readonly appliesToVersion: string;
}

/** Why a lookup found nothing usable. */
export type IKnowledgeCacheMissReason =
	| 'absent'
	| 'stale'
	| 'corrupt'
	| 'unknown-rule';

export type IKnowledgeSummaryResult =
	| {
			readonly hit: true;
			readonly entries: readonly IKnowledgeSummaryEntry[];
	  }
	| { readonly hit: false; readonly reason: IKnowledgeCacheMissReason };

export type IKnowledgeEvidenceResult =
	| {
			readonly hit: true;
			readonly ruleId: string;
			readonly statement: string;
			readonly evidence: IKnowledgeEvidence;
	  }
	| { readonly hit: false; readonly reason: IKnowledgeCacheMissReason };

/** Input of `writeKnowledge`: validated records for one key. */
export interface IKnowledgeWriteInput {
	readonly key: IKnowledgeCacheKey;
	/** Lockfile entry this set was produced for; a change invalidates it. */
	readonly lockEntry: string;
	readonly records: readonly IKnowledgeRecord[];
}

/** The lockfile and manifest facts the tools resolve a version from. */
export interface IInstalledFramework {
	readonly frameworkId: string;
	readonly depName: string;
	/** Concrete version, or `undefined` when nothing safely answers. */
	readonly version: string | undefined;
	/** The lockfile entry the version was read from, when there was one. */
	readonly lockEntry: string | undefined;
}

/** What both tools need to find the project and its cache. */
export interface IKnowledgeToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	/** Absolute cache root, e.g. `<workspace>/.cache/delendai`. */
	readonly cacheRootAbs: string;
}
