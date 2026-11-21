/** What a delivery may inject: where locks live, who it is, who is alive. */
export interface IDeliverLockOptions {
	readonly dir?: string;
	/** The unit's checkout, whose repository holds the lock when `dir` is not given. */
	readonly checkout?: string | undefined;
	readonly pid?: number;
	readonly isAlive?: (pid: number) => boolean;
}

export type IDeliverLock =
	| { readonly held: true; readonly release: () => Promise<void> }
	| { readonly held: false; readonly pid: number };
