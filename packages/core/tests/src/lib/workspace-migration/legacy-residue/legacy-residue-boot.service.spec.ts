/**
 * legacy-residue-boot.service.spec.ts — the boot run: quiet when clean, one
 * line per change, once per machine, switchable off, never fatal.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ILegacyResidueIO } from '@delendai/core/lib/contracts/interfaces/legacy-residue.interface';
import {
	createUserFileIO,
	runLegacyResidueBoot,
	userStateDirectory,
} from '@delendai/core/lib/workspace-migration/legacy-residue/legacy-residue-boot.service';

const OLD = '{"mcpServers":{"mcp-vertex":{"command":"bun"}}}';
const STATE = '/h/.local/share/delendai/legacy-residue-state.json';

const memory = (files: Map<string, string>): ILegacyResidueIO => ({
	readText: async (path) => files.get(path),
	writeText: async (path, text) => {
		files.set(path, text);
	},
});

const boot = (
	files: Map<string, string>,
	extra: { env?: Record<string, string>; configText?: string } = {},
) =>
	runLegacyResidueBoot({
		workspaceRoot: '/w',
		home: '/h',
		platform: 'linux',
		env: extra.env ?? {},
		configText: extra.configText,
		io: memory(files),
		now: () => new Date('2026-11-12T10:00:00.000Z'),
	});

describe('the legacy residue boot run', () => {
	it('[<20ms] prints nothing on a clean machine and records the run', async () => {
		const files = new Map<string, string>();
		expect(await boot(files)).toEqual([]);
		expect(files.has(STATE)).toBe(true);
	});

	it('[<20ms] prints one line naming the entry, the file and the backup, then does not repeat', async () => {
		const files = new Map([['/h/.claude.json', OLD]]);
		const lines = await boot(files);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('mcp-vertex');
		expect(lines[0]).toContain('/h/.claude.json');
		expect(lines[0]).toContain('backup /h/.local/share/delendai/backups/');
		files.set('/h/.claude.json', OLD);
		expect(await boot(files)).toEqual([]);
		expect(files.get('/h/.claude.json')).toBe(OLD);
	});

	it('[<20ms] asks about a foreign entry once and records the question', async () => {
		const foreign =
			'{"mcpServers":{"mine":{"args":["/x/mcp-vertex/run.js"]}}}';
		const files = new Map([['/h/.claude.json', foreign]]);
		expect(await boot(files)).toHaveLength(1);
		expect(JSON.parse(files.get(STATE) ?? '{}').asked).toHaveLength(1);
		expect(files.get('/h/.claude.json')).toBe(foreign);
	});

	it('[<20ms] runs again when the recorded registry differs', async () => {
		const files = new Map([
			['/h/.claude.json', OLD],
			[STATE, '{"registry":"older","asked":[]}'],
		]);
		expect(await boot(files)).toHaveLength(1);
	});

	it('[<20ms] is off by the project key and by the machine variable', async () => {
		const byProject = new Map([['/h/.claude.json', OLD]]);
		expect(
			await boot(byProject, { configText: '{ "legacyResidue": false }' }),
		).toEqual([]);
		expect(byProject.get('/h/.claude.json')).toBe(OLD);
		const byUser = new Map([['/h/.claude.json', OLD]]);
		expect(
			await boot(byUser, { env: { DELENDAI_LEGACY_RESIDUE: '0' } }),
		).toEqual([]);
		expect(byUser.get('/h/.claude.json')).toBe(OLD);
	});

	it('[<20ms] reports an unreadable file, retries next boot, and never throws', async () => {
		const files = new Map([['/h/.claude.json', '{ not json']]);
		const lines = await boot(files);
		expect(lines[0]).toContain('was not migrated');
		expect(files.has(STATE)).toBe(false);
		const failing: ILegacyResidueIO = {
			readText: async () => {
				throw new Error('denied');
			},
			writeText: async () => undefined,
		};
		const skipped = await runLegacyResidueBoot({
			workspaceRoot: '/w',
			home: '/h',
			platform: 'linux',
			env: {},
			configText: undefined,
			io: failing,
			now: () => new Date(0),
		});
		expect(skipped[0]).toContain('skipped');
	});
});

describe('the real user file IO', () => {
	it('[<100ms] creates the directories a write needs and reads a missing file as absent', async () => {
		const root = await mkdtemp(join(tmpdir(), 'residue-io-'));
		try {
			const io = createUserFileIO();
			expect(await io.readText(join(root, 'none.json'))).toBeUndefined();
			await io.writeText(join(root, 'a', 'b', 'c.json'), 'x');
			expect(await readFile(join(root, 'a', 'b', 'c.json'), 'utf8')).toBe(
				'x',
			);
			expect(userStateDirectory('/h')).toBe('/h/.local/share/delendai');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('[<20ms] treats a damaged state record as no record', async () => {
		const files = new Map([
			['/h/.claude.json', OLD],
			[STATE, '{ damaged'],
		]);
		expect(await boot(files)).toHaveLength(1);
		const shaped = new Map([
			['/h/.claude.json', OLD],
			[STATE, '{"registry":1}'],
		]);
		expect(await boot(shaped)).toHaveLength(1);
	});
});
