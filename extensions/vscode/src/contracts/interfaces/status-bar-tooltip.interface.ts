/**
 * A status-bar tooltip written in Markdown. The host adapter turns it into
 * the host's rich tooltip type; a plain string stays a plain tooltip.
 */
export interface IStatusBarTooltip {
	readonly markdown: string;
}
