import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	describeRetiredPresetMatch,
	migrateWorkspacePresetProvenance,
	resolvePresetForLaunch,
	migratePresetProvenance,
	resolveRetiredPreset,
} from '../../../../src/lib/plugins/preset-migration';
import {
	PRESET_MIGRATION_JOURNAL,
	RETIRED_PRESET_MEMBERS,
} from '../../../../src/lib/contracts/constants/preset-migration.constant';
import {
	resolvePresetMembers,
	RETIRED_PRESET_ID,
} from '../../../../src/lib/plugins/preset-catalog';

const mapOf = (plugins: readonly string[]) =>
	Object.fromEntries(plugins.map((plugin) => [plugin, {}]));

describe('preset migration', () => {
	const dirs: string[] = [];
	afterEach(async () => {
		await Promise.all(
			dirs
				.splice(0)
				.map((dir) => rm(dir, { recursive: true, force: true })),
		);
	});

	it('resolves every retired id to a replacement whose notice names it', () => {
		for (const id of RETIRED_PRESET_ID) {
			const resolved = resolveRetiredPreset(id);
			expect(resolved?.notice).toContain(`'${id}'`);
			expect(resolved?.notice).toContain(`'${resolved?.replacement}'`);
			expect(resolved?.members.length).toBeGreaterThan(0);
		}
		expect(resolveRetiredPreset('solo')).toBeUndefined();
		expect(resolveRetiredPreset(undefined)).toBeUndefined();
	});

	it('reports what standard carried that solo does not', () => {
		const resolved = resolveRetiredPreset('standard');
		expect(resolved?.replacement).toBe('solo');
		expect(resolved?.dropped).toContain('database');
		expect(resolved?.notice).toContain('database');
	});

	it('names the stack overlay for a stack pack', () => {
		expect(resolveRetiredPreset('cli-tool')?.notice).toContain(
			"'cli-tool' stack overlay",
		);
	});

	it('doctor line names the pack for an unchanged retired map only', () => {
		const lean = mapOf(RETIRED_PRESET_MEMBERS.lean ?? []);
		expect(describeRetiredPresetMatch(lean)).toContain("'solo'");
		expect(
			describeRetiredPresetMatch({ ...lean, perf: {} }),
		).toBeUndefined();
		expect(
			describeRetiredPresetMatch({ ...lean, docs: { enabled: false } }),
		).toBeUndefined();
	});

	it('journals a match once and leaves a changed map alone', async () => {
		const root = await mkdtemp(join(tmpdir(), 'preset-migration-'));
		dirs.push(root);
		const lean = mapOf(RETIRED_PRESET_MEMBERS.lean ?? []);
		const first = await migratePresetProvenance({ root, plugins: lean });
		const second = await migratePresetProvenance({ root, plugins: lean });
		expect(first.outcome).toBe('recorded');
		expect(second.outcome).toBe('unchanged');
		const lines = (
			await readFile(join(root, PRESET_MIGRATION_JOURNAL), 'utf8')
		)
			.trim()
			.split('\n');
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
			retired: 'lean',
			replacement: 'solo',
		});
		const changed = await migratePresetProvenance({
			root,
			plugins: { ...lean, perf: {} },
		});
		expect(changed.outcome).toBe('unchanged');
		expect(changed.match).toBeUndefined();
	});

	it('resolves a launch argument through the migration and prints the notice', () => {
		const lines: string[] = [];
		const members = resolvePresetForLaunch('lean', (line) => {
			lines.push(line);
		});
		expect(members).toEqual(resolveRetiredPreset('lean')?.members);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("preset 'lean' is deprecated, use 'solo'");
		const plain: string[] = [];
		expect(resolvePresetForLaunch('solo', (l) => plain.push(l))).toEqual(
			resolvePresetMembers('solo'),
		);
		expect(plain).toEqual([]);
	});

	it('runs at startup from the workspace config and journals it', async () => {
		const root = await mkdtemp(join(tmpdir(), 'preset-startup-'));
		dirs.push(root);
		await writeFile(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				plugins: mapOf(RETIRED_PRESET_MEMBERS['cli-tool'] ?? []),
			}),
		);
		const result = await migrateWorkspacePresetProvenance({
			workspace: root,
		});
		expect(result.outcome).toBe('recorded');
		expect(result.match?.retired).toBe('cli-tool');
		const none = await mkdtemp(join(tmpdir(), 'preset-startup-none-'));
		dirs.push(none);
		expect(
			(await migrateWorkspacePresetProvenance({ workspace: none }))
				.outcome,
		).toBe('unchanged');
	});
});
