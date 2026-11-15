import { describe, expect, it } from 'vitest';

import type {
	IActivationPorts,
	IActivationMode,
} from '../../../../src/lib/contracts/interfaces/integration-activation.interface';
import type { IRehearsalReport } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	activateIntegration,
	deactivateIntegration,
	withEngine,
} from '../../../../src/lib/services/integration-activation.service';

const TIP = 'a'.repeat(40);
const CONFIG =
	'{\n\t// the policy\n\t"development": {\n\t\t"integration": {\n\t\t\t"engine": "none",\n\t\t\t"protocol": 1\n\t\t}\n\t}\n}\n';

const report = (over: Partial<IRehearsalReport> = {}): IRehearsalReport => ({
	runId: 'r',
	mode: 'fast',
	repository: 'o/p',
	tip: TIP,
	startedAt: '',
	finishedAt: '',
	scenarios: [
		{
			id: 'F1',
			title: 't',
			ok: true,
			expectations: [],
			integration: 'i',
			pulls: {},
		},
	],
	targets: [
		{
			id: 'T1',
			value: 1,
			threshold: 2,
			unit: 'min',
			ok: true,
			detail: 'd',
		},
	],
	leftovers: [],
	secretHits: [],
	ok: true,
	...over,
});

interface IFake {
	ports: IActivationPorts;
	config: { text: string };
	files: Map<string, string>;
	removed: string[];
}

const fake = (over: Partial<IActivationPorts> = {}): IFake => {
	const config = { text: CONFIG };
	const files = new Map<string, string>();
	const removed: string[] = [];
	const ports: IActivationPorts = {
		tipOf: async () => TIP,
		reportOf: async () => report(),
		knownRed: [],
		doctor: async () => ({ ok: true, checks: [] }),
		readConfig: async () => config.text,
		writeConfig: async (text) => {
			config.text = text;
		},
		renderWorkflows: async (text) =>
			text.includes('"land"')
				? [
						{ path: 'land.yml', content: 'land' },
						{ path: 'land-signal.yml', content: 'signal' },
					]
				: [
						{ path: 'land.yml', content: undefined },
						{ path: 'land-signal.yml', content: undefined },
					],
		writeFile: async (path, content) => {
			files.set(path, content);
		},
		removeFile: async (path) => {
			removed.push(path);
		},
		...over,
	};
	return { ports, config, files, removed };
};

const refused = async (over: Partial<IActivationPorts>) => {
	const f = fake(over);
	const result = await activateIntegration(f.ports);
	expect(f.config.text).toBe(CONFIG);
	expect(f.files.size).toBe(0);
	return result.refusals;
};

describe('integration activation', () => {
	it('[<50ms] writes the engine and the workflows when everything is green, keeping the comments', async () => {
		const f = fake();
		const result = await activateIntegration(f.ports);
		expect(result).toEqual({
			engine: 'land',
			refusals: [],
			changed: ['land.yml', 'land-signal.yml'],
		});
		expect(f.config.text).toBe(CONFIG.replace('"none"', '"land"'));
		expect(f.files.get('land.yml')).toBe('land');
	});

	it('[<50ms] refuses while a mode has no report for the tip', async () => {
		const reasons = await refused({
			reportOf: async (mode: IActivationMode) =>
				mode === 'real' ? undefined : report(),
		});
		expect(reasons).toEqual([
			expect.stringContaining(`no real rehearsal report for ${TIP}`),
		]);
	});

	it('[<50ms] refuses a report that is for another commit', async () => {
		const reasons = await refused({
			reportOf: async () => report({ tip: 'b'.repeat(40) }),
		});
		expect(reasons).toHaveLength(2);
		expect(reasons[0]).toContain(`not for ${TIP}`);
	});

	it('[<50ms] refuses a red scenario in every mode that has one', async () => {
		const red = report({
			scenarios: [{ ...report().scenarios[0]!, id: 'F9', ok: false }],
		});
		const reasons = await refused({ reportOf: async () => red });
		expect(reasons).toEqual([
			'fast scenario F9 is red',
			'real scenario F9 is red',
		]);
	});

	it('[<50ms] refuses a red target', async () => {
		const red = report({
			targets: [{ ...report().targets[0]!, ok: false, detail: 'slow' }],
		});
		const reasons = await refused({
			reportOf: async (mode) => (mode === 'fast' ? red : report()),
		});
		expect(reasons).toEqual(['fast target T1 is red: slow']);
	});

	it('[<50ms] refuses a report that measured nothing', async () => {
		const reasons = await refused({
			reportOf: async () => report({ scenarios: [], targets: [] }),
		});
		expect(reasons).toHaveLength(2);
	});

	it('[<50ms] refuses while the known-red list is not empty', async () => {
		const reasons = await refused({
			knownRed: [{ scenario: 'F6', fixedBy: 'S10' }],
		});
		expect(reasons).toEqual([
			'scenario F6 is still known red (fixed by S10)',
		]);
	});

	it('[<50ms] refuses while the doctor has a red check', async () => {
		const reasons = await refused({
			doctor: async () => ({
				ok: false,
				checks: [{ name: 'key', ok: false, detail: 'missing' }],
			}),
		});
		expect(reasons).toEqual(['doctor check key is red: missing']);
	});

	it('[<50ms] lists every reason at once', async () => {
		const reasons = await refused({
			reportOf: async () => undefined,
			knownRed: [{ scenario: 'F6', fixedBy: 'S10' }],
		});
		expect(reasons).toHaveLength(3);
	});

	it('[<50ms] deactivates back to none and removes the workflows, with no gate', async () => {
		const f = fake();
		await activateIntegration(f.ports);
		const result = await deactivateIntegration({
			...f.ports,
			reportOf: async () => undefined,
		});
		expect(result.engine).toBe('none');
		expect(f.config.text).toBe(CONFIG);
		expect(f.removed).toEqual(['land.yml', 'land-signal.yml']);
	});

	it('[<50ms] never writes the engine into a config that does not parse', () => {
		expect(() => withEngine('{ "a": ', 'land')).toThrow(/does not parse/u);
	});
});
