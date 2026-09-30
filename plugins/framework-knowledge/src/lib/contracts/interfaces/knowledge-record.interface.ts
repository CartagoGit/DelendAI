/**
 * knowledge-record.interface.ts — f00547 S2: the pure contract for one
 * piece of framework knowledge.
 *
 * A record is never trusted on its say-so alone: it always carries
 * WHERE it came from (`evidence`), WHEN that evidence was read
 * (`retrievedAt`), WHICH version of the framework it applies to, and
 * its FORCE — the difference between "the project may choose" and
 * "this will not compile".
 */

/**
 * Ordered from strongest permission to strongest refusal:
 * - `required` — the framework version demands this; there is no
 *   valid alternative.
 * - `recommended` — the framework's own docs prefer this; a project
 *   may still choose otherwise.
 * - `supported` — valid, no stated preference either way.
 * - `discouraged` — valid but the framework's docs advise against it.
 * - `deprecated` — still compiles on this version, but scheduled for
 *   removal; a rule should say in which version.
 * - `removed` — refused outright by the installed version; a project
 *   preference asking for it does not override this.
 */
export type IKnowledgeForce =
	| 'required'
	| 'recommended'
	| 'supported'
	| 'discouraged'
	| 'deprecated'
	| 'removed';

/** Where a record's statement was read, and when. */
export interface IKnowledgeEvidence {
	/** A trusted source identifier — a URL, or a first-party doc path. */
	readonly source: string;
	/** ISO 8601 timestamp of when `source` was read. */
	readonly retrievedAt: string;
}

/** One resolved piece of framework knowledge. */
export interface IKnowledgeRecord {
	/** Stable id, unique within a framework (e.g. `angular-inline-template`). */
	readonly id: string;
	readonly frameworkId: string;
	/**
	 * The version (or version expression, e.g. `17.x`) this record's
	 * `force` applies to. A record scoped to one version does not
	 * automatically apply to another — the policy resolver (S3) is
	 * where that match is decided.
	 */
	readonly appliesToVersion: string;
	/** Short topic slug (e.g. `component-styles`), groups related records. */
	readonly topic: string;
	/** The rule itself, in plain language. */
	readonly statement: string;
	readonly force: IKnowledgeForce;
	readonly evidence: IKnowledgeEvidence;
}

/**
 * Input to `createKnowledgeRecord` — the same shape as `IKnowledgeRecord`,
 * except `force` is a bare `string`. A record's whole point is
 * validating an UNTRUSTED candidate (hand-authored, or read back from
 * an adapter); narrowing `force` to `IKnowledgeForce` at the input
 * boundary would just move the "what if it's wrong" case to a cast
 * instead of a runtime check.
 */
export interface IKnowledgeRecordInput {
	readonly id: string;
	readonly frameworkId: string;
	readonly appliesToVersion: string;
	readonly topic: string;
	readonly statement: string;
	readonly force: string;
	readonly evidence: IKnowledgeEvidence;
}

/** The outcome of `createKnowledgeRecord`: a valid record, or why not. */
export type ICreateKnowledgeRecordResult =
	| { readonly ok: true; readonly record: IKnowledgeRecord }
	| { readonly ok: false; readonly reason: string };
