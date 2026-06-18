import { describe, expect, it } from 'vitest';

import {
	buildCloseRegistration,
	buildValidateRegistration,
} from '../src/lib/tools/close-tools';
import { formatCloseMarker } from '../src/lib/markers';

const captureRegister = async () => {
	const calls: Array<{
		name: string;
		def: {
			description?: string;
			inputSchema?: unknown;
			outputSchema?: unknown;
		};
		handler: (args: unknown) => Promise<unknown>;
	}> = [];
	const server = {
		registerTool: (
			name: string,
			def: {
				description?: string;
				inputSchema?: unknown;
				outputSchema?: unknown;
			},
			handler: (args: unknown) => Promise<unknown>,
		) => {
			calls.push({ name, def, handler });
		},
	};
	const regs = [
		buildCloseRegistration({ namespacePrefix: 'sm' }),
		buildValidateRegistration({ namespacePrefix: 'sm' }),
	];
	for (const r of regs) {
		await r.register(server as never);
	}
	return calls;
};

describe('close-tools — registration shape', () => {
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

describe('close-tools — handler', () => {
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
	});

	it('validate reports ok:true for a valid response', async () => {
		const calls = await captureRegister();
		const validate = calls.find((c) => c.name === 'sm_validate')!;
		const out = (await validate.handler({
			text: 'Prosa\n' + formatCloseMarker('HECHO'),
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
