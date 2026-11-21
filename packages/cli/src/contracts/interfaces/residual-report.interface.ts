/** What `migrate status` says of the old identity left in live files. */
export interface IResidualReport {
	readonly live: number;
	readonly hits: readonly {
		readonly file: string;
		readonly line: number;
		readonly spelling: string;
	}[];
}
