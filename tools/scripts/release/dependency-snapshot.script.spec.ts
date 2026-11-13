/**
 * dependency-snapshot.script.spec.ts — the snapshot names what bun.lock
 * resolves, manifest by manifest.
 */
import { describe, expect, it } from 'vitest';

import {
	dependencySnapshot,
	parseBunLock,
	snapshotManifests,
} from './dependency-snapshot.script';

const LOCK = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "root",
      "devDependencies": {
        "@modelcontextprotocol/sdk": "1.32.0",
        "@delendai/core": "workspace:*",
      },
    },
    "apps/web": {
      "name": "web",
      "dependencies": {
        "zod": "^4.4.3",
        "left-pad": "^9.0.0",
      },
    },
  },
  "packages": {
    "@modelcontextprotocol/sdk": ["@modelcontextprotocol/sdk@1.32.0", "", {}, "sha512-x"],
    "@delendai/core": ["@delendai/core@workspace:packages/core"],
    "zod": ["zod@4.5.4", "", {}, "sha512-y"],
  },
}
`;

describe('dependency snapshot', () => {
	it('parses the lock despite its trailing commas', () => {
		expect(Object.keys(parseBunLock(LOCK).workspaces)).toEqual([
			'',
			'apps/web',
		]);
	});

	it('lists each external direct dependency at its resolved version, by manifest', () => {
		expect(snapshotManifests(parseBunLock(LOCK))).toEqual({
			'package.json': {
				name: 'package.json',
				file: { source_location: 'package.json' },
				resolved: {
					'@modelcontextprotocol/sdk': {
						package_url:
							'pkg:npm/%40modelcontextprotocol/sdk@1.32.0',
						relationship: 'direct',
						scope: 'development',
					},
				},
			},
			'apps/web/package.json': {
				name: 'apps/web/package.json',
				file: { source_location: 'apps/web/package.json' },
				resolved: {
					zod: {
						package_url: 'pkg:npm/zod@4.5.4',
						relationship: 'direct',
						scope: 'runtime',
					},
				},
			},
		});
	});

	it('wraps the manifests in the submission payload', () => {
		const payload = dependencySnapshot({
			lock: parseBunLock(LOCK),
			sha: 'abc',
			ref: 'refs/heads/main',
			runId: '7',
			scanned: '2026-10-23T00:00:00.000Z',
			repositoryUrl: 'https://forge.example/owner/repo',
		});
		expect(payload).toMatchObject({
			version: 0,
			sha: 'abc',
			ref: 'refs/heads/main',
			job: { id: '7' },
		});
		expect(Object.keys(payload.manifests)).toHaveLength(2);
	});
});
