/** What the roadmap panel reads of `roadmap_show`'s answer. */
export interface IRoadmapViewHorizon {
	readonly version: string;
	readonly bumpHint?: string | undefined;
	readonly counts: {
		readonly total: number;
		readonly delivered: number;
		readonly withdrawn: number;
		readonly open: number;
	};
	readonly entries: readonly {
		readonly id: string;
		readonly title: string;
		readonly kind: string;
		readonly state: string;
	}[];
}

export interface IRoadmapView {
	readonly file: string;
	readonly horizons: readonly IRoadmapViewHorizon[];
}
