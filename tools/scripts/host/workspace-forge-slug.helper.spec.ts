/**
 * workspace-forge-slug.helper.spec.ts — the host reads the forge of the
 * workspace it serves.
 */
import { describe, expect, it } from 'vitest';

import { forgeSlugOf, workspaceForgeSlug } from './workspace-forge-slug.helper';

describe('forgeSlugOf', () => {
	it('reads owner and name from ssh and https remotes', () => {
		expect(forgeSlugOf('git@github.com:Beateam/logistics-app.git\n')).toBe(
			'Beateam/logistics-app',
		);
		expect(forgeSlugOf('https://github.com/CartagoGit/DelendAI')).toBe(
			'CartagoGit/DelendAI',
		);
		expect(forgeSlugOf('ssh://git@github.com/acme/web.app.git')).toBe(
			'acme/web.app',
		);
	});

	it('reads any host, and nothing from what is not a remote URL', () => {
		expect(forgeSlugOf('git@gitlab.com:acme/web.git')).toBe('acme/web');
		expect(forgeSlugOf('ssh://git@localhost/acme/widgets.git')).toBe(
			'acme/widgets',
		);
		expect(
			forgeSlugOf('https://gitlab.example.com/group/sub/repo.git'),
		).toBe('sub/repo');
		expect(forgeSlugOf('')).toBeUndefined();
		expect(forgeSlugOf('/srv/git/repo.git')).toBeUndefined();
	});
});

describe('workspaceForgeSlug', () => {
	it("takes the workspace's own origin, and nothing when it has none", () => {
		expect(
			workspaceForgeSlug('/w', () => 'git@github.com:acme/web.git'),
		).toBe('acme/web');
		expect(
			workspaceForgeSlug('/w', () => {
				throw new Error('no origin');
			}),
		).toBeUndefined();
	});
});
