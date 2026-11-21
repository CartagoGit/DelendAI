export interface ISafeMcpFrame {
	readonly file: string;
	readonly line?: number | undefined;
	readonly col?: number | undefined;
	readonly fn?: string | undefined;
}
