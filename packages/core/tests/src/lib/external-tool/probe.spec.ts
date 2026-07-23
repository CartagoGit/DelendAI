import { describe, expect, it } from 'vitest';

import { probeTool, probeTools } from '../../../../src/lib/external-tool/probe';
import type {
	IExternalTool,
	IProbeDeps,
} from '../../../../src/lib/contracts/interfaces/external-tool.interface';

const gitleaks: IExternalTool = {
	id: 'gitleaks',
	bin: 'gitleaks',
	versionPattern: /(\d+\.\d+\.\d+)/,
	installHints: [
		{ manager: 'brew', command: 'brew install gitleaks' },
		{ manager: 'go', command: 'go install github.com/gitleaks/gitleaks' },
	],
};

const depsFor = (
	present: boolean,
	versionOut = 'gitleaks version 8.18.2',
): IProbeDeps => ({
	commandExists: async () => present,
	runVersion: async () => versionOut,
});

describe('probeTool', () => {
	it('reports available + parses the version via versionPattern', async () => {
		const result = await probeTool(gitleaks, depsFor(true));
		expect(result.available).toBe(true);
		expect(result.version).toBe('8.18.2');
		expect(result.installHints).toHaveLength(2);
	});

	it('falls back to trimmed raw output when there is no versionPattern', async () => {
		const noPattern: IExternalTool = { id: 'x', bin: 'x' };
		const result = await probeTool(
			noPattern,
			depsFor(true, '  1.2.3-rc  '),
		);
		expect(result.version).toBe('1.2.3-rc');
	});

	it('reports unavailable with the FIRST install hint when the binary is absent', async () => {
		const result = await probeTool(gitleaks, depsFor(false));
		expect(result.available).toBe(false);
		expect(result.version).toBeUndefined();
		expect(result.installHint).toEqual({
			manager: 'brew',
			command: 'brew install gitleaks',
		});
	});

	it('omits installHint when the tool declares none', async () => {
		const noHints: IExternalTool = { id: 'y', bin: 'y' };
		const result = await probeTool(noHints, depsFor(false));
		expect(result.available).toBe(false);
		expect(result.installHint).toBeUndefined();
		expect(result.installHints).toEqual([]);
	});

	it('never throws when the version runner rejects — still available, no version', async () => {
		const result = await probeTool(gitleaks, {
			commandExists: async () => true,
			runVersion: async () => {
				throw new Error('boom');
			},
		});
		expect(result.available).toBe(true);
		expect(result.version).toBeUndefined();
	});

	it('leaves version undefined when the pattern does not match', async () => {
		const result = await probeTool(
			gitleaks,
			depsFor(true, 'no digits here'),
		);
		expect(result.available).toBe(true);
		expect(result.version).toBeUndefined();
	});
});

describe('probeTools', () => {
	it('probes many tools and preserves input order', async () => {
		const tools: IExternalTool[] = [
			{ id: 'a', bin: 'a' },
			{ id: 'b', bin: 'b' },
			{ id: 'c', bin: 'c' },
		];
		const results = await probeTools(tools, depsFor(true, '1.0.0'));
		expect(results.map((r) => r.tool)).toEqual(['a', 'b', 'c']);
	});
});
