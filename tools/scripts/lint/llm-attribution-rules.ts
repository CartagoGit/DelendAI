/**
 * llm-attribution-rules.ts — f00500 S5/S8, shared detection policy.
 *
 * ONE definition of "does this text attribute work to an LLM?", consumed by
 * both enforcement points:
 *
 *  - `tools/scripts/lint/no-llm-attribution.script.ts` refuses NEW commits
 *    and staged files that carry LLM attribution.
 *  - `tools/scripts/git/rewrite-llm-attribution.script.ts` strips the
 *    attribution already recorded in history.
 *
 * They existed as two copies of the same regexes for exactly as long as it
 * took to notice that a guard and a cleaner disagreeing about what counts as
 * a violation is how attribution survives a cleanup: the rewriter misses
 * what the linter would have caught, the linter then passes the result, and
 * the leak looks fixed. One module, one answer.
 */

const LLM_PHRASES: ReadonlyArray<readonly string[]> = [
	// claude
	['claude', 'opus'],
	['claude', 'sonnet'],
	['claude', 'haiku'],
	['claude', 'fable', '5'],
	['claude', 'fable'],
	['claude', 'minimax', 'm3'],
	['claude', 'chat'],
	['claude', 'm3'],
	['claude', '4'],
	['claude', '5'],
	['claude', '3'],
	// The product name, not a model name. It is what the "Generated with"
	// footer actually says — 29 pull requests on this repository carry
	// `Generated with [Claude Code]` and none of them named a model, so a
	// rule that only knew model names saw every one of them as clean.
	['claude', 'code'],
	['github', 'copilot'],
	// minimax
	['minimax', 'm3'],
	['minimax', 'opus'],
	['minimax', 'sonnet'],
	['minimax', 'haiku'],
	['minimax', 'pro'],
	['minimax', 'mini'],
	// gpt
	['gpt', '3'],
	['gpt', '4'],
	['gpt', '5'],
	['gpt', '4o'],
	['gpt', '5o'],
	['chatgpt'],
	// gemini
	['gemini', '1'],
	['gemini', '2'],
	['gemini', '3'],
	['gemini', 'pro'],
	['gemini', 'ultra'],
	['gemini', 'flash'],
	// copilot
	['copilot', 'minimax', 'm3'],
	['copilot', 'minimax'],
	['copilot', 'gpt'],
	['copilot', 'claude'],
	['copilot', 'gemini'],
	// codex
	['codex', 'gpt', '5'],
	['codex', 'gpt'],
	['codex', 'minimax'],
	['codex', 'claude'],
	// grok
	['grok', '1'],
	['grok', '2'],
	['grok', '3'],
	['grok', '4'],
	// llama
	['llama', '2'],
	['llama', '3'],
	['llama', '4'],
	// mistral
	['mistral', '7b'],
	['mistral', '8x7b'],
	['mixtral'],
	// qwen
	['qwen', '2'],
	['qwen', '3'],
	// deepseek
	['deepseek', 'v1'],
	['deepseek', 'v2'],
	['deepseek', 'v3'],
];

const LLM_DOMAINS: ReadonlyArray<string> = [
	'anthropic.com',
	'claude.com',
	'claude.ai',
	'openai.com',
	'minimax.ai',
	'minimax.local',
	'users.noreply.github.com',
	// Synthetic / placeholder LLM emails used in this repo's history
	'copilot@local',
	'copilot@anthropic',
	'copilot@minimax',
];

// Header names that count as an "attribution" trailer. Git's trailer
// convention is case-insensitive but always Title-Cased on output, so we
// accept both shapes.
const TRAILER_KEY =
	/^(?:co-?authored-by|signed-off-by|generated-?with|generated-?by|reviewed-?by|thanked|helped-?by)$/iu;

// "Generated with X" / "Built with X" / "🤖 Generated with X" preambles.
// We extract the model name(s) after "with/using/by" and check the resulting
// tokens against the LLM_PHRASES list.
const GENERATED_PREAMBLE =
	/^\s*(?:🤖\s*)?(?:generated|written|built|crafted|created|produced)\s+(?:with|by|using)\s+(.+)$/iu;

const tokenize = (value: string): readonly string[] =>
	value
		.toLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter((t) => t.length > 0);

const matchesLlmPhrase = (
	tokens: readonly string[],
): readonly string[] | null => {
	for (const phrase of LLM_PHRASES) {
		// Look for the phrase as a contiguous subsequence
		for (let i = 0; i + phrase.length <= tokens.length; i++) {
			let ok = true;
			for (let j = 0; j < phrase.length; j++) {
				if (tokens[i + j] !== phrase[j]) {
					ok = false;
					break;
				}
			}
			if (ok) return phrase;
		}
	}
	return null;
};

const ALPHANUMERIC = /[a-z0-9]/u;
const DOMAIN_CONTINUES = /[a-z0-9.-]/u;

/**
 * Where `domain` occurs as a whole domain in `value`: after the start, an
 * `@` or any other non-alphanumeric character, and not followed by more
 * domain (`anthropic.community`, `anthropic.com.example.org`).
 *
 * Plain string search, not a RegExp built from the domain: the list is
 * data, and the boundary checks read clearer as two character tests than
 * as an escaped pattern.
 */
const containsDomain = (value: string, domain: string): boolean => {
	for (
		let at = value.indexOf(domain);
		at !== -1;
		at = value.indexOf(domain, at + 1)
	) {
		const before = value[at - 1];
		const after = value[at + domain.length];
		if (
			(before === undefined || !ALPHANUMERIC.test(before)) &&
			(after === undefined || !DOMAIN_CONTINUES.test(after))
		) {
			return true;
		}
	}
	return false;
};

const matchesLlmDomain = (value: string): string | null => {
	const lower = value.toLowerCase();
	for (const domain of LLM_DOMAINS) {
		if (containsDomain(lower, domain)) return domain;
	}
	return null;
};

/** Tokenize a trailer/identity value the way the phrase matcher expects. */
export const tokenizeAttribution = tokenize;

/**
 * The LLM phrase this value names, or `null` when it names none.
 *
 * A bare "claude" is deliberately NOT a phrase: a human called Claude Smith
 * must still be creditable. "claude opus" is.
 */
export const llmPhraseIn = (value: string): readonly string[] | null =>
	matchesLlmPhrase(tokenize(value.replace(/[<>"'`]+/gu, ' ')));

/** The LLM-only mail domain this value uses, or `null`. */
export const llmDomainIn = (value: string): string | null =>
	matchesLlmDomain(value);

/** True when the value names an LLM by phrase or by an LLM-only domain. */
export const mentionsLlm = (value: string): boolean =>
	llmPhraseIn(value) !== null || llmDomainIn(value) !== null;

export { LLM_PHRASES, LLM_DOMAINS, TRAILER_KEY, GENERATED_PREAMBLE };
