/**
 * plugin-fit.interface.ts — f00142 S1/S2: the contracts for the
 * `auto-plugin-selector` plugin's pure scorer and its MCP tool.
 *
 * The scorer is signal-driven: every recommendation cites the
 * signals that matched. The tool wires the bundled
 * `FIRST_PARTY_PLUGIN_INDEX` as the default catalog.
 */

import type { IFinding } from '@mcp-vertex/core/public';

/** A plugin the scorer can recommend from the catalog. */
export interface IPluginCandidate {
	readonly id: string;
	readonly tags: readonly string[];
	readonly summary: string;
	readonly origin?: 'first-party' | 'community' | undefined;
}

/** Project-shape signals that drive the scoring. */
export interface IProjectSignals {
	readonly pack:
		| 'generic'
		| 'javascript'
		| 'typescript'
		| 'python'
		| 'go'
		| 'rust'
		| 'mixed';
	readonly languages: readonly string[];
	readonly hasDocsSite?: boolean | undefined;
	readonly isCliTool?: boolean | undefined;
	readonly hasBackend?: boolean | undefined;
	readonly hasTests?: boolean | undefined;
	readonly taskHint?: string | undefined;
}

/** One ranked fit: a plugin + score + reasons + unmatched tags. */
export interface IPluginFit {
	readonly plugin: IPluginCandidate;
	/** Normalized 0..1 fit score; top plugin always 1.0. */
	readonly fitScore: number;
	/** Signal ids that contributed (sorted). */
	readonly reasons: readonly string[];
	/** Catalog tags that did NOT match anything in the signals. */
	readonly unmatchedTags: readonly string[];
}

/** Options that influence aggregation / filtering. */
export interface IRecommendPluginsOptions {
	/** Cap on returned fits (defaults to `candidates.length`). */
	readonly limit?: number | undefined;
	/** Drop fits below this normalized score (defaults to 0). */
	readonly minScore?: number | undefined;
}