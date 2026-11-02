import type { IDogmaAdapter } from '../contracts';

/**
 * f00051 / S11 — `dogma-policy.provider.ts`
 *
 * The Dependency-Inversion seam over dogma interpretation.
 * Tools depend on `IDogmaPolicyProvider`; the implementation
 * can swap between:
 *
 *   - "raw bullets"                — pass `bullets` through verbatim
 *   - "system-prompt interpolation" — render the dogma as a single
 *                                     string suitable for injection
 *                                     into the agent's working
 *                                     context (default today)
 *   - "tool-use hint"              — emit a structured tool-use
 *                                     hint (a future slice can drop
 *                                     in `ToolUseDogmaPolicyProvider`
 *                                     without touching the tools)
 *
 * Open/Closed: adding a new rendering policy = one new class
 * implementing this interface. The tools never change.
 *
 * Single Responsibility: this file knows how to *render* a
 * dogma into something the agent can use. It does NOT know
 * how to RESOLVE a dogma (`DogmaRegistry.resolve(language)`)
 * or how to MERGE a dogma with project config
 * (`IPolicyResolver`); those are separate seams.
 */

/**
 * The provider's input. The provider takes a resolved
 * `IDogmaAdapter` and the area it applies to, and produces
 * an agent-facing rendering.
 *
 * `area` is included so the renderer can tag the rendering
 * with the area name when it surfaces to the user; a future
 * markdown renderer can prefix a heading, a tool-use renderer
 * can attach it as metadata.
 */
export interface IDogmaPolicyRenderInput {
	readonly area: string;
	readonly language: string;
	readonly dogma: IDogmaAdapter;
}

/**
 * The Dependency-Inversion seam over dogma interpretation.
 * Every tool that surfaces a dogma to the LLM takes an
 * `IDogmaPolicyProvider` via constructor injection; the
 * implementation can be swapped without touching the tools.
 */
export interface IDogmaPolicyProvider {
	/** Stable identifier used by the host to choose the provider. */
	readonly id: 'string' | 'tool-use' | 'markdown' | (string & {});
	/** Render one dogma into an agent-facing representation. */
	render(input: IDogmaPolicyRenderInput): string;
}

/**
 * The default provider — render the dogma as a single
 * human-readable sentence suitable for system-prompt
 * interpolation.
 *
 * Format:
 *
 *   Rust idiom for "apps/cli": Prefer `?` over `unwrap()`;
 *   ownership is the borrow-checker; error model is Result;
 *   null safety is Option; naming is snake_case; async is
 *   none; testing is table-driven; package manager is cargo.
 *   Idiomatic do/don't: • Prefer `?` over `unwrap()` • Use
 *   `#[must_use]` on fallible builders • Keep borrow scopes
 *   small.
 *
 * The bullets section is what the agent quotes verbatim in
 * its output; the prefix sentence is the orientation the
 * agent keeps in working memory.
 */
export const StringDogmaPolicyProvider: IDogmaPolicyProvider = {
	id: 'string',
	render({ area, dogma }): string {
		const bullets =
			dogma.bullets.length === 0
				? ''
				: ` Idiomatic do/don't: ${dogma.bullets.map((b) => `• ${b}`).join(' ')}.`;
		return (
			`${capitalise(dogma.displayName ?? dogma.language)} idiom for "${area}": ` +
			`ownership is ${dogma.ownership}; ` +
			`error model is ${dogma.errorModel}; ` +
			`null safety is ${dogma.nullSafety}; ` +
			`naming is ${dogma.naming}; ` +
			`async is ${dogma.async}; ` +
			`testing is ${dogma.testing}; ` +
			`package manager is ${dogma.packageManager}.` +
			bullets
		);
	},
};

/**
 * Build the default provider set. Today only the string
 * provider ships; future `markdown` / `tool-use` providers
 * drop into the array. Exposed so the composition root can
 * construct a default provider without re-declaring the list.
 *
 * Open/Closed: a new provider = one new class + one entry
 * here. No other file changes.
 */
export const DEFAULT_DOGMA_POLICY_PROVIDERS: readonly IDogmaPolicyProvider[] = [
	StringDogmaPolicyProvider,
];

/**
 * Resolve the default provider by id. Returns the string
 * provider if no match — the resolver must always succeed
 * because dogmas are surfaced unconditionally, and a missing
 * provider would be a hard error in the tool hot path.
 */
export const resolveDefaultDogmaPolicyProvider = (
	id?: string,
): IDogmaPolicyProvider =>
	DEFAULT_DOGMA_POLICY_PROVIDERS.find((p) => p.id === id) ??
	StringDogmaPolicyProvider;

const capitalise = (s: string): string =>
	s.length === 0 ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
