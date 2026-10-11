import { describe, expect, it } from 'vitest';

import { buildBrowserA11yToolRegistrations } from './browser-a11y.tool';
import type {
	IAssertOutcome,
	IA11yRequest,
	IAxeRunResult,
	IBrowserActionDriver,
	IInteractionResult,
	IFillRequest,
} from '../interact/iaction-driver';
import { mapAxeReport } from '../interact/axe-mapper';
import { outcomesToFindings } from '../interact/assertions';

class FakeServer {
	tools: Record<string, { handler: (a: unknown) => Promise<unknown> }> = {};
	registerTool(
		name: string,
		_meta: unknown,
		handler: (a: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { handler };
	}
}

const parseOk = (r: unknown): Record<string, unknown> => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const buildTools = (driver: IBrowserActionDriver | undefined) => {
	const regs = buildBrowserA11yToolRegistrations({
		namespacePrefix: 'browser',
		...(driver === undefined ? {} : { driver }),
	});
	const server = new FakeServer();
	for (const r of regs) void r.register(server as never);
	return server.tools;
};

const fakeDriver = (): IBrowserActionDriver => ({
	click: async ({ url, target }): Promise<IInteractionResult> => ({
		target,
		action: 'click',
		url,
		matched: 1,
	}),
	fill: async (req: IFillRequest): Promise<IInteractionResult> => ({
		target: req.target,
		action: 'fill',
		url: req.url,
		matched: 1,
	}),
	assert: async (req): Promise<IAssertOutcome> => ({
		url: req.url,
		kind: req.kind,
		passed: req.expected === 'ok',
		observed: req.expected === 'ok' ? req.expected : 'observed',
		expected: req.expected,
		...(req.label !== undefined ? { label: req.label } : {}),
	}),
	runAxe: async (req: IA11yRequest): Promise<IAxeRunResult> => ({
		url: req.url,
		violations: [
			{
				id: 'color-contrast',
				impact: 'serious',
				description: 'Elements must have sufficient color contrast',
				help: 'Elements must have sufficient color contrast',
				helpUrl:
					'https://dequeuniversity.com/rules/axe/4.7/color-contrast',
				nodes: [
					{
						html: '<button class="btn">Sign in</button>',
						target: ['.btn'],
						failureSummary:
							'Fix any of the following: element has insufficient color contrast',
					},
				],
			},
			{
				id: 'image-alt',
				impact: 'critical',
				description: 'Images must have alternate text',
				help: 'Images must have alternate text',
				helpUrl: 'https://dequeuniversity.com/rules/axe/4.7/image-alt',
				nodes: [
					{
						html: '<img src="logo.png">',
						target: ['header > img'],
						failureSummary:
							'Fix any of the following: element does not have an alt attribute',
					},
					{
						html: '<img src="banner.png">',
						target: ['main > img'],
						failureSummary:
							'Fix any of the following: element does not have an alt attribute',
					},
				],
			},
		],
		passes: 12,
		incomplete: 1,
	}),
});

describe('browser-a11y (f00125 S2)', () => {
	it('registers all four tools under the namespace prefix', () => {
		const tools = buildTools(fakeDriver());
		const ids = Object.keys(tools).sort();
		expect(ids).toEqual([
			'browser_browser_a11y',
			'browser_browser_assert',
			'browser_browser_click',
			'browser_browser_fill',
		]);
	});

	it('browser_click returns the interaction result via the driver', async () => {
		const tools = buildTools(fakeDriver());
		const handler = tools.browser_browser_click?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({ url: 'https://example.com', target: 'button' }),
		);
		expect(out.action).toBe('click');
		expect(out.matched).toBe(1);
		expect(out.url).toBe('https://example.com');
	});

	it('browser_fill forwards `submit` only when truthy', async () => {
		let captured: IFillRequest | undefined;
		const driver: IBrowserActionDriver = {
			...fakeDriver(),
			fill: async (req) => {
				captured = req;
				return {
					target: req.target,
					action: 'fill',
					url: req.url,
					matched: 1,
				};
			},
		};
		const tools = buildTools(driver);
		const handler = tools.browser_browser_fill?.handler as (
			a: unknown,
		) => Promise<unknown>;
		await handler({
			url: 'https://example.com',
			target: 'input',
			value: 'hi',
			submit: true,
		});
		expect(captured?.submit).toBe(true);
		expect(captured?.value).toBe('hi');
	});

	it('browser_assert returns empty findings when all pass', async () => {
		const tools = buildTools(fakeDriver());
		const handler = tools.browser_browser_assert?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({
				url: 'https://example.com',
				assertions: [
					{ kind: 'text-equals', target: 'h1', expected: 'ok' },
				],
			}),
		);
		expect(out.passed).toBe(true);
		expect((out.findings as unknown[]).length).toBe(0);
	});

