/** What a failed tool call left behind: a result, a thrown error, or an abort. */
export interface IToolFailureInput {
	readonly result?: unknown;
	readonly error?: unknown;
	readonly cancelled?: boolean;
}
