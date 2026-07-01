/**
 * f00084 S4 — host-instructions centralizer with idempotent append.
 *
 * The block is delimited by `<!-- mcp-vertex:begin -->` and
 * `<!-- mcp-vertex:end -->` markers. When the target file already
 * contains the block, it is replaced in place. When it does not, the
 * block is appended at the end. When the file does not exist, it is
 * created with the block as the only content.
 *
 * f00088 §vision U3 — single source of truth consolidation.
 *
 * The vision (f00089 point 2e) wants `init`, when run inside a foreign
 * project, to *collapse* that project's scattered agent-instruction
 * files (multiple `CLAUDE.md`, `AGENTS.md`, `.cursorrules`,
 * `.github/copilot-instructions.md`, `.aider.conf*`, ad-hoc
 * `*.agent.md`, …) into ONE canonical source of truth — the way this
 * repo keeps `AGENT-BOOTSTRAP.md` (canonical, loaded by every host)
 * plus `AGENTS.md` (host-specific rules). N divergent files become one
 * canonical doc + thin pointers.
 *
 * The consolidation is strictly **non-destructive and advisory**: init
 * never deletes or rewrites the target's content in place. It
 * (1) inventories the scattered sources, (2) collapses their content
 * into a single canonical doc preserving each source's provenance, and
 * (3) emits *pointer* blocks for the legacy locations (inside the
 * `mcp-vertex:begin`/`end` markers, so the original prose above the
 * block is untouched). Re-running is idempotent: the canonical doc and
 * the pointers are byte-stable, and a location that is already nothing
 * but a pointer is not collapsed a second time.
 */

import type { IAgentInstructionSourceSpec, IConsolidationPlan, IConsolidationWrite, IDiscoveredInstructionSource, IHostInstructionsTarget } from '../../contracts/interfaces/init.interface';

// f00037/f00093: canonical home is contracts/interfaces/init.interface.ts.
// Re-exported here for specs that import the plan type from this module.
export type { IConsolidationPlan } from '../../contracts/interfaces/init.interface';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

;

const BEGIN_MARKER = '<!-- mcp-vertex:begin -->';
const END_MARKER = '<!-- mcp-vertex:end -->';

const wrapBlock = (body: string, withTrailingNewline: boolean): string => {
	const base = `${BEGIN_MARKER}\n\n${body.trim()}\n\n${END_MARKER}`;
	return withTrailingNewline ? `${base}\n` : base;
};

/**
 * Pure computation: given the current file contents (or `undefined` when
 * the file is missing) and the mode, return the next file contents.
 *
 * Mode semantics:
 *   - `append`   — replace existing block in place, or append.
 *   - `overwrite` — replace the whole file with the block.
 *   - `skip`     — return `undefined` (caller writes nothing).
 *
 * Idempotency: when the input is exactly what we wrote in a previous
 * run, the output is byte-identical. The key invariant is that
 * `wrapBlock` does NOT add a trailing newline on its own — the caller
 * controls the terminator based on what the existing file ends with.
 */
export const computeHostInstructionsWrite = (
	current: string | undefined,
	body: string,
	mode: 'append' | 'overwrite' | 'skip',
): string | undefined => {
	if (mode === 'skip') return undefined;
	if (mode === 'overwrite') return wrapBlock(body, true);
	if (current === undefined) return wrapBlock(body, true);
	const begin = current.indexOf(BEGIN_MARKER);
	const end = current.indexOf(END_MARKER);
	if (begin >= 0 && end > begin) {
		const before = current.slice(0, begin);
		const after = current.slice(end + END_MARKER.length);
		// Strip the line of leading newlines after the end marker so
		// the surrounding context collapses to a single blank line.
		const collapsedAfter = after.replace(/^\n+/, '\n');
		return `${before}${wrapBlock(body, false)}${collapsedAfter}`;
	}
	const separator = current.endsWith('\n') ? '' : '\n';
	return `${current}${separator}\n${wrapBlock(body, true)}`;
};

export const readHostInstructionsFile = async (
	workspace: string,
	relPath: string,
): Promise<string | undefined> => {
	const path = `${workspace}/${relPath}`;
	if (!existsSync(path)) return undefined;
	return readFile(path, 'utf8');
};

// ---------------------------------------------------------------------------
// f00088 §vision U3 — single-source-of-truth consolidation
// ---------------------------------------------------------------------------

/**
 * Relative path of the canonical agent-instruction doc this consolidation
 * produces — the foreign-project analogue of this repo's
 * `docs/mcp-vertex/AGENT-BOOTSTRAP.md`. Kept under the mcp-vertex docs tree so
 * it never collides with a file the target already owns.
 */
export const CANONICAL_AGENT_DOC_REL =
	'docs/mcp-vertex/AGENT-BOOTSTRAP.md';

/** Marker that flags a fully consolidated (pointer-only) legacy file. */
const POINTER_MARKER = '<!-- mcp-vertex:pointer -->';

