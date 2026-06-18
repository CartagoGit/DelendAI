/**
 * Host-provided knowledge served through the framework (catalogues,
 * conventions, operating modes). mcp-vertex stores and serves entries;
 * it never owns their content.
 */
export interface IKnowledgeEntry {
	readonly id: string;
	readonly title: string;
	readonly body: string;
}

/** Pointer to a host skill document on disk. */
export interface ISkillEntry {
	readonly id: string;
	/** Workspace-relative path to the skill markdown file. */
	readonly path: string;
}
