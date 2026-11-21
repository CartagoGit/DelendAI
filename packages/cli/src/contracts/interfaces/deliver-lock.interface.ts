/** What a delivery may inject: where locks live, who it is, who is alive. */
export interface IDeliverLockOptions {
	readonly dir?: string;
	readonly pid?: number;
	readonly isAlive?: (pid: number) => boolean;
}

export type IDeliverLock =
	| { readonly held: true; readonly release: () => Promise<void> }
	| { readonly held: false; readonly pid: number };
