/**
 * Optional online freshness check: when enabled (`--rules-online=true` or
 * the plugin option `online: true`), look up the npm registry for the
 * package that actually publishes each framework's recommended ESLint
 * setup, so an agent can see whether OUR vendored preset (offline,
 * hand-curated, always available) has drifted from the upstream
 * version/homepage. Never throws and never blocks: a network failure
 * just means no online reference for that area — the offline preset
 * (which always wins when the project itself has no config) is
 * unaffected either way.
 */

/** Minimal HTTP GET abstraction so tests never hit the real network. */
export type IOnlineFetcher = (url: string) => Promise<{
	readonly ok: boolean;
	readonly status: number;
	readonly body: string;
}>;

const FETCH_TIMEOUT_MS = 5_000;

/** Default fetcher: the platform's `fetch`, with a hard timeout. */
export const defaultOnlineFetcher: IOnlineFetcher = async (url) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, { signal: controller.signal });
		return { ok: res.ok, status: res.status, body: await res.text() };
	} catch {
		return { ok: false, status: 0, body: '' };
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Preset id → the npm package that publishes that framework's actual
 * recommended ESLint setup (what our hand-curated `eslintConfigContent`
 * is modelled on). Presets with no canonical upstream package (plain
 * vanilla JS/TS, PHP/Pint — a different registry) are omitted on purpose.
 */
export const ONLINE_PACKAGE_BY_PRESET: Readonly<Record<string, string>> = {
	angular: 'angular-eslint',
	'react-ts': 'eslint-plugin-react',
	'react-js': 'eslint-plugin-react',
	vue: 'eslint-plugin-vue',
	svelte: 'eslint-plugin-svelte',
	jquery: 'eslint-plugin-react', // no jQuery-specific lint package; n/a in practice
	'next-ts': 'eslint-config-next',
	remix: 'eslint-plugin-react',
	nuxt: '@nuxt/eslint',
	astro: 'eslint-plugin-astro',
	'solid-ts': 'eslint-plugin-solid',
};

export type IOnlinePresetInfo =
	| {
			readonly ok: true;
			readonly package: string;
			readonly version: string;
			readonly homepage?: string;
	  }
	| { readonly ok: false; readonly package: string; readonly reason: string };

interface INpmLatestMetadata {
	readonly version?: string;
	readonly homepage?: string;
}

/**
 * Fetch the latest published version + homepage for a preset's upstream
 * package from the npm registry. `{ ok: false }` covers every failure
 * mode (no online package for this preset, network down, non-2xx,
 * malformed JSON) with a short `reason` — never throws.
 */
export const fetchOnlinePresetInfo = async (
	presetId: string,
	fetcher: IOnlineFetcher = defaultOnlineFetcher,
): Promise<IOnlinePresetInfo> => {
	const pkg = ONLINE_PACKAGE_BY_PRESET[presetId];
	if (pkg === undefined) {
		return {
			ok: false,
			package: '',
			reason: `no online package mapped for preset "${presetId}"`,
		};
	}
	const res = await fetcher(`https://registry.npmjs.org/${pkg}/latest`);
	if (!res.ok) {
		return {
			ok: false,
			package: pkg,
			reason: `registry lookup failed (status ${res.status})`,
		};
	}
	try {
		const meta = JSON.parse(res.body) as INpmLatestMetadata;
		if (typeof meta.version !== 'string') {
			return {
				ok: false,
				package: pkg,
				reason: 'registry response had no version',
			};
		}
		return {
			ok: true,
			package: pkg,
			version: meta.version,
			...(typeof meta.homepage === 'string'
				? { homepage: meta.homepage }
				: {}),
		};
	} catch {
		return {
			ok: false,
			package: pkg,
			reason: 'registry response was not valid JSON',
		};
	}
};
