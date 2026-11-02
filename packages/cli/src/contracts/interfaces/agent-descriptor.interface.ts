/**
 * agent-descriptor.interface.ts — f00037 contract surface for
 * `lib/init/init-catalog.constant.ts`.
 *
 * `IAgentDescriptor` is the canonical projection of an entry in the
 * live `agent-catalog.generated.json`. The constant module
 * (init-catalog.constant.ts) keeps the FALLBACK_AGENTS_BY_LOCALE
 * table; this file owns the row shape so external consumers can type
 * their inputs without dragging the fallback table along.
 *
 * x00202 S1: dropped `tools` — every renderer either never used it
 * (Claude/Codex, deliberately, per their own docblocks) or used it
 * unsafely (Copilot: emitted a bare, un-namespaced tool list straight
 * from this descriptor, at least one entry of which had already rotted
 * — `search_search` is not a real tool, `search` is). `body` is the
 * single source of tool guidance now, and it never hardcodes anything
 * beyond the one tool every delendai server guarantees: `overview`.
 */

export type IAgentDescriptor = {
	readonly role: string;
	readonly description: string;
	readonly body: string;
};
