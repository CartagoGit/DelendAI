/**
 * bun-owned-preload.ts — `bun test` judges only the specs that are Bun's.
 *
 * This repository's specs run under vitest, except the ones
 * `BUN_OWNED_SPECS` names. Bun's runner imitates vitest well enough to
 * load the others, and not well enough to judge them: `vi.waitFor` and
 * friends behave differently, so a green spec can fail and a red one
 * pass. A reviewer who ran `bun test` once took those results for real.
 * Loaded through `bunfig.toml`'s `[test].preload`, this refuses every
 * other spec with the command that runs it.
 */
import { relative } from 'node:path';

import { plugin } from 'bun';

import { BUN_OWNED_SPECS } from '../../../vitest.shared';
import { repoRoot } from '../lib/repo-root';

const SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/u;

const isBunOwned = (path: string): boolean => {
	const fromRoot = relative(repoRoot(), path).replaceAll('\\', '/');
	return BUN_OWNED_SPECS.some((entry) =>
		entry.endsWith('/') ? fromRoot.startsWith(entry) : fromRoot === entry,
	);
};

plugin({
	name: 'bun-owned-specs-only',
	setup(build) {
		build.onLoad({ filter: SPEC }, async (args) => {
			if (!isBunOwned(args.path))
				throw new Error(
					`${relative(repoRoot(), args.path)} runs under vitest, not bun test: \`bun run test\`, or \`bunx vitest run ${relative(repoRoot(), args.path)}\` for this file. bun test judges only BUN_OWNED_SPECS (\`bun run test:sqlite\`).`,
				);
			return {
				contents: await Bun.file(args.path).text(),
				loader: args.path.endsWith('x') ? 'tsx' : 'ts',
			};
		});
	},
});