/**
 * The well-known agent-instruction sources `init` scans for in the target
 * project. The list is intentionally extensible: each entry is either a fixed
 * relative path or a glob-ish suffix matched against the target's file list.
 *
 * `kind: 'file'`     — exact relative path (e.g. `.cursorrules`).
 * `kind: 'basename'` — any path whose final segment equals `match`, so a
 *                      nested `packages/x/CLAUDE.md` is captured but
 *                      `MY-CLAUDE.md` is not.
 * `kind: 'extension'`— any path ending with the suffix (extension/dotfile
 *                      style, e.g. `*.agent.md`), captured wherever it lives.
 *
 * The canonical doc itself is never treated as a source (it is the sink).
 */


export const AGENT_INSTRUCTION_SOURCE_SPECS: readonly IAgentInstructionSourceSpec[] =
	[
		{ label: 'Claude', kind: 'basename', match: 'CLAUDE.md' },
		{ label: 'AGENTS', kind: 'basename', match: 'AGENTS.md' },
		{ label: 'Cursor', kind: 'file', match: '.cursorrules' },
		{
			label: 'Copilot',
			kind: 'file',
			match: '.github/copilot-instructions.md',
		},
		{ label: 'Windsurf', kind: 'file', match: '.windsurfrules' },
		{ label: 'Aider', kind: 'extension', match: '.aider.conf.yml' },
		{ label: 'Aider', kind: 'extension', match: '.aider.conf.yaml' },
		{ label: 'Continue', kind: 'file', match: '.continuerules' },
		{ label: 'Cline', kind: 'file', match: '.clinerules' },
		{ label: 'Gemini', kind: 'basename', match: 'GEMINI.md' },
		{ label: 'Codex', kind: 'file', match: '.codex/instructions.md' },
		{ label: 'Ad-hoc agent doc', kind: 'extension', match: '.agent.md' },
	];

/** One discovered scattered agent-instruction source in the target. */


/**
 * Pure: does a target-relative path match a source spec?
 *   - `file`      — exact path equality.
 *   - `basename`  — final path segment equals `match` (so `AGENTS.md` matches
 *                   `packages/x/AGENTS.md` but not `MY-AGENTS.md`).
 *   - `extension` — path ends with `match` (extension/dotfile style, so
 *                   `onboarding.agent.md` matches `.agent.md`).
 */
const matchesSpec = (
	relPath: string,
	spec: IAgentInstructionSourceSpec,
): boolean => {
	if (spec.kind === 'file') return relPath === spec.match;
	if (spec.kind === 'extension') return relPath.endsWith(spec.match);
	if (relPath === spec.match) return true;
	return relPath.endsWith(`/${spec.match}`);
};

/**
 * Pure: classify a target-relative path against the known source specs.
 * Returns the matching label, or `undefined` when the path is not an
 * agent-instruction source. The canonical doc is explicitly excluded so the
 * sink is never re-ingested as a source.
 */
export const classifyInstructionSource = (
	relPath: string,
): string | undefined => {
	if (relPath === CANONICAL_AGENT_DOC_REL) return undefined;
	for (const spec of AGENT_INSTRUCTION_SOURCE_SPECS) {
		if (matchesSpec(relPath, spec)) return spec.label;
	}
	return undefined;
};

/**
 * Pure: extract the user-authored prose from a file's content, i.e. the
 * content with any `mcp-vertex:begin`/`end` block removed. Used both to detect
 * "pointer-only" files and to carry only original prose into the canonical
 * doc (so re-running never re-imports a pointer we wrote).
 */
export const extractOriginalProse = (content: string): string => {
	const begin = content.indexOf(BEGIN_MARKER);
	const end = content.indexOf(END_MARKER);
	if (begin >= 0 && end > begin) {
		const before = content.slice(0, begin);
		const after = content.slice(end + END_MARKER.length);
		return `${before}${after}`.trim();
	}
	return content.trim();
};

/**
 * IO boundary kept minimal: callers pass the list of candidate relative paths
 * (from the project analyzer / a directory walk) plus a reader. This keeps the
 * module pure w.r.t. how the file list is obtained (no `process.cwd()`, no
 * glob engine baked in) and lets tests drive every branch in-memory.
 *
 * @param workspace      absolute workspace root (used only to read content).
 * @param candidateRels  target-relative paths to consider as sources.
 * @param read           reader: `(workspace, relPath) => content | undefined`.
 */
export const discoverInstructionSources = async (
	workspace: string,
	candidateRels: readonly string[],
	read: (
		workspace: string,
		relPath: string,
	) => Promise<string | undefined> = readHostInstructionsFile,
): Promise<readonly IDiscoveredInstructionSource[]> => {
	const out: IDiscoveredInstructionSource[] = [];
	const seen = new Set<string>();
	for (const relPath of candidateRels) {
		if (seen.has(relPath)) continue;
		const label = classifyInstructionSource(relPath);
		if (label === undefined) continue;
		const content = await read(workspace, relPath);
		if (content === undefined) continue;
		seen.add(relPath);
		const prose = extractOriginalProse(content);
		out.push({
			relPath,
			label,
			content,
			isPointerOnly: prose.length === 0,
		});
	}
	// Stable, deterministic order so the canonical doc is byte-reproducible.
	return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
};

