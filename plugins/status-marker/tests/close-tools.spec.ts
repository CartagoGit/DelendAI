import { describe, expect, it } from 'vitest';

import {
	buildCloseRegistration,
	buildPingRegistration,
	buildValidateRegistration,
} from '../src/lib/tools/close-tools';
import {
	formatCloseMarker,
	mergeMarkerTable,
	type IEffectiveMarkerTable,
} from '../src/lib/markers';

interface ICall {
	name: string;
	def: {
		description?: string;
		inputSchema?: unknown;
		outputSchema?: unknown;
	};
	handler: (args: unknown) => Promise<unknown>;
}

const mkServer = (calls: ICall[]) => ({
	registerTool: (
		name: string,
		def: ICall['def'],
		handler: (args: unknown) => Promise<unknown>,
	) => {
		calls.push({ name, def, handler });
	},
});

const captureRegister = async (
	markerTable?: IEffectiveMarkerTable,
): Promise<ICall[]> => {
	const calls: ICall[] = [];
	const server = mkServer(calls);
	const opts =
		markerTable === undefined
			? { namespacePrefix: 'sm' }
			: { namespacePrefix: 'sm', markerTable };
	const regs = [
		buildCloseRegistration(opts),
		buildValidateRegistration(opts),
	];
	for (const r of regs) {
		await r.register(server as never);
	}
	return calls;
};

const tableWith = (
	cfg: Parameters<typeof mergeMarkerTable>[0],
): IEffectiveMarkerTable => {
	const merged = mergeMarkerTable(cfg);
	if ('ok' in merged && merged.ok === false) {
		throw new Error(`merge failed: ${merged.error}`);
	}
	return merged as IEffectiveMarkerTable;
};

describe('close-tools — registration shape', async () => {
	it('registers close + validate under the configured prefix', async () => {
		const calls = await captureRegister();
		expect(calls.map((c) => c.name)).toEqual(['sm_close', 'sm_validate']);
	});

	it('declares input + output schemas (N16)', async () => {
		const calls = await captureRegister();
		for (const c of calls) {
			expect(c.def.inputSchema).toBeDefined();
			expect(c.def.outputSchema).toBeDefined();
		}
	});
});

describe('close-tools — handler', async () => {
	it('close returns the canonical line and echoes the state', async () => {
		const calls = await captureRegister();
		const close = calls.find((c) => c.name === 'sm_close')!;
		const out = (await close.handler({
			state: 'HECHO',
		})) as { content: Array<{ text: string }> };
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed).toEqual({
			ok: true,
			state: 'HECHO',
			locale: 'es',
			line: formatCloseMarker('HECHO'),
		});
	});

	it('close appends the reason when supplied', async () => {
		const calls = await captureRegister();
		const close = calls.find((c) => c.name === 'sm_close')!;
		const out = (await close.handler({
			state: 'CAP',
			reason: 'todo lo posible',
		})) as { content: Array<{ text: string }> };
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.line).toBe(formatCloseMarker('CAP', 'todo lo posible'));
		expect(parsed.reason).toBe('todo lo posible');
		expect(parsed.locale).toBe('es');
	});

	it('close renders the EN locale when locale="en"', async () => {
		const calls = await captureRegister();
		const close = calls.find((c) => c.name === 'sm_close')!;
		const out = (await close.handler({
			state: 'HECHO',
			locale: 'en',
		})) as { content: Array<{ text: string }> };
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.line).toBe('🟩 [DONE]');
		expect(parsed.locale).toBe('en');
	});

	it('validate reports ok:true for a valid response', async () => {
		const calls = await captureRegister();
		const validate = calls.find((c) => c.name === 'sm_validate')!;
		const out = (await validate.handler({
			text: `Prosa\n${formatCloseMarker('HECHO')}`,
		})) as { content: Array<{ text: string }> };
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.ok).toBe(true);
		expect(parsed.state).toBe('HECHO');
	});

	it('validate reports ok:false with violation for missing reason', async () => {
		const calls = await captureRegister();
		const validate = calls.find((c) => c.name === 'sm_validate')!;
		// Build the "no reason" line manually so the validator sees the
		// genuine missing-reason case (the helper would otherwise insert
		// <reason-missing> and report placeholder-reason instead).
		const text = '🟥 [BLOQUEADO]';
		const out = (await validate.handler({ text })) as {
			content: Array<{ text: string }>;
		};
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.ok).toBe(false);
		expect(parsed.violations).toContain('reason-missing');
	});
});

