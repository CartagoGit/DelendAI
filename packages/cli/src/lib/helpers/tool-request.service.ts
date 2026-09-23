/**
 * tool-request.service.ts — reach a tool the way the surface says to.
 *
 * ## What was broken
 *
 * `delendai search findMeHere` answered `MCP tool
 * "delendai_search_search" returned an error`, in a consumer project and
 * in this repository alike. The cause, which the message dropped:
 *
 *     MCP error -32602: Tool delendai_search_search not found
 *
 * The tool is registered — the catalog lists it with `pluginId: search` —
 * but the managed surface keeps plugin tools HIDDEN until something
 * activates them, so `tools/call` cannot see it. Asked through the
 * router's resolver instead, the same call succeeds and scans 5,542
 * files.
 *
 * So the CLI was reaching past the surface that decides what is
 * reachable, and every command whose tool is hidden failed the same way.
 *
 * ## The shape of the fix
 *
 * The CLI asks for a capability; the router decides how to reach it. The
 * direct call stays first — a visible tool costs one round trip — and a
 * `not found` is not an error to report but a statement that this tool
 * lives behind the resolver, which is exactly what the resolver is for.
 */
import type { IResolvedCapability } from '../../contracts/interfaces/tool-request.interface';

export type { IResolvedCapability } from '../../contracts/interfaces/tool-request.interface';

/**
 * The surface's way of saying "I will not call that one directly".
 *
 * It has two spellings and they mean the same thing operationally:
 * `not found` for a tool the managed surface hides, and `disabled` for
 * one it has switched off on this surface. Both were measured against the
 * live server: the resolver runs each of them without complaint, so
 * treating only the first as retryable left `metrics` and `scaffold`
 * broken while `search` worked.
 *
 * A bad argument shares the -32602 code and is NOT this: retrying that
 * through the resolver would hide a caller's mistake behind a second
 * failure.
 */
export const isUnexposedHere = (error: unknown): boolean => {
	const said = JSON.stringify(
		(error as { readonly result?: unknown }).result ?? '',
	);
	if (!/-32602/u.test(said)) return false;
	if (/unknown (argument|parameter)|invalid params/iu.test(said)) {
		return false;
	}
	return /\bnot found\b/iu.test(said) || /\bdisabled\b/iu.test(said);
};

/**
 * The router tool that reaches a hidden capability.
 *
 * Derived from the tool being asked for rather than hardcoded: both carry
 * the project's configured namespace prefix, so a project that renamed
 * its namespace gets its own resolver and not ours.
 */
export const resolverFor = (tool: string): string =>
	`${tool.split('_')[0] ?? 'delendai'}_resolve_capability`;

/** What the resolver returned, unwrapped, or a refusal that says why. */
export const unwrapResolved = <TOut>(
	tool: string,
	resolved: IResolvedCapability,
): TOut => {
	if (resolved.status !== 'ok') {
		throw new Error(
			`${tool} could not be resolved (${resolved.reason ?? 'unknown'}): ${
				resolved.detail ?? 'the resolver gave no detail.'
			}`,
		);
	}
	const text = resolved.result?.content?.[0]?.text;
	if (text === undefined) {
		throw new Error(
			`${tool} resolved but returned no payload the CLI can read.`,
		);
	}
	try {
		return JSON.parse(text) as TOut;
	} catch {
		// A tool may answer prose. Hand it back rather than pretending it
		// was JSON — the caller asked for this tool and knows its shape.
		return text as TOut;
	}
};
