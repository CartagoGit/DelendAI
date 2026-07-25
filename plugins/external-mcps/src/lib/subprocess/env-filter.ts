export interface IBuildSafeEnvInput {
	readonly entry: {
		readonly env?: Readonly<Record<string, string>> | undefined;
	};
	readonly hostEnv: Readonly<Record<string, string | undefined>>;
	readonly requiredKeys?: readonly string[] | undefined;
	readonly optionalKeys?: readonly string[] | undefined;
}

export type BuildSafeEnvResult =
	| { readonly ok: true; readonly env: Readonly<Record<string, string>> }
	| {
			readonly ok: false;
			readonly code: 'missing-env';
			readonly missing: readonly string[];
	  };

const BASE_ALLOW_LIST = [
	'PATH',
	'HOME',
	'TMPDIR',
	'TMP',
	'LANG',
	'LC_ALL',
	'TERM',
	'SHELL',
] as const;

const pushResolvedHostValue = (
	result: Record<string, string>,
	hostEnv: Readonly<Record<string, string | undefined>>,
	key: string,
): void => {
	const value = hostEnv[key];
	if (value !== undefined) result[key] = value;
};

const collectUniqueMissing = (
	missing: readonly string[],
): readonly string[] => {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const name of missing) {
		if (seen.has(name)) continue;
		seen.add(name);
		unique.push(name);
	}
	return unique;
};

export const buildSafeEnv = (input: IBuildSafeEnvInput): BuildSafeEnvResult => {
	const env: Record<string, string> = {};
	for (const key of BASE_ALLOW_LIST) {
		pushResolvedHostValue(env, input.hostEnv, key);
	}

	const missing: string[] = [];
	const entryEnv = input.entry.env;
	const optionalKeys = new Set(input.optionalKeys ?? []);

	for (const key of input.requiredKeys ?? []) {
		const value = input.hostEnv[key];
		if (value === undefined) {
			missing.push(key);
			continue;
		}
		env[key] = value;
	}

	for (const key of input.optionalKeys ?? []) {
		pushResolvedHostValue(env, input.hostEnv, key);
	}

	if (entryEnv !== undefined) {
		for (const [key, rawValue] of Object.entries(entryEnv)) {
			if (!rawValue.startsWith('$')) {
				env[key] = rawValue;
				continue;
			}

			const hostKey = rawValue.slice(1);
			const hostValue = input.hostEnv[hostKey];
			if (hostValue !== undefined) {
				env[key] = hostValue;
				continue;
			}
			if (!optionalKeys.has(hostKey) && !optionalKeys.has(key)) {
				missing.push(hostKey);
			}
		}
	}

	const uniqueMissing = collectUniqueMissing(missing);
	if (uniqueMissing.length > 0) {
		return { ok: false, code: 'missing-env', missing: uniqueMissing };
	}

	return { ok: true, env };
};