	it('browser_assert surfaces a normalized IFinding[] on failure', async () => {
		const tools = buildTools(fakeDriver());
		const handler = tools.browser_browser_assert?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({
				url: 'https://example.com',
				assertions: [
					{
						kind: 'text-equals',
						target: 'h1',
						expected: 'Welcome',
						label: 'hero copy',
					},
				],
			}),
		);
		expect(out.passed).toBe(false);
		const findings = out.findings as Array<{
			ruleId: string;
			severity: string;
			message: string;
		}>;
		expect(findings.length).toBe(1);
		expect(findings[0]?.ruleId).toBe('browser-assert:text-equals');
		expect(findings[0]?.severity).toBe('high');
		expect(findings[0]?.message).toContain('hero copy');
	});

	it('browser_a11y normalizes axe violations to IFinding[] with summary + worst', async () => {
		const tools = buildTools(fakeDriver());
		const handler = tools.browser_browser_a11y?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(await handler({ url: 'https://example.com' }));
		expect(out.url).toBe('https://example.com');
		const findings = out.findings as Array<{
			ruleId: string;
			severity: string;
		}>;
		expect(findings.length).toBe(3);
		expect(
			findings.find((f) => f.ruleId === 'axe:color-contrast')?.severity,
		).toBe('high');
		expect(
			findings.filter((f) => f.ruleId === 'axe:image-alt').length,
		).toBe(2);
		expect(out.worst).toBe('critical');
		const summary = out.summary as Record<string, number>;
		expect(summary.critical).toBe(2);
		expect(summary.high).toBe(1);
	});
});

describe('axe-mapper (f00125 S2)', () => {
	it('produces one finding per node, with stable ruleId prefix', () => {
		const findings = mapAxeReport('https://example.com', [
			{
				id: 'color-contrast',
				impact: 'serious',
				nodes: [{ target: ['.btn'] }, { target: ['.link'] }],
			},
		]);
		expect(findings.length).toBe(2);
		for (const f of findings) {
			expect(f.ruleId.startsWith('axe:')).toBe(true);
			expect(f.severity).toBe('high');
			expect(f.location?.file).toBeDefined();
		}
	});

	it('maps unknown impact to info severity', () => {
		const findings = mapAxeReport('https://example.com', [
			{
				id: 'tabindex',
				impact: null,
				nodes: [{ target: ['a'] }],
			},
		]);
		expect(findings[0]?.severity).toBe('info');
	});

	it('keeps the exact normalized finding payload for representative axe HTML', () => {
		expect(
			mapAxeReport('https://example.com', [
				{
					id: 'color-contrast',
					impact: 'serious',
					help: 'Elements must have sufficient color contrast',
					helpUrl:
						'https://dequeuniversity.com/rules/axe/4.7/color-contrast',
					nodes: [
						{
							html: '<button class="btn">Sign in</button>',
							target: ['.btn'],
						},
					],
				},
			]),
		).toEqual([
			{
				ruleId: 'axe:color-contrast',
				severity: 'high',
				message:
					'Elements must have sufficient color contrast @ https://example.com — selector: .btn',
				location: {
					file: 'Sign in#node-1',
				},
				fix: 'Elements must have sufficient color contrast (https://dequeuniversity.com/rules/axe/4.7/color-contrast)',
			},
		]);
	});

	it('handles long HTML fragments without pathological slowdown', () => {
		const startedAt = performance.now();
		const findings = mapAxeReport('https://example.com', [
			{
				id: 'color-contrast',
				impact: 'serious',
				nodes: [
					{
						html: `<button ${'data-x="1" '.repeat(20_000)}>Sign in</button>`,
						target: ['.btn'],
					},
				],
			},
		]);
		expect(findings[0]?.location?.file).toBe('Sign in#node-1');
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});
});

describe('outcomesToFindings (f00125 S2)', () => {
	it('passes through successes and emits one finding per failure', () => {
		const findings = outcomesToFindings(
			[
				{ url: 'u', kind: 'visible', expected: 'ok', label: 'l1' },
				{ url: 'u', kind: 'visible', expected: 'fail', label: 'l2' },
				{ url: 'u', kind: 'count', expected: '2', label: 'l3' },
			],
			[
				{
					url: 'u',
					kind: 'visible',
					passed: true,
					observed: 'ok',
					expected: 'ok',
					label: 'l1',
				},
				{
					url: 'u',
					kind: 'visible',
					passed: false,
					observed: 'x',
					expected: 'fail',
					label: 'l2',
				},
				{
					url: 'u',
					kind: 'count',
					passed: false,
					observed: '1',
					expected: '2',
					label: 'l3',
				},
			],
		);
		expect(findings.length).toBe(2);
		expect(findings[0]?.message).toContain('l2');
		expect(findings[1]?.message).toContain('l3');
	});

	it('throws on length mismatch', () => {
		expect(() =>
			outcomesToFindings(
				[{ url: 'u', kind: 'visible', expected: 'x' }],
				[],
			),
		).toThrow(/length mismatch/);
	});
});
