/**
 * init.command.spec.ts — where `init` learns which environment variables
 * matter, and the one thing it must never do to learn them.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IEnvRequirement } from '@delendai/env/public';

import type { IEnvWarningSources } from '../../contracts/interfaces/env-warning.interface';
import { readEnvWarningFindings } from './init.command';

let workspace: string;

beforeEach(() => {
	// No `.env` at all: every required variable is missing.
	workspace = mkdtempSync(join(tmpdir(), 'init-env-warning-'));
});

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true });
});

const requirement = (plugin: string, name: string): IEnvRequirement => ({
	var: name,
	plugin,
	capability: `${plugin} capability`,
	required: true,
});

/** Sources that record every probe, so "never imported" is observable. */
const recording = (
	catalog: Readonly<Record<string, readonly IEnvRequirement[]>>,
	probed: Readonly<Record<string, readonly IEnvRequirement[]>> = {},
): { readonly sources: IEnvWarningSources; readonly probes: string[] } => {
	const probes: string[] = [];
	return {
		probes,
		sources: {
			catalogued: (name) => catalog[name],
			probe: async (name) => {
				probes.push(name);
				return probed[name] ?? [];
			},
		},
	};
};

describe('readEnvWarningFindings', () => {
	it('never imports a catalogued plugin to learn its requirements', async () => {
		// The whole of v00137: this lookup used to import every enabled
		// plugin's runtime, 37 of them, to read static metadata.
		const { sources, probes } = recording({
			database: [requirement('database', 'DATABASE_URL')],
			git: [],
		});

		const findings = await readEnvWarningFindings(
			workspace,
			['env', 'database', 'git'],
			undefined,
			sources,
		);

		expect(probes).toEqual([]);
		// Namespaced by the env plugin; its header comment names the rule
		// without the prefix, which is the form this assertion first used.
		expect(findings.map((finding) => finding.ruleId)).toContain(
			'env/missing-required',
		);
		expect(findings.map((finding) => finding.message).join('\n')).toContain(
			'DATABASE_URL',
		);
	});

	it('still asks a plugin the catalog does not know', async () => {
		// A third-party plugin in an adopter's workspace: the catalog
		// cannot answer for it, so its warning must still appear.
		const { sources, probes } = recording(
			{},
			{ 'acme-billing': [requirement('acme-billing', 'ACME_API_KEY')] },
		);

		const findings = await readEnvWarningFindings(
			workspace,
			['env', 'acme-billing'],
			'/host/entry.ts',
			sources,
		);

		expect(probes).toEqual(['acme-billing']);
		expect(findings.map((finding) => finding.message).join('\n')).toContain(
			'ACME_API_KEY',
		);
	});

	it('reports nothing for catalogued plugins that need nothing', async () => {
		const { sources, probes } = recording({ git: [], docs: [] });

		expect(
			await readEnvWarningFindings(
				workspace,
				['env', 'git', 'docs'],
				undefined,
				sources,
			),
		).toEqual([]);
		expect(probes).toEqual([]);
	});

	it('asks nobody when the env plugin is not loaded', async () => {
		const { sources, probes } = recording(
			{},
			{ database: [requirement('database', 'DATABASE_URL')] },
		);

		expect(
			await readEnvWarningFindings(
				workspace,
				['database'],
				undefined,
				sources,
			),
		).toEqual([]);
		expect(probes).toEqual([]);
	});
});

describe('readEnvWarningFindings, asking plugins the catalog does not know', () => {
	/**
	 * A host checkout with third-party plugin sources, as an adopter's
	 * workspace has: `package.json` plus `plugins/<name>/src/index.ts`.
	 * No injected sources — this is the real import path.
	 */
	const hostWithPlugins = (
		plugins: Readonly<Record<string, string>>,
	): string => {
		const host = join(workspace, 'host');
		writeFileSync(join(workspace, 'placeholder'), '');
		mkdirSync(join(host, 'plugins'), { recursive: true });
		writeFileSync(join(host, 'package.json'), '{"name":"host"}');
		for (const [name, source] of Object.entries(plugins)) {
			mkdirSync(join(host, 'plugins', name, 'src'), { recursive: true });
			writeFileSync(
				join(host, 'plugins', name, 'src', 'index.ts'),
				source,
			);
		}
		return join(host, 'bin', 'entry.ts');
	};

	it('imports an uncatalogued plugin and reports the variable its schema declares', async () => {
		// A zod-shaped object, not zod itself: the fixture lives outside
		// the workspace's node_modules, and the extractor walks `shape`.
		const entry = hostWithPlugins({
			'acme-billing': `export default { optionsSchema: { shape: { apiKey: { description: 'Acme billing key env:ACME_API_KEY' } } } };\n`,
			'acme-quiet': 'export default {};\n',
			'acme-no-default': 'export const helper = 1;\n',
		});

		const findings = await readEnvWarningFindings(
			workspace,
			[
				'env',
				'acme-billing',
				'acme-quiet',
				'acme-no-default',
				'acme-missing',
			],
			entry,
		);

		const text = findings.map((finding) => finding.message).join('\n');
		expect(text).toContain('ACME_API_KEY');
		expect(findings).toHaveLength(1);
	});

	it('finds nothing to import without a host entry', async () => {
		expect(
			await readEnvWarningFindings(workspace, ['env', 'acme-missing']),
		).toEqual([]);
	});
});
