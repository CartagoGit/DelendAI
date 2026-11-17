import { describe, expect, it } from 'vitest';

import { checkPreset } from './preset.check';

const run = (text: string | undefined) =>
	checkPreset({
		workspace: '/ws',
		now: () => new Date(0),
		fs: {
			fileExists: async () => text !== undefined,
			readFile: async () => text,
			listDirs: async () => [],
		},
	});

const plugins = (ids: readonly string[]) =>
	JSON.stringify({ plugins: Object.fromEntries(ids.map((id) => [id, {}])) });

describe('checkPreset', () => {
	it('names the pack that replaces a retired preset the map still equals', async () => {
		const section = await run(plugins(['docs', 'git', 'memory', 'search']));
		expect(section.name).toBe('preset');
		expect(section.status).toBe('warn');
		expect(section.findings.join(' ')).toContain("'lean'");
		expect(section.findings.join(' ')).toContain("'solo'");
	});

	it('is ok when the map matches no retired preset', async () => {
		const section = await run(plugins(['git', 'search']));
		expect(section.status).toBe('ok');
	});

	it('is ok without a config or a plugin map', async () => {
		expect((await run(undefined)).status).toBe('ok');
		expect((await run('{}')).status).toBe('ok');
		expect((await run('{ not json')).status).toBe('ok');
	});
});
