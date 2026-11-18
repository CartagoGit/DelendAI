/**
 * A status-bar tooltip written in Markdown. It has the shape of the host's
 * `MarkdownString` (a `value` of Markdown source), which the host accepts as
 * a tooltip wherever it accepts a plain string.
 */
export interface IStatusBarTooltip {
	readonly value: string;
	readonly isTrusted: false;
	readonly supportThemeIcons: true;
}