/**
 * User-configurable marker set wired into the tools (proposal f00071). When
 * the host supplies a merged marker table, `close` renders user states,
 * `validate` accepts their emoji, and `ping` surfaces them under
 * `markers.userDefined`.
 */
describe('close-tools — host marker table (f00071)', async () => {
	const HOST_TABLE = tableWith({
		add: [
			{
				id: 'REVIEW',
				emoji: '🔷',
				requiresReason: true,
				locales: { es: 'REVISIÓN', en: 'REVIEW' },
				instruction: 'Close after a successful code review pass.',
			},
		],
		disable: ['SIN PROPUESTA DE NINGUN TIPO'],
	});

	it('close renders a user-added state', async () => {
		const calls = await captureRegister(HOST_TABLE);
		const close = calls.find((c) => c.name === 'sm_close')!;
		const out = (await close.handler({
			state: 'REVIEW',
			reason: 'lgtm',
		})) as { content: Array<{ text: string }> };
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.ok).toBe(true);
		expect(parsed.state).toBe('REVIEW');
		expect(parsed.line).toBe('🔷 [REVISIÓN] — lgtm');
	});

	it('close renders a user-added state in the EN locale', async () => {
		const calls = await captureRegister(HOST_TABLE);
		const close = calls.find((c) => c.name === 'sm_close')!;
		const out = (await close.handler({
			state: 'REVIEW',
			reason: 'lgtm',
			locale: 'en',
		})) as { content: Array<{ text: string }> };
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.line).toBe('🔷 [REVIEW] — lgtm');
	});

	it('validate accepts a user-added marker line', async () => {
		const calls = await captureRegister(HOST_TABLE);
		const validate = calls.find((c) => c.name === 'sm_validate')!;
		const out = (await validate.handler({
			text: 'Prosa\n🔷 [REVISIÓN] — lgtm',
		})) as { content: Array<{ text: string }> };
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.ok).toBe(true);
		expect(parsed.state).toBe('REVIEW');
	});

	it('validate rejects a disabled built-in marker line as bad-format', async () => {
		const calls = await captureRegister(HOST_TABLE);
		const validate = calls.find((c) => c.name === 'sm_validate')!;
		// ⬜ (SIN PROPUESTA DE NINGUN TIPO) was disabled, so its emoji is no
		// longer in the reverse map.
		const out = (await validate.handler({ text: '⬜ [SIN PROPUESTA]' })) as {
			content: Array<{ text: string }>;
		};
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.ok).toBe(false);
	});

	it('ping surfaces host-declared markers under markers.userDefined', async () => {
		const calls: ICall[] = [];
		const server = mkServer(calls);
		await buildPingRegistration({
			namespacePrefix: 'sm',
			cacheDir: '/cache',
			docsDir: '/docs',
			markerTable: HOST_TABLE,
		}).register(server as never);
		const ping = calls.find((c) => c.name === 'sm_ping')!;
		const out = (await ping.handler({})) as {
			content: Array<{ text: string }>;
		};
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.markers.userDefined).toEqual([
			{
				state: 'REVIEW',
				emoji: '🔷',
				requiresReason: true,
				instruction: 'Close after a successful code review pass.',
			},
		]);
	});

	it('ping omits markers when no host markers are declared', async () => {
		const calls: ICall[] = [];
		const server = mkServer(calls);
		await buildPingRegistration({
			namespacePrefix: 'sm',
			cacheDir: '/cache',
			docsDir: '/docs',
		}).register(server as never);
		const ping = calls.find((c) => c.name === 'sm_ping')!;
		const out = (await ping.handler({})) as {
			content: Array<{ text: string }>;
		};
		const parsed = JSON.parse(out.content[0]!.text);
		expect(parsed.markers).toBeUndefined();
	});
});
