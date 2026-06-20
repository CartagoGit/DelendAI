import type { McpVertexToolOutputs } from '@mcp-vertex/core/public';

export type IOverview = McpVertexToolOutputs['mcp-vertex_overview'];
export type IOverviewTool = IOverview['tools'][number];
export type IOverviewKnowledge = IOverview['knowledge'][number];
export type IToolEffect = 'write' | 'spawn' | 'network' | 'destructive';

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
