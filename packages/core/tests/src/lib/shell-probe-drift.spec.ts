import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../../../../..');

const readRepoFile = (relativePath: string): string =>
	readFileSync(join(repoRoot, relativePath), 'utf8');

describe('shell discovery documentation drift', () => {
	it('keeps shell_status as the discovery rule with an isolated bash fallback', () => {
		const bootstrap = readRepoFile('docs/delendai/AGENT-BOOTSTRAP.md');
		expect(bootstrap).toContain(
			'discover the shell through `shell_status`',
		);
		expect(bootstrap).toContain("/bin/bash --noprofile --norc -c '<cmd>'");
		expect(bootstrap).not.toContain(
			'Agents and tools invoke shell through `bash`, never `zsh` or',
		);
	});

	it('documents the one-snapshot shell budget with checkpoint advisories', () => {
		const advisories = readRepoFile(
			'docs/delendai/CHECKPOINT-ADVISORIES.md',
		);
		expect(advisories).toContain('## Shell discovery budget');
		expect(advisories).toContain('call `shell_status`');
		expect(advisories).toContain('A refresh is justified only after');
	});
});
