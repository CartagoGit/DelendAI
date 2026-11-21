/** The version each registered format had when the snapshot was recorded. */
export interface IFormatCompatSnapshot {
	readonly versions: Readonly<Record<string, number>>;
}

export type IFormatCompatVerdict =
	| { readonly ok: true }
	| { readonly ok: false; readonly messages: readonly string[] };
