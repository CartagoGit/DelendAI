/**
 * Shared tool-response helpers. All tools should return COMPACT JSON
 * (no pretty-printing) to minimise tokens, and a consistent envelope
 * so any agent or model handles success and failure the same way:
 *
 * - success: `{ ok: true, ...data }`
 * - failure: `{ ok: false, error: { reason, nextAction? } }` + `isError`
 */
export interface IToolTextResult {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    /**
     * Machine-readable mirror of the text payload (MCP modern
     * `structuredContent`). Modern clients read this directly instead of
     * re-parsing the text. Only set for object payloads — the MCP type is
     * an object map, so arrays/primitives stay text-only.
     */
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    [key: string]: unknown;
}
/**
 * Compact JSON text result (no envelope). Use for raw structured data.
 * Object payloads are also surfaced as `structuredContent` so modern MCP
 * clients consume them without re-parsing the text.
 */
export declare const toolJson: (value: unknown) => IToolTextResult;
/** Compact success envelope: `{ ok: true, ...data }`. */
export declare const toolOk: (data?: Record<string, unknown>) => IToolTextResult;
/** Compact, uniform error envelope with an actionable hint. */
export declare const toolError: (reason: string, nextAction?: string) => IToolTextResult;
