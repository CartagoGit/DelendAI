import { describe, expect, it } from 'vitest';

import type { IProviderCapabilities } from '@mcp-vertex/core/public';

import type { ICliProbeResult } from '../../../../src/lib/types';
import {
	availabilityFromHealth,
	buildProviderHealth,
	commandOf,
} from '../../../../src/lib/healthcheck/report';
import { installHintFor } from '../../../../src/lib/healthcheck/install-hints';

const cliProvider = (command: string): IProviderCapabilities => ({
	id: command,
	kind: 'cli',
	invoke: { kind: 'cli', command, args: [] },
	modelId: 'm',
	contextWindow: 1000,
	costTier: 3,
	strengths: [],
	weaknesses: [],
});

const apiProvider = (): IProviderCapabilities => ({
	id: 'api-p',
	kind: 'api',
	invoke: { kind: 'api', url: 'https://x', envVar: 'K' },
	modelId: 'm',
	contextWindow: 1000,
	costTier: 3,
	strengths: [],
	weaknesses: [],
});

describe('commandOf', () => {
	it('returns the command for cli, the server for mcp-server, null otherwise', () => {
		expect(commandOf(cliProvider('claude'))).toBe('claude');
		expect(
			commandOf({
				...apiProvider(),
				kind: 'mcp-server',
				invoke: {
					kind: 'mcp-server',
					server: 'codex',
					tool: 't',
					args: {},
				},
			}),
		).toBe('codex');
		expect(commandOf(apiProvider())).toBeNull();
	});
});

describe('buildProviderHealth', () => {
	it('treats api/subscription providers as reachable (no CLI to install)', () => {
		const r = buildProviderHealth(apiProvider(), null);
		expect(r.cli.installed).toBe(true);
		expect(r.overall).toBe('available');
		expect(r.installHint).toBeUndefined();
		expect(r.model.available).toBeNull();
	});

	it('marks an installed CLI available with its path and version', () => {
		const probe: ICliProbeResult = {
			installed: true,
			path: '/usr/bin/claude',
			version: '1.2.3',
		};
		const r = buildProviderHealth(cliProvider('claude'), probe);
		expect(r.overall).toBe('available');
		expect(r.cli).toEqual({
			installed: true,
			path: '/usr/bin/claude',
			version: '1.2.3',
		});
		expect(r.model.available).toBe(true);
		expect(r.installHint).toBeUndefined();
	});

	it('marks a missing CLI not-installed and attaches an install hint', () => {
		const r = buildProviderHealth(cliProvider('claude'), {
			installed: false,
			path: null,
			version: null,
		});
		expect(r.overall).toBe('not-installed');
		expect(r.auth.authenticated).toBe(false);
		expect(r.model.available).toBe(false);
		expect(r.installHint?.tool).toBe('npm');
	});
});

describe('availabilityFromHealth', () => {
	it('projects overall state and adds a reason only when not-installed', () => {
		const installed = availabilityFromHealth(
			buildProviderHealth(apiProvider(), null),
		);
		expect(installed).toEqual({ id: 'api-p', state: 'available' });

		const missing = availabilityFromHealth(
			buildProviderHealth(cliProvider('claude'), {
				installed: false,
				path: null,
				version: null,
			}),
		);
		expect(missing.state).toBe('not-installed');
		expect(missing.reason).toMatch(/PATH/);
	});
});

describe('installHintFor (CRITICAL I4)', () => {
	it('flags pipe-to-shell installers dangerous and package installs safe', () => {
		expect(installHintFor('claude').dangerous).toBe(false);
		expect(installHintFor('codex').tool).toBe('npm');
		const cn = installHintFor('cn');
		expect(cn.dangerous).toBe(true);
		expect(cn.pipeTo).toBe('sh');
		const agent = installHintFor('agent');
		expect(agent.dangerous).toBe(true);
		expect(agent.pipeTo).toBe('sh');
	});

	it('falls back to a generic, non-dangerous hint for an unknown CLI', () => {
		const hint = installHintFor('some-unknown-cli');
		expect(hint.dangerous).toBe(false);
		expect(hint.pipeTo).toBeUndefined();
		expect(hint.tool).toBe('some-unknown-cli');
	});
});
