/**
 * skill-metadata-budget.spec.ts — a host keeps every skill's description in
 * its prompt on every turn, so each one stays short, and a skill names its
 * tools so a tool search can point at it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const MAX_DESCRIPTION_BYTES = 200;
const pluginsDir = join(import.meta.dirname, '../../../../../../plugins');

const skillFiles = readdirSync(pluginsDir).flatMap((plugin) => {
	try {
		return readdirSync(join(pluginsDir, plugin, 'skills')).map((skill) =>
			join(pluginsDir, plugin, 'skills', skill, 'SKILL.md'),
		);
	} catch {
		return [];
	}
});

describe('plugin skill metadata', () => {
	it('finds the skills', () => {
		expect(skillFiles.length).toBeGreaterThan(20);
	});

	it.each(skillFiles)('%s stays small and names its tools', (file) => {
		const front = readFileSync(file, 'utf8').split('---')[1] ?? '';
		const description = /^description:\s*(.*)$/mu.exec(front)?.[1] ?? '';
		expect(description.length).toBeGreaterThan(0);
		expect(Buffer.byteLength(description)).toBeLessThanOrEqual(
			MAX_DESCRIPTION_BYTES,
		);
		// A compatibility pointer explains no tool of its own.
		if (!description.startsWith('Thin pointer'))
			expect(front).toMatch(/^tools:/mu);
	});
});
