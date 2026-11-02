import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ISecretSources } from '../../../src/lib/contracts/interfaces/secret-resolver.interface';
import {
	hostSecretSources,
	resolveSecrets,
} from '../../../src/lib/secret-resolver.service';

const sources = (
	env: Record<string, string>,
	files: Record<string, string> = {},
): ISecretSources => ({
	env,
	readFile: async (path) => {
		const content = files[path];
		if (content === undefined) throw new Error('ENOENT');
		return content;
	},
});

describe('resolveSecrets', () => {
	it('resolves env references, optionally from another host variable', async () => {
		const resolved = await resolveSecrets(
			[
				{ kind: 'env', name: 'TOKEN' },
				{ kind: 'env', name: 'DB', from: 'HOST_DB_PASS' },
			],
			sources({ TOKEN: 'tok-1234', HOST_DB_PASS: 'pw-5678' }),
		);
		expect(resolved.values).toEqual({ TOKEN: 'tok-1234', DB: 'pw-5678' });
		expect(resolved.names).toEqual(['TOKEN', 'DB']);
	});

	it('resolves file references and drops one trailing newline', async () => {
		const resolved = await resolveSecrets(
			[{ kind: 'file', name: 'KEY', path: '/run/secrets/key' }],
			sources({}, { '/run/secrets/key': 'filesecret\n' }),
		);
		expect(resolved.values).toEqual({ KEY: 'filesecret' });
	});

	it('resolves ssh-agent-forward from SSH_AUTH_SOCK', async () => {
		const resolved = await resolveSecrets(
			[{ kind: 'ssh-agent-forward' }],
			sources({ SSH_AUTH_SOCK: '/tmp/agent.1' }),
		);
		expect(resolved.agentSocket).toBe('/tmp/agent.1');
		expect(resolved.values).toEqual({});
	});

	it('fails by naming the reference, never the value', async () => {
		await expect(
			resolveSecrets([{ kind: 'env', name: 'X' }], sources({})),
		).rejects.toThrow('host variable X is not set');
		await expect(
			resolveSecrets(
				[{ kind: 'file', name: 'K', path: '/nope' }],
				sources({}),
			),
		).rejects.toThrow('secret file /nope could not be read');
		await expect(
			resolveSecrets([{ kind: 'ssh-agent-forward' }], sources({})),
		).rejects.toThrow('SSH_AUTH_SOCK');
		await expect(
			resolveSecrets([{ kind: 'env', name: 'A;B' }], sources({})),
		).rejects.toThrow('not a valid secret name');
	});

	it('redacts every resolved value from text, longest first', async () => {
		const resolved = await resolveSecrets(
			[
				{ kind: 'env', name: 'SHORT' },
				{ kind: 'env', name: 'LONG' },
			],
			sources({ SHORT: 'abcd', LONG: 'abcdefgh' }),
		);
		expect(resolved.redact('x abcdefgh y abcd z')).toBe(
			'x [redacted] y [redacted] z',
		);
	});

	it('leaves text alone when no secret appears in it', async () => {
		const resolved = await resolveSecrets(
			[{ kind: 'env', name: 'T' }],
			sources({ T: 'secret-value' }),
		);
		expect(resolved.redact('plain log line')).toBe('plain log line');
	});

	it('writes nothing to disk while resolving from the real host', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'exec-env-secret-'));
		try {
			const path = join(dir, 'secret');
			await writeFile(path, 'on-disk-secret');
			const before = await readdir(dir);
			const resolved = await resolveSecrets(
				[{ kind: 'file', name: 'S', path }],
				hostSecretSources(),
			);
			expect(resolved.values.S).toBe('on-disk-secret');
			expect(await readdir(dir)).toEqual(before);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