/**
 * Pure: collapse the discovered sources into the body of the single canonical
 * doc. Each source contributes a provenance-stamped section carrying ONLY its
 * original prose (pointer-only files contribute nothing — idempotency). The
 * returned body is wrapped by the caller in the standard mcp-vertex block.
 *
 * The shape mirrors this repo's bootstrap: a short canonical preamble, then one
 * section per absorbed source, each headed by the source path so provenance is
 * never lost. Re-running with the same inputs yields a byte-identical body.
 */
export const collapseToCanonicalBody = (
	sources: readonly IDiscoveredInstructionSource[],
): string => {
	const header = [
		'# Agent instructions — single source of truth',
		'',
		'> Consolidated by `mcp-vertex init`. This file is the canonical agent',
		'> bootstrap for this project (the analogue of mcp-vertex’s own',
		'> `AGENT-BOOTSTRAP.md`). The legacy instruction files below were left in',
		'> place and now point here; edit THIS file, not the pointers.',
	].join('\n');
	const absorbed = sources
		.filter((s) => !s.isPointerOnly)
		.map((s) => {
			const prose = extractOriginalProse(s.content);
			return [
				`## From ${s.relPath} (${s.label})`,
				'',
				prose,
			].join('\n');
		});
	if (absorbed.length === 0) {
		return [
			header,
			'',
			'<!-- No pre-existing agent instructions were found to absorb. -->',
		].join('\n');
	}
	return [header, '', ...flattenSections(absorbed)].join('\n');
};

/** Join sections with a single blank line between them. */
const flattenSections = (sections: readonly string[]): string[] => {
	const out: string[] = [];
	sections.forEach((section, idx) => {
		if (idx > 0) out.push('');
		out.push(section);
	});
	return out;
};

/**
 * Pure: the pointer body that replaces a legacy location's mcp-vertex block.
 * It links back to the canonical doc and names the source for the reader. The
 * `POINTER_MARKER` lets a later run recognise a pointer-only file.
 */
export const renderLegacyPointerBody = (
	label: string,
	canonicalRel: string = CANONICAL_AGENT_DOC_REL,
): string =>
	[
		POINTER_MARKER,
		'',
		`> Agent instructions for this project live in \`${canonicalRel}\`.`,
		`> This ${label} file is kept as a pointer; do not add rules here.`,
	].join('\n');

/** A single planned write the consolidation produces. */


/** The full advisory result of a consolidation pass. */


/**
 * Pure orchestrator: given the discovered sources and the current content of
 * each (already inside `sources`), produce the consolidation plan.
 *
 *   - One `canonical` write: the single source of truth doc.
 *   - One `pointer` write per source that still carries original prose — its
 *     mcp-vertex block becomes a pointer, while the user's prose ABOVE the
 *     block is preserved verbatim (non-destruction).
 *
 * Idempotency / non-destruction guarantees:
 *   - A pointer-only source contributes no new pointer write (already done).
 *   - `computeHostInstructionsWrite(..., 'append')` replaces only the
 *     mcp-vertex block, never the user's prose, and is byte-stable on re-run.
 *   - When there is nothing to absorb (no sources with prose), the plan still
 *     emits the canonical doc (empty-absorb form) but no pointer writes.
 */
export const planInstructionConsolidation = (
	sources: readonly IDiscoveredInstructionSource[],
	canonicalRel: string = CANONICAL_AGENT_DOC_REL,
): IConsolidationPlan => {
	const canonicalBody = collapseToCanonicalBody(sources);
	const canonicalCurrent = sources.find(
		(s) => s.relPath === canonicalRel,
	)?.content;
	const canonicalContent = computeHostInstructionsWrite(
		canonicalCurrent,
		canonicalBody,
		'append',
	);
	const writes: IConsolidationWrite[] = [];
	if (canonicalContent !== undefined) {
		writes.push({
			relPath: canonicalRel,
			content: canonicalContent,
			role: 'canonical',
		});
	}
	for (const source of sources) {
		if (source.relPath === canonicalRel) continue;
		if (source.isPointerOnly) continue;
		const pointerBody = renderLegacyPointerBody(source.label, canonicalRel);
		const next = computeHostInstructionsWrite(
			source.content,
			pointerBody,
			'append',
		);
		if (next === undefined) continue;
		// Skip a no-op (already byte-identical) so re-runs add nothing.
		if (next === source.content) continue;
		writes.push({ relPath: source.relPath, content: next, role: 'pointer' });
	}
	return { sources, canonicalRel, writes };
};

/**
 * Convenience IO entry: discover + plan in one call. Stays advisory — it only
 * reads; the caller (the init writer) decides whether to commit the writes.
 */
export const buildInstructionConsolidationPlan = async (
	workspace: string,
	candidateRels: readonly string[],
	read: (
		workspace: string,
		relPath: string,
	) => Promise<string | undefined> = readHostInstructionsFile,
	canonicalRel: string = CANONICAL_AGENT_DOC_REL,
): Promise<IConsolidationPlan> => {
	const sources = await discoverInstructionSources(
		workspace,
		candidateRels,
		read,
	);
	return planInstructionConsolidation(sources, canonicalRel);
};
