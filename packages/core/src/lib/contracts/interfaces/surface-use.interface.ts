/**
 * How much of the tool surface served this session was used: the bytes
 * of every tool definition `tools/list` served, summed over every list,
 * and the part of them belonging to tools invoked at least once. A tool
 * never served — reached through the router — is not in either number.
 */
export interface ISurfaceUse {
	readonly listsServed: number;
	readonly servedBytes: number;
	readonly usefulBytes: number;
	/** `usefulBytes / servedBytes`; absent until a list was served. */
	readonly usefulTokensRatio?: number;
}
