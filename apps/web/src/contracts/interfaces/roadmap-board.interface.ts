/** The strings of the roadmap page, in one language. */
export interface IRoadmapBoardTranslations {
	readonly title: string;
	readonly lead: string;
	readonly intent: { readonly title: string; readonly body: string };
	readonly empty: string;
	readonly version: string;
	readonly bump: string;
	readonly bumpAuthority: string;
	readonly progress: string;
	readonly counts: {
		readonly delivered: string;
		readonly open: string;
		readonly withdrawn: string;
	};
	readonly states: Readonly<Record<string, string>>;
	readonly kinds: Readonly<Record<string, string>>;
	readonly estimate: string;
	readonly source: string;
}
