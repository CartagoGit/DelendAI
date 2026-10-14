/**
 * change-context-reader.helper.ts — context-for-change's sections for a
 * task's files, read through that plugin's own public entry and options.
 * Imported only when it is asked for, so an install without the plugin
 * never loads it.
 */

/** Bytes of change context a delegated step may reference by default. */
const CHANGE_CONTEXT_MAX_BYTES = 24_000;

type IChangeContextModule = {
	readonly runContextForChange: (
		args: { readonly files: string[] },
		options: {
			readonly namespacePrefix: string;
			readonly workspaceRootAbs: string;
			readonly maxBytes: number;
			readonly memoryStorePath?: string;
		},
	) => Promise<unknown>;
};

/** A reader of the sections context-for-change gathers for some files. */
export const changeContextReader =
	(input: {
		readonly workspaceRoot: string;
		readonly namespacePrefix: string;
		/** context-for-change's own options, as the project configures them. */
		readonly options: Readonly<Record<string, unknown>>;
		readonly load?: () => Promise<IChangeContextModule>;
	}) =>
	async (
		files: readonly string[],
	): Promise<
		readonly { readonly source: string; readonly summary: string }[]
	> => {
		const load =
			input.load ??
			(async () =>
				(await import(
					'@delendai/context-for-change/public'
				)) as IChangeContextModule);
		const { runContextForChange } = await load();
		const { maxBytes, memoryStorePath } = input.options;
		const result = await runContextForChange(
			{ files: [...files] },
			{
				namespacePrefix: input.namespacePrefix,
				workspaceRootAbs: input.workspaceRoot,
				maxBytes:
					typeof maxBytes === 'number'
						? maxBytes
						: CHANGE_CONTEXT_MAX_BYTES,
				...(typeof memoryStorePath === 'string'
					? { memoryStorePath }
					: {}),
			},
		);
		const sections = (
			result as { structuredContent?: { sections?: unknown } }
		).structuredContent?.sections;
		return Array.isArray(sections)
			? (sections as readonly { source: string; summary: string }[])
			: [];
	};
