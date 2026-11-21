/**
 * A status-bar tooltip written in Markdown: the host's `MarkdownString`, or a
 * value of its shape when the host gives no such class.
 */
export interface IStatusBarTooltip {
	readonly value: string;
	isTrusted?: boolean | undefined;
	supportThemeIcons?: boolean | undefined;
}
