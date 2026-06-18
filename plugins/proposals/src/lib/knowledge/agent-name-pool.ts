/**
 * A compact, neutral pool of symbolic names for agents — including the
 * root orchestrator, not just subagents. Names are deterministic per
 * task seed so the same task gets the same name across runs, and the
 * picker spreads picks across the pool. Override it per project via the
 * config file (`plugins.proposals.options.namePool: string[]`).
 *
 * Kept deliberately small (constellations) to stay low-token; a project
 * that wants its own flavour supplies its own list.
 */
export const DEFAULT_AGENT_NAME_POOL: readonly string[] = [
	'andromeda',
	'aquila',
	'aries',
	'auriga',
	'bootes',
	'carina',
	'cassiopeia',
	'centaurus',
	'cetus',
	'columba',
	'corvus',
	'cygnus',
	'draco',
	'eridanus',
	'fornax',
	'gemini',
	'hydra',
	'indus',
	'lacerta',
	'lepus',
	'lyra',
	'mensa',
	'norma',
	'orion',
	'pavo',
	'perseus',
	'phoenix',
	'pictor',
	'pyxis',
	'sagitta',
	'scorpius',
	'sculptor',
	'serpens',
	'taurus',
	'tucana',
	'vela',
	'virgo',
	'volans',
];

/** Small, stable string hash → non-negative integer. */
export const hashSeed = (seed: string): number => {
	let hash = 0;
	for (let index = 0; index < seed.length; index += 1) {
		hash = (hash * 31 + seed.charCodeAt(index)) | 0;
	}
	return Math.abs(hash);
};

/**
 * Pick the first free name from the pool, starting at a seed-derived
 * offset so the choice is deterministic and spread out. Returns
 * undefined when every name is excluded (pool exhausted).
 */
export const pickFromPool = (
	pool: readonly string[],
	exclude: ReadonlySet<string>,
	seed: string,
): string | undefined => {
	if (pool.length === 0) return undefined;
	const start = hashSeed(seed) % pool.length;
	for (let offset = 0; offset < pool.length; offset += 1) {
		const candidate = pool[(start + offset) % pool.length];
		if (candidate !== undefined && !exclude.has(candidate))
			return candidate;
	}
	return undefined;
};
