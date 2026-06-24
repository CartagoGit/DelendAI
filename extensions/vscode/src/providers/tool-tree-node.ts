import type { IToolDescriptor } from '@mcp-vertex/client';

import { SERVER_ICON_ID, iconIdForPlugin } from '../host/plugin-icons';

export enum TreeItemCollapsibleState {
	None = 0,
	Collapsed = 1,
	Expanded = 2,
}

export type ToolTreeNodeKind = 'server' | 'plugin' | 'tool';

export interface IToolTreeNode {
	readonly kind: ToolTreeNodeKind;
	readonly id: string;
	readonly label: string;
	readonly collapsibleState: TreeItemCollapsibleState;
	readonly description?: string;
	readonly tooltip?: string;
	readonly contextValue?: string;
	readonly plugin?: string;
	readonly tool?: IToolDescriptor;
	/** Codicon id for the node's icon (f00053 S3). */
	readonly iconId?: string;
}

export const serverNode = (): IToolTreeNode => ({
	kind: 'server',
	id: 'server:mcp-vertex',
	label: 'mcp-vertex',
	collapsibleState: TreeItemCollapsibleState.Expanded,
	contextValue: 'mcpVertexServer',
	iconId: SERVER_ICON_ID,
});

export const pluginNode = (
	plugin: string,
	toolCount: number,
): IToolTreeNode => ({
	kind: 'plugin',
	id: `plugin:${plugin}`,
	label: plugin,
	description: `${toolCount} tools`,
	collapsibleState: TreeItemCollapsibleState.Collapsed,
	contextValue: 'mcpVertexPlugin',
	plugin,
	iconId: iconIdForPlugin(plugin),
});

export const toolNode = (tool: IToolDescriptor): IToolTreeNode => ({
	kind: 'tool',
	id: `tool:${tool.name}`,
	label: tool.name,
	...(tool.summary === undefined ? {} : { description: tool.summary }),
	tooltip: tool.summary ?? tool.name,
	collapsibleState: TreeItemCollapsibleState.None,
	contextValue: 'mcpVertexTool',
	plugin: tool.plugin,
	tool,
	iconId: iconIdForPlugin(tool.plugin),
});
