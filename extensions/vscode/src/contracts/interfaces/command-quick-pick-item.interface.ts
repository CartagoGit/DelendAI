/** Minimal object-item shape returned by VS Code's `showQuickPick(items)`. */
export interface ICommandQuickPickItem {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly detail?: string;
}
