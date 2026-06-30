/**
 * init-foreign-detect.ts — f00089 U1.
 *
 * When `init` runs inside a FOREIGN project, the migration offer must
 * stop emitting a generic `f00001` stub and instead *recognise the
 * project's own proposal/plan convention* and migrate it onto ours.
 *
 * This module is the detector. Given an injected `IFileReader` (the
 * same read-only, workspace-bounded reader `analyzeProject` uses) it:
 *
 *   1. scans a small, extensible table of well-known proposal-system
 *      conventions (`proposals/`, `docs/proposals/`, `rfcs/`, `adr/`,
 *      `plans/`, `specs/`, `.changeset/`, …),
 *   2. for each convention that exists, lists its markdown entries and
 *      infers the id/numbering scheme the foreign system uses, and
 *   3. returns a structured INVENTORY the migration generator (and
 *      f00089 U2's skill/tool absorber) consume — never an in-place
 *      rewrite of the target.
 *
 * Invariants (AGENTS.md):
 *   - No `process.cwd()`: the caller passes the workspace root, and IO
 *     is the injected `IFileReader` — this module never touches `node:fs`.
 *   - Pure data shaping over the reader; deterministic given a reader.
 *   - Advisory only: detection NEVER writes, deletes, or moves anything.
 */
import type { IFileReader } from './init-detection';

/**
 * Canonical id-numbering schemes a foreign proposal system can use.
 *   - `mcp-vertex`  — our own `f00001` / `p00012` padded prefix shape.
 *   - `rfc`         — `RFC-0001`, `rfc-12`, `0001-title` (rfc-style).
 *   - `adr`         — `0001-record-title.md` (ADR / MADR numbering).
 *   - `numeric`     — bare leading number with no recognised prefix.
 *   - `none`        — markdown present but no numbering signal found.
 */
export type IForeignIdScheme =
	| 'mcp-vertex'
	| 'rfc'
	| 'adr'
	| 'numeric'
	| 'none';

/**
 * The shape/convention family a detected directory belongs to. This is
 * coarser than the id-scheme: a `docs/proposals/` folder is still the
 * `proposals` family even if it happens to number its files ADR-style.
 */
export type IForeignConventionKind =
	| 'proposals'
	| 'rfcs'
	| 'adr'
	| 'plans'
	| 'specs'
	| 'changeset';

/** One detected foreign proposal/plan location. */
export interface IForeignConvention {
	/** Convention family (proposals / rfcs / adr / …). */
	readonly kind: IForeignConventionKind;
	/** Workspace-relative directory where it was found. */
	readonly location: string;
	/** Inferred id/numbering scheme of the entries inside `location`. */
	readonly idScheme: IForeignIdScheme;
	/** Count of markdown documents that look like records/proposals. */
	readonly documentCount: number;
	/**
	 * Highest numeric id observed across the entries (decimal), or 0
	 * when no numbered entry was found. Used to allocate the next free
	 * id without re-listing the directory.
	 */
	readonly maxNumericId: number;
	/** A few example filenames (capped) for human-readable plan output. */
	readonly sampleFiles: readonly string[];
}

/** Full inventory of every foreign proposal/plan convention found. */
export interface IForeignProposalInventory {
	/** True when at least one convention directory was found. */
	readonly found: boolean;
	/** Every detected convention, in detection order (first = primary). */
	readonly conventions: readonly IForeignConvention[];
	/**
	 * The convention the migration plan should treat as the primary
	 * source to migrate (the first non-empty one), or `undefined`.
	 */
	readonly primary: IForeignConvention | undefined;
}

/**
 * The extensible table of candidate directories. Order matters: the
 * first non-empty match becomes the `primary` convention. Add a row to
 * extend the detector; nothing else needs to change.
 */
const CANDIDATE_DIRS: readonly {
	readonly location: string;
	readonly kind: IForeignConventionKind;
}[] = [
	{ location: 'docs/proposals', kind: 'proposals' },
	{ location: 'proposals', kind: 'proposals' },
	{ location: 'docs/rfcs', kind: 'rfcs' },
	{ location: 'rfcs', kind: 'rfcs' },
	{ location: 'rfc', kind: 'rfcs' },
	{ location: 'docs/adr', kind: 'adr' },
	{ location: 'adr', kind: 'adr' },
	{ location: 'doc/adr', kind: 'adr' },
	{ location: 'docs/decisions', kind: 'adr' },
	{ location: 'docs/plans', kind: 'plans' },
	{ location: 'plans', kind: 'plans' },
	{ location: 'docs/specs', kind: 'specs' },
	{ location: 'specs', kind: 'specs' },
	{ location: '.changeset', kind: 'changeset' },
];

const MAX_SAMPLES = 5;

/** mcp-vertex / single-letter-prefix padded id, e.g. `f00001`, `p12`. */
const MCP_VERTEX_RE = /^([a-z])(\d{2,})-/i;
/** RFC-style: `RFC-0001`, `rfc_12`, `rfc0007`. */
const RFC_RE = /^rfc[-_]?(\d+)/i;
/** ADR / MADR / leading-number style: `0001-title.md`, `12-foo.md`. */
const NUMERIC_RE = /^(\d+)[-_]/;

/**
 * Classify a single markdown filename and return its numeric id (or
 * `null` when the file is not a record) plus the scheme it matched.
 */
