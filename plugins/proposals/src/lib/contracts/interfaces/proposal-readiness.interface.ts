/** The rule a readiness finding breaks. */
export type IReadinessRule =
	| 'files'
	| 'acceptance'
	| 'decisions'
	| 'depends-on'
	| 'shared-file';

/** One thing left to work out in a slice, with the text that shows it. */
export interface IReadinessFinding {
	readonly proposal: string;
	readonly slice: string;
	readonly rule: IReadinessRule;
	readonly text: string;
}

/** One slice as written, before any rule judges it. */
export interface IReadinessSlice {
	readonly id: string;
	readonly status: string;
	/** The Files field with its continuation lines, or undefined if absent. */
	readonly filesText: string | undefined;
	readonly acceptance: readonly string[];
	/** The Decisions field with its continuation lines, or undefined. */
	readonly decisions: string | undefined;
	/** The DependsOn ids as written, upper-cased. */
	readonly dependsOn: readonly string[];
}

/** What the rules need from the outside world. */
export interface IReadinessDeps {
	/** Whether a workspace-relative path exists in the tree. */
	readonly exists: (path: string) => boolean;
	/**
	 * Whether a `new:` path that already exists is a finding. The move to
	 * ready sets it: nothing is built yet. The lint leaves it off, because a
	 * unit that carries its proposal and its code together has built them.
	 */
	readonly newMustBeAbsent: boolean;
}
