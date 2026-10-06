/** Types for `./generate-docs-index.script`. */

/** One guide, as the index lists it. */
export interface IDocEntry {
	/** Repository-relative path. */
	readonly path: string;
	/** Its `# ` heading, or the filename when it has none. */
	readonly title: string;
	/** The blockquote or first sentence under the heading, trimmed. */
	readonly summary: string;
}

/** What `--check` found. */
export interface IDocsIndexOutcome {
	readonly rendered: string;
	readonly changed: boolean;
}
