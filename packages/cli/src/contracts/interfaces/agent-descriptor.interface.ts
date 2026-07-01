/**
 * agent-descriptor.interface.ts — f00037 contract surface for
 * `lib/init/init-catalog.constant.ts`.
 *
 * `IAgentDescriptor` is the canonical projection of an entry in the
 * live `agent-catalog.generated.json`. The constant module
 * (init-catalog.constant.ts) keeps the FALLBACK_AGENTS_BY_LOCALE
 * table; this file owns the row shape so external consumers can type
 * their inputs without dragging the fallback table along.
 */

export type IAgentDescriptor = {
	readonly role: string;
	readonly description: string;
	readonly tools: readonly string[];
	readonly body: string;
};
