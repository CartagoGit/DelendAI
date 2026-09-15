/**
 * declared-branches.ts — the integration and release branches as the
 * workspace's development policy declares them.
 *
 * One reader for every script that acts on those branches, so none of
 * them hard-codes `develop` or `main` and none re-derives the policy by
 * hand. It resolves through core, so a job that runs one of its callers
 * needs `bun install` — `lint:workflow-runner-bootstrap` enforces that.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { repoRoot } from './repo-root';

export const declaredBranches = (
	root: string = repoRoot(),
): ReturnType<typeof resolveDevelopmentPolicy>['branches'] => {
	const config = JSON.parse(
		readFileSync(join(root, 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	return resolveDevelopmentPolicy({
		...(config.development === undefined
			? {}
			: { development: config.development }),
	}).branches;
};
