/**
 * A compact, neutral pool of symbolic names for agents — including the
 * root orchestrator, not just subagents. Names are deterministic per
 * task seed so the same task gets the same name across runs, and the
 * picker spreads picks across the pool. Override it per project via the
 * config file (`plugins.proposals.options.namePool: string[]`).
 *
 * The default pool uses unique PascalCase English names for ancient empires,
 * kingdoms, city-states, and civilizations, with Carthage first. PascalCase
 * avoids spaces becoming branch separators during identity slugification.
 */
export const DEFAULT_AGENT_NAME_POOL: readonly string[] = [
	'Carthage',
	'Sumer',
	'Akkad',
	'Babylon',
	'Assyria',
	'Hittites',
	'Mitanni',
	'Elam',
	'Urartu',
	'Phoenicia',
	'Canaan',
	'Egypt',
	'Kush',
	'Meroe',
	'Minoans',
	'Mycenae',
	'Macedon',
	'Greece',
	'Sparta',
	'Athens',
	'Thrace',
	'Scythia',
	'Lydia',
	'Phrygia',
	'Persia',
	'Media',
	'Parthia',
	'Armenia',
	'Pontus',
	'Commagene',
	'Nabataea',
	'Palmyra',
	'Rome',
	'Etruria',
	'Dacia',
	'Illyria',
	'Gaul',
	'Celtiberia',
	'Lusitania',
	'Saba',
	'Himyar',
	'Axum',
	'Garamantes',
	'Maurya',
	'Kushan',
	'Gandhara',
	'Qin',
	'Han',
	'Zhou',
	'Shang',
	'Chu',
	'Yue',
	'Koguryo',
	'Yamato',
	'Xiongnu',
	'Khmer',
	'Champa',
	'Funan',
	'Teotihuacan',
	'Maya',
	'Zapotec',
	'Moche',
	'Nazca',
	'Tiwanaku',
	'Wari',
	'Olmec',
	'PtolemaicEgypt',
	'Selectucid',
	'AchaemenidPersia',
	'RomanEmpire',
	'Byzantium',
	'GothicKingdoms',
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
