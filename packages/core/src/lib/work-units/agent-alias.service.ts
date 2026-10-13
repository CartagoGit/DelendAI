/**
 * agent-alias.service.ts — one model signs one way.
 *
 * Five instances of one model worked as `minimax-3`, `minimax-m3`,
 * `MiniMax-M3`, `minimaxm3`, `minimaxm3-3` and `minimaxm3-batch`. Every
 * check that compares names — who holds a slice, who claimed a proposal,
 * whether a reviewer is independent of the implementer — took them for
 * different agents.
 *
 * The identities already at work are in the refs. A new one that is a
 * re-spelling of one of them — the same letters and digits in another
 * case or punctuation — is refused with the spelling to use.
 *
 * A trailing segment is NOT read as a counter: `claude-sonnet-5-5` is not
 * `claude-sonnet-5`, and `gpt-5-mini` is not `gpt-5`. A name cannot say
 * whether its last segment is a version or a copy number, so an instance
 * that appends one is caught by what the agent declares it is running,
 * not by guessing here.
 */

/** The letters and digits of an identity, in one case. */
const lettersOf = (agent: string): string =>
	agent.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');

/**
 * The identity already at work that `agent` re-spells, or `undefined`
 * when `agent` is one of them or is new.
 */
export const aliasedIdentity = (
	agent: string,
	known: readonly string[],
): string | undefined => {
	if (known.includes(agent)) return undefined;
	const letters = lettersOf(agent);
	return known.find((other) => lettersOf(other) === letters);
};

/** What an agent signing under another spelling is told. */
export const describeAlias = (agent: string, existing: string): string =>
	`\`${agent}\` is another spelling of \`${existing}\`, which already has work in this repository: one model signs one way, or every check that compares names takes it for two agents. Pass --agent=${existing}; a second instance of the same model is told apart by its session, not by its name.`;

/**
 * What two spellings of one model share: its words and its digits. A
 * single letter beside the digits and where the dots fall are what an
 * agent varies when it writes its own name from memory: `minimax-3.1`,
 * `minimax-m31`, `MiniMax M3.1`.
 */
const modelKey = (agent: string): string => {
	const tokens = agent.toLowerCase().match(/[a-z]+|\d+/gu) ?? [];
	const words = tokens.filter((token) => /^[a-z]{2,}$/u.test(token));
	const digits = tokens.filter((token) => /^\d+$/u.test(token)).join('');
	return `${words.join('-')}|${digits}`;
};

/**
 * The name the project first saw for the model `agent` reads as, when
 * `agent` is a later way of writing it; `undefined` when it is that name,
 * a model not seen before, or a name the project lists as its own.
 *
 * `seen` is every name that signed work here, oldest first: the agent
 * names itself, and the project holds a model to the first spelling it
 * signed with. Two models that really do differ by one letter (`gpt-4`,
 * `gpt-4o`) are told apart by the project listing both.
 */
export const firstSpelling = (
	agent: string,
	seen: readonly string[],
	listed: readonly string[] = [],
): string | undefined => {
	if (listed.includes(agent)) return undefined;
	const key = modelKey(agent);
	// A name with no digits has no version to be read two ways.
	if (key.endsWith('|')) return undefined;
	const first = seen.find((other) => modelKey(other) === key);
	return first === undefined || first === agent ? undefined : first;
};

/** What an agent signing as a later spelling of a model is told. */
export const describeFirstSpelling = (agent: string, first: string): string =>
	`\`${agent}\` reads as \`${first}\`, the name this model first signed work with here: the same maker, words and version digits, written another way. Pass --agent=${first}. If you are a different model, its exact name goes in \`development.coordination.roster\`, where a project lists models whose names differ this little.`;

/** The letters an identity starts with: its family, before any version. */
const familyOf = (agent: string): string =>
	/^[a-z]+/u.exec(agent.toLowerCase())?.[0] ?? '';

/**
 * What an agent that is not on the project's roster is told, or
 * `undefined` when it is on it or the project declares none.
 *
 * Spelling can be checked against the names already at work, and three
 * re-spellings still got past that in one swarm: a letter added, two
 * digits dropped, a tier the model did not have. Whoever launches the
 * agents knows what was launched. A project that says so is held to it:
 * the name on a ref, a claim or a verdict is one of the names it gave.
 */
export const describeOffRoster = (
	agent: string,
	roster: readonly string[],
): string | undefined => {
	if (roster.length === 0 || roster.includes(agent)) return undefined;
	const family = familyOf(agent);
	const nearest =
		family.length === 0
			? []
			: roster.filter((name) => familyOf(name) === family);
	const hint =
		nearest.length === 0
			? ''
			: ` If you are ${nearest.map((name) => `\`${name}\``).join(' or ')}, sign as that.`;
	return `\`${agent}\` is not on this project's roster (${roster.map((name) => `\`${name}\``).join(', ')}): the names here were given by whoever launched the agents, and a model's own account of itself is not one of them.${hint}`;
};
