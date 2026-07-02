import type {
	McpVertexToolOutputs,
	IToolEffect,
} from '@mcp-vertex/core/public';

// f00065 slice F: `IToolEffect` is single-sourced in core; re-export it so this
// module's existing importers keep their import path.
export type { IToolEffect };

export type IOverview = McpVertexToolOutputs['mcp-vertex_overview'];
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
}

export interface IKnowledgeSummary {
	readonly id: string;
	readonly title: string;
}

export interface IKnowledgeEntry extends IKnowledgeSummary {
	readonly body: string;
}
