import { describe, expect, it } from 'vitest';

import { MissingCliError, runAuditCommand, type IAuditExec } from './audit';

const execWith =
	(stdout: string, stderr = '', timedOut = false): IAuditExec =>
	async () => ({ code: stdout.length > 0 ? 1 : 0, stdout, stderr, timedOut });

describe('runAuditCommand', () => {
	it('parses bun audit json from stdout', async () => {
		const result = await runAuditCommand({
			cwd: '/repo',
			packageManager: 'bun',
			exec: execWith(JSON.stringify({ pkg: [{ id: 1, title: 'x' }] })),
		});
		expect(result).toEqual({
			ok: true,
			raw: { pkg: [{ id: 1, title: 'x' }] },
		});
	});

	it('parses npm audit json from stderr fallback', async () => {
		const result = await runAuditCommand({
			cwd: '/repo',
			packageManager: 'npm',
			exec: execWith('', JSON.stringify({ vulnerabilities: {} })),
		});
		expect(result).toEqual({ ok: true, raw: { vulnerabilities: {} } });
	});

	it('aggregates yarn ndjson advisories', async () => {
		const stream = [
			JSON.stringify({
				type: 'auditAdvisory',
				data: {
					advisory: {
						id: 7,
						module_name: 'lodash',
						title: 'Prototype pollution',
					},
				},
			}),
		].join('\n');
		const result = await runAuditCommand({
			cwd: '/repo',
			packageManager: 'yarn',
			exec: execWith(stream),
		});
		expect(result).toEqual({
			ok: true,
			raw: {
				advisories: {
					'7': {
						id: 7,
						module_name: 'lodash',
						title: 'Prototype pollution',
					},
				},
			},
		});
	});

	it('returns a typed fallback when the cli is missing', async () => {
		const result = await runAuditCommand({
			cwd: '/repo',
			packageManager: 'bun',
			exec: async () => {
				throw new MissingCliError('bun');
			},
		});
		expect(result).toEqual({
			ok: false,
			error: 'Missing required CLI: bun',
			hint: 'brew install bun',
		});
	});
});
