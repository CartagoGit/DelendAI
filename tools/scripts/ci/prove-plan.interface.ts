/**
 * prove-plan.interface.ts — one job of the zone matrix, as the prove
 * script reads it.
 */
export interface IProveJob {
	readonly name: string;
	readonly paths: string;
	readonly shard: string;
	readonly run: boolean;
	/** `changed`, `readers`, `all` or `none`: what the job runs. */
	readonly filter: string;
	/** The specs a `readers` job runs, space-separated. */
	readonly readers: string;
}
