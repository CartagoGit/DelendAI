/**
 * output-parser.interface.ts — the one capability the tool-result
 * boundary needs from a tool's output schema: parse a value and report
 * whether it conforms, with the parsed data.
 *
 * Zod schemas satisfy it directly; a raw shape of zod fields is wrapped
 * in `z.object` first, the same normalisation the MCP SDK applies.
 */
export interface IOutputParser {
	readonly safeParse: (value: unknown) => {
		readonly success: boolean;
		readonly data?: unknown;
	};
}
