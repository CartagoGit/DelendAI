/**
 * tool-envelope.ts — the single builder for the proposals plugin's
 * error-envelope tool results. Every tool that returns `isError: true`
 * with a JSON envelope (close_slice, proposal_transition, …) uses this
 * instead of hand-rolling the `content`/`structuredContent` shape, so a
 * change to the wire shape lands in exactly one place.
 */
export const toolErrorEnvelope = <T>(
	envelope: T,
): {
	content: Array<{ type: 'text'; text: string }>;
	structuredContent: T;
	isError: true;
} => ({
	content: [{ type: 'text', text: JSON.stringify(envelope) }],
	structuredContent: envelope,
	isError: true,
});
