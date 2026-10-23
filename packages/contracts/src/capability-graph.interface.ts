/**
 * capability-graph.interface.ts — the canonical ontology of
 * "what is this project".
 *
 * Two detectors answer nearly the same question today with different
 * shapes — `bootstrap/analyze-project.ts` and `config/detect-stack.ts` —
 * so two parts of the system can believe different things about one
 * repository. This file is the shape both will derive from.
 *
 * Three deliberate departures from the model being replaced:
 *
 * **Plural where reality is plural.** The old contract promised
 * `readonly detectedLanguages: readonly string[]` and the
 * implementation pushed exactly one element into it. A repository with
 * `tsconfig.json`, `Cargo.toml` and `go.mod` reported one language;
 * Rust and Go did not appear as low-confidence, they did not appear at
 * all. That is not a documented limitation, it is a contract that says
 * one thing and does another.
 *
 * **Evidence, not opinion.** Every signal names the file or key that
 * produced it. A detection an agent cannot trace is a detection it
 * cannot check, and unverifiable claims about a repository are exactly
 * how an agent ends up editing the wrong directory with confidence.
 *
 * **Shape and roles are orthogonal.** `projectType: 'monorepo'` answered
 * "how is the workspace laid out" and destroyed the answer to "what is
 * in it". A monorepo can be a web client and a backend API and a
 * library and a CLI, because it usually is all four.
 *
 * Detection is not authorization. This graph says what exists; it never
 * says what a plugin or host is allowed to do with it. That decision
 * belongs to policy, and keeping the two apart is what stops
 * "we found Docker" from quietly becoming "we may run containers".
 *
 * Pure types. No runtime, no Node imports — `lint:no-node-imports-in-contracts`
 * enforces it.
 */

/**
 * How much a single piece of evidence is worth.
 *
 * An ordinal union rather than a 0..1 number, on purpose: a number
 * invites `0.73`, and nobody can defend the difference between 0.73 and
 * 0.71. The weights used to accumulate these live in the runtime, where
 * they can be tuned and tested; the contract only fixes the vocabulary.
 *
 * - `certain` — a manifest that exists to declare this and nothing else
 *   (`Cargo.toml` for Rust, `go.mod` for Go).
 * - `strong` — a well-known file or dependency that is rarely present
 *   for another reason (`tsconfig.json`, a `django` dependency).
 * - `weak` — real evidence that is also consistent with other readings
 *   (a `.js` file in a mostly-Python repo; `three` as a dependency,
 *   which serves CAD and scientific visualisation as readily as games).
 */
export type ISignalConfidence = 'certain' | 'strong' | 'weak';

/**
 * One observation by one detector.
 *
 * `evidence` is the whole point: the relative path, or `file#key`, that
 * produced the claim. A signal without it is an opinion, and the graph
 * has no way to explain itself to the agent reading it.
 */
export interface ICapabilitySignal {
	/** Detector that produced this, e.g. `detect-stack`, `language-rules`. */
	readonly source: string;
	/** What was observed, e.g. `typescript`, `backend-api`, `pnpm`. */
	readonly value: string;
	/** Where it was observed: a repo-relative path, optionally `#key`. */
	readonly evidence: string;
	readonly confidence: ISignalConfidence;
	/** Optional human-readable reason, for signals whose evidence is indirect. */
	readonly note?: string | undefined;
}

/**
 * A detected language and everything that pointed at it.
 *
 * `signals` is never empty — a language in this list was detected by
 * something, and that something is recorded.
 */
export interface ILanguageFinding {
	/** Canonical language id, e.g. `typescript`, `python`, `rust`. */
	readonly id: string;
	readonly signals: readonly ICapabilitySignal[];
}

/**
 * How the workspace is laid out. Answers a structural question only,
 * and says nothing about what the workspace contains.
 */
export type IWorkspaceShape =
	| 'single-package'
	| 'monorepo'
	| 'polyglot-workspace'
	| 'unknown';

/**
 * What a part of the project IS. Plural by construction: these are not
 * mutually exclusive and a repository routinely holds several.
 *
 * `library` is deliberately not the fallback. Making it the default is
 * how every Python project with a `pyproject.toml` became a library,
 * Django and Celery included. When nothing matches, the honest answer
 * is that nothing matched.
 */
export type IProjectRole =
	| 'library'
	| 'cli'
	| 'web-client'
	| 'backend-api'
	| 'game'
	| 'mcp-server'
	| 'docs-site'
	| 'infrastructure'
	| 'data-pipeline';

/** One detected role, with the evidence that produced it. */
export interface IProjectRoleFinding {
	readonly role: IProjectRole;
	readonly signals: readonly ICapabilitySignal[];
}

/**
 * The workspace's form and its contents, kept apart.
 *
 * `roles` may be empty. An empty list means no rule matched, which is a
 * different and more useful statement than a confident `generic`.
 */
export interface IProjectShape {
	readonly workspace: IWorkspaceShape;
	readonly roles: readonly IProjectRoleFinding[];
}

/**
 * The canonical answer to "what is this project", from which every
 * other view is projected.
 *
 * `primary` survives as a derived convenience for callers that genuinely
 * need one label. It is no longer the only datum that survives
 * detection, so a caller that disagrees with it can consult `languages`
 * instead of being stuck with it.
 */
export interface ICapabilityGraph {
	/** Contract marker, so a persisted graph identifies itself. */
	readonly contract: 'delendai.capability-graph';
	readonly version: 1;
	/** Every language with a signal, in descending order of accumulated weight. */
	readonly languages: readonly ILanguageFinding[];
	/** Derived: the first entry of `languages`, or `undefined` when empty. */
	readonly primaryLanguage: string | undefined;
	readonly shape: IProjectShape;
	/**
	 * Signals that did not fit the categories above — package manager,
	 * test runner, CI, frameworks. Kept as raw signals rather than
	 * promoted to fields so that adding a detector does not require
	 * changing this contract.
	 */
	readonly signals: readonly ICapabilitySignal[];
}
