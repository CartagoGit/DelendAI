import { describe, expect, it } from 'vitest';

import { runArgv } from '../../../../src/lib/shared/run-command';

describe('runArgv stdin (x00169)', () => {
	// The default `stdio: ['ignore', ...]` closes stdin immediately — a
	// command shaped like `cat` (or `kubectl apply -f -`) reads EOF and
	// never sees anything the caller meant to pipe in.
	it('closes stdin when none is provided', async () => {
		const result = await runArgv(['cat']);
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('');
	});

	it('pipes the given stdin to the child process', async () => {
		const result = await runArgv(['cat'], { stdin: 'hello from x00169' });
		expect(result.code).toBe(0);
		expect(result.stdout).toBe('hello from x00169');
	});

	it('pipes stdin through a real shell round-trip (wc -c)', async () => {
		const payload = 'apiVersion: v1\nkind: Pod\n';
		const result = await runArgv(['wc', '-c'], { stdin: payload });
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe(String(payload.length));
	});
});
