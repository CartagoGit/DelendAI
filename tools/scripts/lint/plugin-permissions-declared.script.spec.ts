import { describe, expect, it } from 'vitest';

import {
	declaredPermissions,
	findUndeclaredPermissions,
} from './plugin-permissions-declared.script';

describe('plugin permissions declared', () => {
	it('reads the permissions array out of a manifest', () => {
		expect(
			declaredPermissions(
				"export default { id: 'git', permissions: ['git-read', 'git-write'] };",
			),
		).toEqual(new Set(['git-read', 'git-write']));
	});

	it('treats a manifest with no permissions array as declaring nothing', () => {
		expect(declaredPermissions('export default { id: "x" };')).toEqual(
			new Set(),
		);
	});

	it('reports an effect the manifest does not declare', () => {
		// The real finding this gate was built for. `plugins/git` declared
		// `['git-read', 'git-write']` while spawning processes through
		// `node:child_process` — so a host showed a user "git: read +
		// write" for a plugin that could also run arbitrary commands. Both
		// halves of that check already existed in the repo; nothing
		// compared them.
		const findings = findUndeclaredPermissions({
			pluginId: 'git',
			declared: new Set(['git-read', 'git-write']),
			files: [
				{
					path: 'plugins/git/src/lib/services/git.ts',
					source: "import { execFile } from 'node:child_process';",
				},
			],
		});
		expect(findings).toEqual([
			{
				pluginId: 'git',
				permission: 'process',
				file: 'plugins/git/src/lib/services/git.ts',
				describe: 'imports node:child_process',
			},
		]);
	});

	it('says nothing when the effect is declared', () => {
		expect(
			findUndeclaredPermissions({
				pluginId: 'git',
				declared: new Set(['process']),
				files: [
					{
						path: 'a.ts',
						source: "import { execFile } from 'node:child_process';",
					},
				],
			}),
		).toEqual([]);
	});

	it('never fails on OVER-declaration', () => {
		// Asymmetric on purpose. A permission declared without visible
		// evidence is usually honest breadth — an injectable seam this
		// file-level heuristic cannot see — and failing on it would push
		// authors to under-declare to keep the gate quiet, which is the
		// opposite of what the gate exists for.
		expect(
			findUndeclaredPermissions({
				pluginId: 'quiet',
				declared: new Set(['process', 'network', 'secrets']),
				files: [{ path: 'a.ts', source: 'export const a = 1;' }],
			}),
		).toEqual([]);
	});

	it('honours a file-level waiver with a real reason', () => {
		expect(
			findUndeclaredPermissions({
				pluginId: 'x',
				declared: new Set(),
				files: [
					{
						path: 'a.ts',
						source: [
							'// permissions-declared-authorized: the string appears in a doc comment only',
							"// import { execFile } from 'node:child_process';",
						].join('\n'),
					},
				],
			}),
		).toEqual([]);
	});

	it('ignores a waiver marker with no reason behind it', () => {
		// Mirrors the repo's MIN_WAIVER_LENGTH convention: a waiver must
		// be a documented reason, not a TODO that silences the gate.
		const findings = findUndeclaredPermissions({
			pluginId: 'x',
			declared: new Set(),
			files: [
				{
					path: 'a.ts',
					source: [
						'// permissions-declared-authorized: TODO',
						"import { execFile } from 'node:child_process';",
					].join('\n'),
				},
			],
		});
		expect(findings.map((finding) => finding.permission)).toContain(
			'process',
		);
	});
});
