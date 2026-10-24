import type {
	IDesignToken,
	ISelectorGraph,
	IStyleProfile,
} from './selector-graph.interface';

/** A project's styles, read: the profile, the graph and the tokens. */
export interface IStyleWorkspace {
	readonly profile: IStyleProfile;
	readonly graph: ISelectorGraph;
	readonly tokens: readonly IDesignToken[];
	/** The installed major of the utility framework, when there is one. */
	readonly utilityMajor: number | undefined;
	/** The text of a workspace file, or nothing when it cannot be read. */
	readonly read: (path: string) => Promise<string | undefined>;
}

/** What every style tool is built from. */
export interface IStyleToolOptions {
	readonly namespacePrefix: string;
	/** The project's styles as they are when the call runs. */
	readonly workspace: () => Promise<IStyleWorkspace>;
}
