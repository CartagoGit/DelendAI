import type { IToolEffect } from './protocol-vocabulary.interface';

// f00065 slice F re-exported this so importers keep their path; r00041 S4
// moved the declaration itself out of the core so a consumer without the
// server installed can still resolve it. See protocol-vocabulary.interface.
export type { IToolEffect };

/**
 * The `overview` tool's real response shape, as this client actually
 * consumes it.
 *
 * v00129 S1 (AUD-B01): `overview`'s WIRE-DECLARED `outputSchema` (what
 * `tools/list` advertises up front) is now deliberately a permissive
 * `compactOutputSchema()` to save ~4.2 KB/preset — see
 * `packages/core/src/lib/surface/compact-output-schema.ts`. That schema
 * is documentation for a caller deciding whether to call the tool, not
 * a type this client can safely derive its own internal contract from
 * any more (deriving it from the generated `DelendaiToolOutputs` type
 * used to work only because that type happened to mirror the full
 * shape; now it degrades to `{ ok?: boolean; [k: string]: unknown }`).
 * This interface is hand-kept in sync with `overview-tool.ts`'s actual
 * handler output instead — it describes what the server truly returns,
 * which has not changed.
 */
export interface IOverview {
	readonly server: { readonly name: string; readonly version: string };
	readonly namespacePrefix: string;
	readonly configIssues?: readonly string[];
	readonly pluginDiagnostic?: {
		readonly requested: readonly string[];
		readonly loaded: readonly string[];
		readonly missing: readonly string[];
		readonly missingReasons?: Readonly<Record<string, string>>;
		readonly configPlugins: readonly string[];
		readonly errors: number;
	};
	readonly plugins: ReadonlyArray<
		| string
		| {
				readonly name: string;
				readonly version?: string;
				readonly describe?: string;
		  }
	>;
	readonly tools:
		| ReadonlyArray<
				| string
				| {
						readonly name: string;
						readonly summary?: string;
						readonly tags?: readonly string[];
						readonly effects?: readonly IToolEffect[];
				  }
		  >
		| Readonly<Record<string, readonly string[]>>;
	readonly knowledge: ReadonlyArray<
		string | { readonly id: string; readonly title: string }
	>;
	readonly providers?: readonly unknown[];
	readonly activationReport?: unknown;
	readonly unusedActivePlugins?: readonly string[];
	readonly projectContext?: {
		readonly surfaceMode: 'managed' | 'native' | 'adaptive' | 'compact';
		readonly visibleToolCount: number;
		readonly hiddenToolCount: number;
		readonly loadedPluginCount: number;
		readonly loadedToolCount: number;
	};
	readonly recommendedNextAction: string;
}
/** Full-overview `tools` is an array of per-tool entries; compact `tools`
 *  is a record grouped by plugin. Extract the array branch so a single
 *  entry type stays meaningful. */
export type IOverviewToolList = Extract<IOverview['tools'], readonly unknown[]>;
/** Compact `tools`: `{ <plugin>: [stem, …], core: [stem, …] }`. */
export type IOverviewCompactTools = Exclude<
	IOverview['tools'],
	readonly unknown[]
>;
export type IOverviewTool = IOverviewToolList[number];
export type IOverviewKnowledge = IOverview['knowledge'][number];

export interface IToolDescriptor {
	readonly name: string;
	readonly plugin: string;
	readonly summary?: string;
	readonly tags: readonly string[];
	readonly effects: readonly IToolEffect[];
	/**
	 * Whether the tool is currently hot in the server (true) or
	 * registered-but-not-loaded (false). Populated from
	 * `tool_search.active`; defaults to true when the source omits the
	 * flag so legacy callers (compact overview) stay unaffected.
	 */
	readonly loaded?: boolean;
}

export interface IKnowledgeSummary {
	readonly id: string;
	readonly title: string;
}

export interface IKnowledgeEntry extends IKnowledgeSummary {
	readonly body: string;
}
