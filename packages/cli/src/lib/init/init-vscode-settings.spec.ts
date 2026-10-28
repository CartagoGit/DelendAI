/**
 * init-vscode-settings.spec.ts — f00794 S4.
 *
 * `delendai.config.json` is JSONC by contract, so the editor has to be
 * told to treat it as JSONC instead of strict JSON — otherwise every
 * `//` in it is reported as a syntax error. The association lives in the
 * project's `.vscode/settings.json`, and that file belongs to the
 * project: every other key, every comment and the owner's own
 * formatting must survive the merge.
 *
 * Covered here:
 *
 *   1. A workspace without `.vscode/settings.json` gets one carrying the
 *      association.
 *   2. A workspace with one keeps every other key and every comment.
 *   3. Running it twice does not duplicate the association — and does
 *      not rewrite the file when nothing changed.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseJsonc } from '@delendai/core/cli';

import {
	mergeVscodeSettings,
	renderVscodeSettings,
} from './init-vscode-settings';
import { writeVscodeSettings } from './init-writers.factory';

describe('init vscode settings (f00794 S4)', () => {
	let workspace: string;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'delendai-vscode-settings-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('gives a fresh workspace a settings file with the association', async () => {
		const result = await writeVscodeSettings(workspace);
		expect(result.kind).toBe('written');
		const onDisk = await readFile(
			join(workspace, '.vscode/settings.json'),
			'utf8',
		);
		const parsed = parseJsonc(onDisk).value as {
			'files.associations'?: Record<string, string>;
		};
		expect(parsed['files.associations']?.['delendai.config.json']).toBe(
			'jsonc',
		);
	});

	it('keeps every other key and every comment of an existing settings file', async () => {
		await mkdir(join(workspace, '.vscode'), { recursive: true });
		const existing = [
			'{',
			"\t// The owner's own comment.",
			'\t"editor.formatOnSave": true,',
			'\t"files.associations": {',
			'\t\t// Their own association — preserved.',
			'\t\t"*.config.json": "jsonc"',
			'\t},',
			'\t"unknown.key": { "nested": [1, 2, 3] }',
			'}',
			'',
		].join('\n');
		await writeFile(
			join(workspace, '.vscode/settings.json'),
			existing,
			'utf8',
		);

		const result = await writeVscodeSettings(workspace);
		expect(result.kind).toBe('merged');
		const onDisk = await readFile(
			join(workspace, '.vscode/settings.json'),
			'utf8',
		);
		// The comments survive.
		expect(onDisk).toContain("// The owner's own comment.");
		expect(onDisk).toContain('// Their own association — preserved.');
		// Every other key survives, with its value.
		const parsed = parseJsonc(onDisk).value as Record<string, unknown>;
		expect(parsed['editor.formatOnSave']).toBe(true);
		expect(parsed['unknown.key']).toEqual({ nested: [1, 2, 3] });
		// The owner's own association survives, and ours is added.
		const associations = parsed['files.associations'] as Record<
			string,
			string
		>;
		expect(associations['*.config.json']).toBe('jsonc');
		expect(associations['delendai.config.json']).toBe('jsonc');
	});

	it('does not duplicate the association when it runs twice', async () => {
		const first = await writeVscodeSettings(workspace);
		expect(first.kind).toBe('written');
		const afterFirst = await readFile(
			join(workspace, '.vscode/settings.json'),
			'utf8',
		);

		const second = await writeVscodeSettings(workspace);
		expect(second.kind).toBe('merged');
		const afterSecond = await readFile(
			join(workspace, '.vscode/settings.json'),
			'utf8',
		);
		// Nothing changed, so nothing was rewritten.
		expect(afterSecond).toBe(afterFirst);
		const occurrences =
			afterSecond.split('"delendai.config.json"').length - 1;
		expect(occurrences).toBe(1);
	});

	it('refuses a settings file that cannot carry the association', () => {
		const refused = mergeVscodeSettings('{ not json');
		expect(refused.kind).toBe('refused');
		const notAnObject = mergeVscodeSettings('[1, 2, 3]');
		expect(notAnObject.kind).toBe('refused');
		const associationsNotAMap = mergeVscodeSettings(
			'{"files.associations": "nope"}',
		);
		expect(associationsNotAMap.kind).toBe('refused');
	});

	it('reports an unchanged document as unchanged', () => {
		const unchanged = mergeVscodeSettings(renderVscodeSettings());
		expect(unchanged.kind).toBe('unchanged');
	});
});
