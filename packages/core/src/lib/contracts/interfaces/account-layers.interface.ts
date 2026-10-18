/** Where a person's accounts are read, and the layer each account came from. */
export interface IAccountLayersReport {
	/** The person's file for this project, outside the repository. */
	readonly personalLayer: string;
	readonly layers: readonly {
		readonly accountId: string;
		readonly layer: 'shared' | 'personal';
	}[];
}