const classifyEntry = (
	name: string,
): { readonly scheme: IForeignIdScheme; readonly id: number } | null => {
	const lower = name.toLowerCase();
	if (!lower.endsWith('.md')) return null;
	if (lower === 'readme.md' || lower === 'index.md' || lower === 'template.md')
		return null;

	const rfc = name.match(RFC_RE);
	if (rfc) return { scheme: 'rfc', id: Number(rfc[1]) };

	const mcp = name.match(MCP_VERTEX_RE);
	if (mcp) return { scheme: 'mcp-vertex', id: Number(mcp[2]) };

	const num = name.match(NUMERIC_RE);
	if (num) return { scheme: 'numeric', id: Number(num[1]) };

	// Markdown record with no numbering signal (e.g. ADR with a kebab
	// title only). It still counts as a document but contributes no id.
	return { scheme: 'none', id: 0 };
};

/**
 * Fold the per-entry schemes into the single dominant scheme for a
 * directory. Precedence: an explicit prefix scheme wins over a bare
 * numeric one; ADR directories whose entries are bare-numeric report
 * `adr` only via the convention kind, never override the id scheme.
 */
const dominantScheme = (
	kind: IForeignConventionKind,
	schemes: readonly IForeignIdScheme[],
): IForeignIdScheme => {
	if (schemes.includes('mcp-vertex')) return 'mcp-vertex';
	if (schemes.includes('rfc')) return 'rfc';
	if (schemes.includes('numeric')) return kind === 'adr' ? 'adr' : 'numeric';
	return 'none';
};

/**
 * Scan one candidate directory. Returns `null` when the directory is
 * absent or contains no markdown record at all (so a stray empty
 * `specs/` folder does not register as a foreign system).
 */
const scanDir = async (
	reader: IFileReader,
	candidate: { readonly location: string; readonly kind: IForeignConventionKind },
): Promise<IForeignConvention | null> => {
	const entries = await reader.listDir(candidate.location);
	if (entries.length === 0) return null;

	const schemes: IForeignIdScheme[] = [];
	const samples: string[] = [];
	let documentCount = 0;
	let maxNumericId = 0;

	for (const name of entries) {
		const classified = classifyEntry(name);
		if (classified === null) continue;
		documentCount += 1;
		schemes.push(classified.scheme);
		if (classified.id > maxNumericId) maxNumericId = classified.id;
		if (samples.length < MAX_SAMPLES) samples.push(name);
	}

	if (documentCount === 0) return null;

	return {
		kind: candidate.kind,
		location: candidate.location,
		idScheme: dominantScheme(candidate.kind, schemes),
		documentCount,
		maxNumericId,
		sampleFiles: samples,
	};
};

/**
 * Detect every foreign proposal/plan convention in the target project.
 *
 * `reader` is injected (DIP); the caller wires it to the workspace via
 * `createWorkspaceFileReader(createWorkspacePathProvider(workspaceRoot))`.
 * Tests pass an in-memory reader so every branch is deterministic.
 */
export const detectForeignProposals = async (
	reader: IFileReader,
): Promise<IForeignProposalInventory> => {
	const conventions: IForeignConvention[] = [];
	for (const candidate of CANDIDATE_DIRS) {
		const found = await scanDir(reader, candidate);
		if (found !== null) conventions.push(found);
	}
	return {
		found: conventions.length > 0,
		conventions,
		primary: conventions[0],
	};
};

/**
 * Allocate the NEXT FREE id for the emitted adoption-plan proposal.
 *
 * The plan always lands under OUR canonical layout
 * (`docs/mcp-vertex/proposals/ready/`) with OUR `f`-prefix shape, so the
 * id is allocated against OUR convention. Two sources are consulted, in
 * order, and the maximum wins (never collide with either side):
 *
 *   1. ids already present under `docs/mcp-vertex/proposals/` in the
 *      target (a prior `init` run, or a hand-started migration), and
 *   2. the highest numeric id observed in the FOREIGN primary system
 *      (so the migrated plan sorts after the work it supersedes when
 *      the foreign system also used the `f`/numeric space).
 *
 * Falls back to `f00001` only when nothing is found anywhere — exactly
 * the legacy behaviour, but never hardcoded when a collision is possible.
 *
 * Returns the padded id string (`f00001`, `f00042`, …).
 */
export const allocateNextAdoptionId = async (
	reader: IFileReader,
	inventory: IForeignProposalInventory,
): Promise<string> => {
	let max = 0;

	// 1) Our own proposals dir in the target (root + ready/ + done/).
	for (const dir of [
		'docs/mcp-vertex/proposals',
		'docs/mcp-vertex/proposals/ready',
		'docs/mcp-vertex/proposals/done',
		'docs/mcp-vertex/proposals/paused',
	]) {
		const entries = await reader.listDir(dir);
		for (const name of entries) {
			const m = name.match(MCP_VERTEX_RE);
			if (m && m[1]?.toLowerCase() === 'f') {
				const n = Number(m[2]);
				if (Number.isFinite(n) && n > max) max = n;
			}
		}
	}

	// 2) The foreign primary system's highest numeric id, but ONLY when
	//    that system already shares our `f`/numeric id space (an rfc/adr
	//    folder numbers a different space and must not push our counter).
	const primary = inventory.primary;
	if (
		primary &&
		(primary.idScheme === 'mcp-vertex' || primary.idScheme === 'numeric')
	) {
		if (primary.maxNumericId > max) max = primary.maxNumericId;
	}

	return `f${String(max + 1).padStart(5, '0')}`;
};

/**
 * Human-readable, one-line description of a detected convention for the
 * adoption plan's prose. Pure; no IO.
 */
export const describeConvention = (c: IForeignConvention): string =>
	`${c.kind} at \`${c.location}\` (${c.documentCount} doc(s), id-scheme: ${c.idScheme})`;
