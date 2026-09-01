import { definePluginManifest, TOKEN_BUDGETS } from '@mcp-vertex/core/public';

export default definePluginManifest({
	id: 'changelog',
	package: '@mcp-vertex/changelog',
	version: '0.1.1',
	visibility: 'private',
	summary: 'Conventional-commits changelog + release plan generator.',
	tags: ['changelog', 'release'],
	maturity: 'experimental',
	permissions: ['git-read'],
	// f00177 (MAN-001): `changelog` is `private: true` / never published to
	// npm (see `plugins/changelog/package.json`). It previously listed
	// `full`/`cli-tool` as member presets, which meant an external adopter
	// installing either preset outside this monorepo would get a config
	// entry pointing at a package that cannot resolve. `presets: []`
	// matches the existing `issues-triage` precedent for private plugins:
	// no preset advertises it; it stays reachable only via explicit
	// `--plugins=changelog` inside this monorepo where the workspace
	// package is directly resolvable. `lint:manifest-vs-presets`
	// (MANIFEST-PRESET-004) now fails the build if a private-visibility
	// manifest ever lists a preset again.
	presets: [],
	tokenBudget: TOKEN_BUDGETS.toolPayloads.search,
	dependencies: ['@mcp-vertex/core', 'zod'],
	capabilities: ['changelog', 'release'],
});
