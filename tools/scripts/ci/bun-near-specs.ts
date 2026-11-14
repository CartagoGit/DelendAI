/**
 * bun-near-specs.ts — the bun-owned specs a change can affect.
 *
 * `test:sqlite` ran in full whenever a path under state or proposals code
 * changed, about two and a half minutes whatever the change. The proof now
 * runs under `bun test` only the bun-owned specs the near-spec selection
 * names (the touched specs and the specs reading a changed file, the rule
 * vitest follows), and the whole suite only when the bun runner itself
 * changed.
 */
import { BUN_OWNED_SPECS } from '../../../vitest.shared';

/** Files that make up the bun runner: its config, preload and spec list. */
export const BUN_RUNNER_FILES: readonly RegExp[] = [
	/^bunfig\.toml$/u,
	/^vitest\.shared\.ts$/u,
	/^tools\/scripts\/test\/bun-owned-/u,
];

/** How long a bun-owned spec may take, as `test:sqlite` allows it. */
const BUN_TEST_TIMEOUT_MS = '30000';

/** Whether `bun test` owns this spec; an entry ending in `/` owns what is under it. */
export const isBunOwned = (
	spec: string,
	owned: readonly string[] = BUN_OWNED_SPECS,
): boolean =>
	owned.some((entry) =>
		entry.endsWith('/') ? spec.startsWith(entry) : spec === entry,
	);

/** The selected specs, split by the runner that runs them. */
export const splitByRunner = (
	specs: readonly string[],
	owned: readonly string[] = BUN_OWNED_SPECS,
): { readonly vitest: readonly string[]; readonly bun: readonly string[] } => ({
	vitest: specs.filter((spec) => !isBunOwned(spec, owned)),
	bun: specs.filter((spec) => isBunOwned(spec, owned)),
});

/** Whether the change touches the bun runner's own config or setup. */
export const bunRunnerChanged = (changed: readonly string[]): boolean =>
	changed.some((path) => BUN_RUNNER_FILES.some((file) => file.test(path)));

/**
 * The command the proof runs for the bun-owned suite: all of it when the
 * runner changed, the near specs otherwise, nothing when none is near.
 */
export const bunSuiteCommand = (
	changed: readonly string[],
	bunSpecs: readonly string[],
): readonly string[] | undefined => {
	if (bunRunnerChanged(changed)) return ['bun', 'run', 'test:sqlite'];
	return bunSpecs.length === 0
		? undefined
		: ['bun', 'test', '--timeout', BUN_TEST_TIMEOUT_MS, ...bunSpecs];
};
