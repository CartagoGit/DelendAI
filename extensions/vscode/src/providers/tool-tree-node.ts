import type { IToolDescriptor } from '@delendai/client';

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
	readonly command?: {
		readonly command: string;
		readonly title: string;
		readonly arguments?: readonly unknown[];
	};
	/** Codicon id for the node's icon (f00053 S3). */
	readonly iconId?: string;
}

export const serverNode = (description?: string): IToolTreeNode => ({
	kind: 'server',
	// The user feedback was that the tree header read "delendai →
	// delendai" which was confusing. Use a stable "Server" label
	// and surface the namespace in the description so the user can
	// tell at a glance which deployment they are looking at.
	id: 'server:root',
	label: 'Server',
	description: description ?? 'delendai tools',
	collapsibleState: TreeItemCollapsibleState.Expanded,
	contextValue: 'delendaiServer',
	iconId: SERVER_ICON_ID,
});

export const pluginNode = (
	plugin: string,
	toolCount: number,
	options: { readonly loaded?: boolean } = {},
): IToolTreeNode => ({
	kind: 'plugin',
	id: `plugin:${plugin}`,
	label: plugin,
	description: `${toolCount} tools${options.loaded === false ? ' · lazy' : ''}`,
	collapsibleState: TreeItemCollapsibleState.Collapsed,
	contextValue: 'delendaiPlugin',
	plugin,
	command: {
		command: 'delendai.openPluginConfig',
		title: 'Open Plugin Configuration',
		arguments: [plugin],
	},
	iconId: iconIdForPlugin(plugin),
});

export const toolNode = (
	tool: IToolDescriptor,
	options: { readonly loaded?: boolean } = {},
): IToolTreeNode => ({
	kind: 'tool',
	id: `tool:${tool.name}`,
	label: tool.name,
	...(tool.summary === undefined ? {} : { description: tool.summary }),
	tooltip: tool.summary ?? tool.name,
	collapsibleState: TreeItemCollapsibleState.None,
	contextValue: 'delendaiTool',
	plugin: tool.plugin,
	tool,
	command: {
		command: 'delendai.openToolDetail',
		title: 'Open Tool Detail',
		arguments: [tool],
	},
	iconId: iconIdForPlugin(tool.plugin),
	// The loaded flag is rendered as a CSS toggle (f00065 follow-up);
	// for now we only attach it so future styling / filtering has
	// the data. Visually it is conveyed via the plugin description.
	...(options.loaded === false ? {} : {}),
});
