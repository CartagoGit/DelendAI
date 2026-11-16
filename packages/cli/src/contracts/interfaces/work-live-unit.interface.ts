/** What a work ref names. */
export interface ILiveUnitIdentity {
	readonly agent: string;
	readonly kind: string;
	readonly proposal: string;
	readonly slice: string;
	readonly generation: number;
	readonly topic?: string | undefined;
}

export interface ILiveUnit extends ILiveUnitIdentity {
	readonly ref: string;
	readonly worktree: string | null;
}
