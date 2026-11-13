export interface ILegacyResidueSnapshot {
	/** What the previous release emitted, as `kind:value`. */
	readonly names: readonly string[];
}

export type ILegacyResidueVerdict =
	| { readonly ok: true; readonly measured: string }
	| { readonly ok: false; readonly message: string };
