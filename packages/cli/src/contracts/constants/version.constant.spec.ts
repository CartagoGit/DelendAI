import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CLI_VERSION } from './version.constant';

const manifest = (path: string): string =>
	(
		JSON.parse(readFileSync(join(import.meta.dirname, path), 'utf8')) as {
			readonly version: string;
		}
	).version;

describe('CLI_VERSION', () => {
	it('is the version the cli package publishes', () => {
		expect(CLI_VERSION).toBe(manifest('../../../package.json'));
	});

	it('is a semantic version, not the private root version', () => {
		expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
	});
});
