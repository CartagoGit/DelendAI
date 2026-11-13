/**
 * What a plugin last said about whether it can work in the workspace, as
 * the server's activation report carries it.
 */
export interface IPluginAvailabilityView {
	readonly state: string;
	readonly missing?: string;
	readonly fix?: string;
	readonly readAt?: string;
}
