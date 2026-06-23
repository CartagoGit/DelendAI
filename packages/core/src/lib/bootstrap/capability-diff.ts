// capability-diff: "what does THIS project need vs. what does it have?".
//
// The bootstrap blueprint (`build-blueprint.ts`) generates a fresh server
// from a greenfield assumption. In the real world the project already
// ships (or depends on) an MCP server, and the right move is to **augment
// it**, not replace it. This module is the seam that decides which tools
// are missing, which already exist under a different name, and which are
// candidates to be dropped.
//
// Design notes (f00051 S1):
// - Pure: takes an `IProjectAnalysis` + the namespaced tool ids the
//   existing server exposes; returns a structured diff. No filesystem,
//   no MCP, no `process.cwd()`.
// - The "existing tool set" is whatever the caller injects. Today the
//   bootstrap tool can read it from `mcp.json` (via `createMcpProject`
//   + `listTools`); tomorrow a host can pass an in-memory list from a
//   connected server. Either way, this module stays the same.
// - Mirrors the structure of `IProjectAnalysis.signals`: stable shape,
//   readable by both the LLM and a human reviewing the plan.

import type { IProjectAnalysis } from './analyze-project';
import type { IBlueprintArtifact, IServerBlueprint } from './build-blueprint';

/** Namespaced tool id, e.g. `acme_run_test`. */
export type IToolName = string;

export interface ICapabilityDiffEntry {
	readonly tool: IBlueprintArtifact;
	/** Why this tool is in this bucket (one short sentence). */
	readonly reason: string;
}

export interface ICapabilityDiff {
	readonly desired: readonly IToolName[];
	readonly existing: readonly IToolName[];
	/** In the blueprint, also exposed by the existing server (by id or alias). */
	readonly present: readonly ICapabilityDiffEntry[];
	/** In the blueprint, NOT exposed by the existing server. */
	readonly missing: readonly ICapabilityDiffEntry[];
	/** Exposed by the existing server but NOT in the blueprint (candidates for cleanup). */
	readonly extra: readonly IToolName[];
	/**
	 * Desired tool that the existing server exposes but with a description
	 * the project should review (different `summary` tag, different shape).
	 */
	readonly mismatched: readonly ICapabilityDiffEntry[];
	/** One-line summary the agent can read at a glance. */
	readonly summary: string;
}

const kebab = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const normaliseId = (tool: IBlueprintArtifact): IToolName =>
	`${kebab(tool.name).replace(/-/g, '_')}`;

const COMMON_VERB_PREFIXES = new Set([
	'run',
	'get',
	'fetch',
	'list',
	'show',
	'check',
	'render',
	'do',
	'make',
	'create',
	'delete',
	'update',
	'open',
	'close',
]);

const aliasCandidates = (id: string): readonly string[] => {
	const out: string[] = [id];
	const parts = id.split('_');
	const head = parts[0];
	if (head !== undefined && head !== id) out.push(head);
	// Strip a leading verb prefix so `run_test` aliases to `test` and
	// matches an existing `test_runner` / `test_exec` etc.
	if (
		parts.length > 1 &&
		head !== undefined &&
		COMMON_VERB_PREFIXES.has(head)
	) {
		const rest = parts.slice(1).join('_');
		if (rest !== id && !out.includes(rest)) out.push(rest);
	}
	return out;
};

/**
 * Diff `blueprint.tools` against the existing tool ids of a project.
 *
 * `existing` is whatever the caller discovered — a snapshot from
 * `<prefix>_list_tools` on the existing server, or a hand-typed list
 * for tests. Names are matched after the namespace prefix is stripped
 * so `acme_run_test` matches the blueprint entry `run_test`.
 */
export const diffCapabilities = (
	blueprint: Pick<IServerBlueprint, 'tools'>,
	existing: readonly IToolName[],
	options: { readonly namespacePrefix?: string } = {},
): ICapabilityDiff => {
	const prefix = options.namespacePrefix;
	const stripPrefix = (name: string): string =>
		prefix !== undefined && name.startsWith(`${prefix}_`)
			? name.slice(prefix.length + 1)
			: name;

	const existingIds = new Set(existing.map(stripPrefix));

	const present: ICapabilityDiffEntry[] = [];
	const missing: ICapabilityDiffEntry[] = [];
	const mismatched: ICapabilityDiffEntry[] = [];

	for (const tool of blueprint.tools) {
		const id = normaliseId(tool);
		const aliases = aliasCandidates(id);
		const matches = (alias: string): boolean =>
			[...existingIds].some(
				(existingId) =>
					existingId === alias || existingId.startsWith(`${alias}_`),
			);
		const presentAlias = aliases.find(matches);
		if (presentAlias !== undefined) {
			present.push({
				tool,
				reason: `present as ${prefix ?? ''}_${presentAlias}`.replace(
					/^_/,
					'',
				),
			});
			continue;
		}
		// No exact match. If a same-head alias exists, treat it as
		// "mismatched" so the agent reviews rather than scaffolds.
		const headHit = aliases.find((alias) => alias !== id && matches(alias));
		if (headHit !== undefined) {
			mismatched.push({
				tool,
				reason: `existing tool covers a related surface (${prefix ?? ''}_${headHit}); review instead of scaffolding`,
			});
		} else {
			missing.push({
				tool,
				reason: 'no existing tool covers this capability',
			});
		}
	}

	const desiredIds = new Set(blueprint.tools.map(normaliseId));
	const desiredAliases = new Set<string>();
	for (const tool of blueprint.tools) {
		for (const alias of aliasCandidates(normaliseId(tool))) {
			desiredAliases.add(alias);
		}
	}
	const extra = existing
		.map(stripPrefix)
		.filter((id) => !desiredIds.has(id) && !desiredAliases.has(id));

	const summary =
		missing.length === 0
			? `Coverage complete: ${present.length}/${blueprint.tools.length} tools present, 0 missing.`
			: `${missing.length} tool(s) missing, ${mismatched.length} need review, ${present.length} already present, ${extra.length} extra.`;

	return {
		desired: blueprint.tools.map(normaliseId),
		existing: [...existingIds],
		present,
		missing,
		mismatched,
		extra,
		summary,
	};
};

/**
 * Convenience: derive the existing tool set by reading `mcp.json` from
 * the project reader. This is best-effort: when the config is missing
 * or the server entry is opaque, returns an empty list. Real hosts that
 * can launch the existing server should pass a richer snapshot.
 */
export const existingToolsFromAnalysis = (
	analysis: IProjectAnalysis,
	reader: { readFile(relativePath: string): string | undefined },
): readonly IToolName[] => {
	for (const path of ['.vscode/mcp.json', 'mcp.json', '.cursor/mcp.json']) {
		const raw = reader.readFile(path);
		if (raw === undefined) continue;
		try {
			const parsed = JSON.parse(raw) as {
				servers?: Record<string, unknown>;
			};
			// Heuristic: if a server entry's `args` contains --plugins,
			// we can recover the plugin ids but NOT the tool names (they
			// are derived at runtime from each plugin's `register`).
			// So we return an empty list — the LLM will trigger
			// `<prefix>_list_tools` against the live server when it
			// needs exact ids. Returning [] here is correct because we
			// cannot lie about what we don't know.
			void parsed.servers;
			return [];
		} catch {
			return [];
		}
	}
	return [];
};
