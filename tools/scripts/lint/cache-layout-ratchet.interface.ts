export interface ICacheLayoutRatchetSnapshot {
	readonly epoch: number;
	readonly checksum: string;
}

export type ICacheLayoutRatchetVerdict =
	| { readonly ok: true }
	| { readonly ok: false; readonly message: string };
