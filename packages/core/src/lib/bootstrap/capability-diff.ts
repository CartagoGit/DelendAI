// capability-diff: "what does THIS project need vs. what does it have?".
//
// SOLID — Single Responsibility. After the refactor this file is a
// THIN COMPOSER. The five things it used to do are now owned by
// dedicated modules:
//   - id normalisation  → capability-normalize.ts
//   - alias generation  → alias-strategy.ts (IAliasStrategy)
//   - bucket assignment → tool-classifier.ts (IExistingToolsMatcher)
//   - result aggregation → capability-diff-views.ts
//   - existing-tool discovery → existing-tools-source.ts
//
// The only thing left here is the pipeline that wires them together
// and the public `diffCapabilities` entry point.

import type { IProjectAnalysis } from './analyze-project';
import type { IBlueprintArtifact, IServerBlueprint } from './build-blueprint';
import { canonicalToolId } from './capability-normalize';
import type { ICanonicalToolId } from './capability-normalize';
import { DefaultAliasStrategy } from './alias-strategy';
import type { IAliasStrategy } from './alias-strategy';
import { DefaultExistingToolsMatcher } from './tool-classifier';
import type {
	IExistingToolsMatcher,
	IToolClassification,
} from './tool-classifier';
import {
	buildCapabilityViews,
	formatCoverageSummary,
} from './capability-diff-views';
import type {
	IReasonedEntry,
	ICapabilityDiffViews,
} from './capability-diff-views';
import { StaticExistingToolsSource } from './existing-tools-source';
import type { IExistingToolsSource } from './existing-tools-source';

/** Namespaced tool id, e.g. `acme_run_test`. */
export type IToolName = string;

export type { ICapabilityDiffViews as ICapabilityDiff } from './capability-diff-views';

export interface IDiffOptions {
	readonly namespacePrefix?: string;
	/** Inject a custom alias strategy (defaults to `DefaultAliasStrategy`). */
	readonly aliasStrategy?: IAliasStrategy;
	/** Inject a custom existing-tools matcher. */
	readonly matcher?: IExistingToolsMatcher;
	/**
	 * Inject a custom source for the existing tool set. Defaults to
	 * `StaticExistingToolsSource` wrapping the `existing` argument;
	 * pass a smarter source (e.g. one that calls `<prefix>_list_tools`
	 * on a live server) when available.
	 */
	readonly source?: IExistingToolsSource;
}

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
	options: IDiffOptions = {},
): ICapabilityDiffViews => {
	const prefix = options.namespacePrefix;
	const strategy = options.aliasStrategy ?? new DefaultAliasStrategy();
	const matcher = options.matcher ?? new DefaultExistingToolsMatcher();
	const source =
		options.source ??
		new StaticExistingToolsSource({
			raw: existing,
			...(prefix !== undefined ? { namespacePrefix: prefix } : {}),
		});

	const existingIds = source.canonicalSet();
	const present: IReasonedEntry[] = [];
	const missing: IReasonedEntry[] = [];
	const mismatched: IReasonedEntry[] = [];

	for (const tool of blueprint.tools) {
		const canonical = canonicalToolId(tool.name, prefix);
		const aliases = strategy.aliasesFor(canonical, { raw: tool.name });
		const result: IToolClassification = matcher.classify({
			tool,
			canonical,
			raw: tool.name,
			aliases,
			existing: existingIds,
		});
		switch (result.kind) {
			case 'present':
				present.push({
					name: tool.name,
					description: tool.description,
					reason: `present as ${prefix ?? ''}_${result.matchedAs}`.replace(
						/^_/,
						'',
					),
					tool,
				});
				break;
			case 'mismatched':
				mismatched.push({
					name: tool.name,
					description: tool.description,
					reason: `existing tool covers a related surface (${prefix ?? ''}_${result.existingHead}); review instead of scaffolding`,
					tool,
				});
				break;
			case 'missing':
				missing.push({
					name: tool.name,
					description: tool.description,
					reason: 'no existing tool covers this capability',
					tool,
				});
				break;
		}
	}

	const desired = blueprint.tools.map(
		(tool) => canonicalToolId(tool.name, prefix) as ICanonicalToolId,
	);

	const views = buildCapabilityViews({
		desired,
		existing: [...existingIds],
		present,
		missing,
		mismatched,
		extra: collectExtra(blueprint.tools, existingIds, strategy, prefix),
	});

	return {
		...views,
		summary: formatCoverageSummary(views),
	};
};

/**
 * Tools the existing server exposes that the blueprint does not need.
 * Pure: derived from the desired-alias set + the existing id set.
 */
const collectExtra = (
	blueprintTools: readonly IBlueprintArtifact[],
	existing: ReadonlySet<ICanonicalToolId>,
	strategy: IAliasStrategy,
	prefix: string | undefined,
): readonly ICanonicalToolId[] => {
	const desiredAliases = new Set<ICanonicalToolId>();
	for (const tool of blueprintTools) {
		const canonical = canonicalToolId(tool.name, prefix);
		for (const alias of strategy.aliasesFor(canonical, {
			raw: tool.name,
		})) {
			desiredAliases.add(alias);
		}
	}
	return [...existing].filter((id) => {
		if (desiredAliases.has(id)) return false;
		for (const alias of desiredAliases) {
			if (id.startsWith(`${alias}_`)) return false;
		}
		return true;
	});
};

/**
 * Convenience: derive the existing tool set by reading `mcp.json` from
 * the project reader. Best-effort: when the config is missing or the
 * server entry is opaque, returns an empty list. Hosts that can launch
 * the existing server should pass a richer snapshot.
 */
export const existingToolsFromAnalysis = async (
	_analysis: IProjectAnalysis,
	reader: {
		readFile(
			relativePath: string,
		): string | undefined | Promise<string | undefined>;
	},
): Promise<readonly IToolName[]> => {
	for (const path of ['.vscode/mcp.json', 'mcp.json', '.cursor/mcp.json']) {
		const raw = await reader.readFile(path);
		if (raw === undefined) continue;
		try {
			const parsed = JSON.parse(raw) as {
				servers?: Record<string, unknown>;
			};
			void parsed.servers;
			return [];
		} catch {
			return [];
		}
	}
	return [];
};

// Re-export the strategies and the views builder so consumers have a
// single import surface without reaching into sub-modules.
export {
	CompositeAliasStrategy,
	DefaultAliasStrategy,
} from './alias-strategy';
export type { IAliasContext, IAliasStrategy } from './alias-strategy';
export { DefaultExistingToolsMatcher } from './tool-classifier';
export type {
	IClassificationContext,
	IExistingToolsMatcher,
	IToolClassification,
} from './tool-classifier';
export { StaticExistingToolsSource } from './existing-tools-source';
export type { IExistingToolsSource } from './existing-tools-source';
export {
	buildCapabilityViews,
	formatCoverageSummary,
} from './capability-diff-views';
export type {
	IReasonedEntry,
	ICapabilityDiffViews,
	IPresentView,
	IMissingView,
	IMismatchedView,
	IExtraView,
	IDesiredView,
	IBuildViewsInput,
} from './capability-diff-views';
