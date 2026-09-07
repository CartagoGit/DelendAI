/**
 * A compact, neutral pool of symbolic names for agents — including the
 * root orchestrator, not just subagents. Names are deterministic per
 * task seed so the same task gets the same name across runs, and the
 * picker spreads picks across the pool. Override it per project via the
 * config file (`plugins.proposals.options.namePool: string[]`).
 *
 * The default pool uses capitalized English names for ancient empires,
 * kingdoms, city-states, and civilizations, with Carthage first.
 */
export const DEFAULT_AGENT_NAME_POOL: readonly string[] = [
	'Carthage',
	'Akkadian Empire',
	'Sumer',
	'Babylon',
	'Assyria',
	'Hittite Empire',
	'Mitanni',
	'Elam',
	'Urartu',
	'Phoenicia',
	'Canaan',
	'Israel',
	'Judah',
	'Aram',
	'Neo-Babylonian Empire',
	'Median Empire',
	'Achaemenid Empire',
	'Parthian Empire',
	'Ancient Egypt',
	'Old Kingdom Egypt',
	'Middle Kingdom Egypt',
	'New Kingdom Egypt',
	'Kingdom of Kush',
	'Meroe',
	'Punt',
	'Minoan Civilization',
	'Mycenaean Greece',
	'Macedon',
	'Thrace',
	'Scythia',
	'Lydia',
	'Phrygia',
	'Classical Greece',
	'Hellenistic Kingdoms',
	'Roman Republic',
	'Roman Empire',
	'Etruria',
	'Dacia',
	'Illyria',
	'Nabataea',
	'Palmyra',
	'Edom',
	'Moab',
	'Ammon',
	'Saba',
	'Himyar',
	'Dilmun',
	'Magan',
	'Axum',
	'Garamantes',
	'Maurya Empire',
	'Kushan Empire',
	'Qin Empire',
	'Han Empire',
	'Zhou Dynasty',
	'Shang Dynasty',
	'Chu Kingdom',
	'Yue Kingdom',
	'Koguryo',
	'Yamato Kingdom',
	'Armenian Kingdom',
	'Kingdom of Iberia',
	'Colchis',
	'Kingdom of Pontus',
	'Bosporan Kingdom',
	'Celtic Gaul',
	'Celtiberia',
	'Lusitania',
	'Thracian Kingdom',
	'Kingdom of Armenia',
	'Kingdom of Commagene',
	'Gandhara',
	'Nanda Empire',
	'Gupta Empire',
	'Kingdom of Mitanni',
	'Kingdom of Lydia',
	'Kingdom of Macedon',
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
