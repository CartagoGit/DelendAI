/**
 * init-claude-settings.spec.ts — init gives a Claude Code project the
 * pre-edit hook, and keeps the person's own settings (x01003).
 */
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensurePreEditHook, mergePreEditHook } from './init-claude-settings';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const workspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'claude-settings-'));
	roots.push(root);
	return root;
};

describe('the Claude Code pre-edit hook', () => {
	it('writes it into a project with no settings', async () => {
		const root = workspace();
		const result = await ensurePreEditHook(root);
		expect(result.kind).toBe('written');
		const settings = JSON.parse(
			readFileSync(join(root, '.claude', 'settings.json'), 'utf8'),
		);
		expect(settings.hooks.PreToolUse[0].matcher).toBe(
			'Edit|MultiEdit|Write|NotebookEdit',
		);
		expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain(
			'guard pre-edit',
		);
	});

	it("adds it beside the person's own keys, comments and hooks, once", async () => {
		const root = workspace();
		mkdirSync(join(root, '.claude'));
		writeFileSync(
			join(root, '.claude', 'settings.json'),
			'{\n\t// mine\n\t"model": "x",\n\t"hooks": { "PreToolUse": [{ "matcher": "Bash", "hooks": [] }] }\n}\n',
		);
		expect((await ensurePreEditHook(root)).kind).toBe('written');
		const text = readFileSync(
			join(root, '.claude', 'settings.json'),
			'utf8',
		);
		expect(text).toContain('// mine');
		expect(text).toContain('"model": "x"');
		expect(text).toContain('"matcher": "Bash"');
		expect(text).toContain('guard pre-edit');
		expect(mergePreEditHook(text)).toBeUndefined();
		expect((await ensurePreEditHook(root)).kind).toBe('merged');
	});

	it('leaves a settings file it cannot read as it is', () => {
		expect(mergePreEditHook('{ not json')).toBeUndefined();
		expect(
			mergePreEditHook('{ "hooks": { "PreToolUse": {} } }'),
		).toBeUndefined();
	});
});
