import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The generated tool-output SDK (N23). The generator + pure emitter live
// at the repo root (scripts/); imported relatively so the codegen logic is
// typechecked and exercised alongside the rest of the monorepo.
import {
	jsonSchemaToTs,
	emitToolOutputsModule,
	outputInterfaceName,
	pascalCase,
} from '../../../scripts/emit-tool-types';
import { generateToolOutputModules } from '../../../scripts/generate-tool-types';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('emit-tool-types: pure JSON-Schema → TS emitter', () => {
	it('maps the primitive + object subset', () => {
		expect(jsonSchemaToTs({ type: 'string' })).toBe('string');
		expect(jsonSchemaToTs({ type: 'number' })).toBe('number');
		expect(jsonSchemaToTs({ type: 'boolean' })).toBe('boolean');
		expect(jsonSchemaToTs({ type: 'null' })).toBe('null');
		expect(jsonSchemaToTs({ const: true })).toBe('true');
	});

	it('renders unions (incl. nullable) and dedupes', () => {
		expect(
			jsonSchemaToTs({ anyOf: [{ type: 'string' }, { type: 'null' }] }),
		).toBe('string | null');
		expect(
			jsonSchemaToTs({ anyOf: [{ type: 'string' }, { type: 'string' }] }),
		).toBe('string');
	});

	it('parenthesises union element types in arrays', () => {
		expect(
			jsonSchemaToTs({ type: 'array', items: { type: 'string' } }),
		).toBe('string[]');
		expect(
			jsonSchemaToTs({
				type: 'array',
				items: { anyOf: [{ type: 'string' }, { type: 'number' }] },
			}),
		).toBe('Array<string | number>');
	});

	it('renders the three additionalProperties shapes', () => {
		// closed object
		expect(
			jsonSchemaToTs({
				type: 'object',
				properties: { a: { type: 'string' } },
				required: ['a'],
				additionalProperties: false,
			}),
		).toBe('{\n\ta: string;\n}');
		// pure permissive record
		expect(
			jsonSchemaToTs({
				type: 'object',
				properties: {},
				additionalProperties: {},
			}),
		).toBe('Record<string, unknown>');
		// record with a value schema
		expect(
			jsonSchemaToTs({
				type: 'object',
				properties: {},
				additionalProperties: { type: 'number' },
			}),
		).toBe('Record<string, number>');
	});

	it('marks non-required properties optional', () => {
		expect(
			jsonSchemaToTs({
				type: 'object',
				properties: { a: { type: 'string' }, b: { type: 'number' } },
				required: ['a'],
				additionalProperties: false,
			}),
		).toBe('{\n\ta: string;\n\tb?: number;\n}');
	});

	it('degrades unknown constructs to `unknown`, never invalid TS', () => {
		expect(jsonSchemaToTs({ type: 'integer' })).toBe('number');
		expect(jsonSchemaToTs({})).toBe('unknown');
		expect(jsonSchemaToTs(true)).toBe('unknown');
	});

	it('emits a stable module with interfaces + a name→type map', () => {
		const module = emitToolOutputsModule('Demo', [
			{
				name: 'demo_ping',
				schema: {
					type: 'object',
					properties: { ok: { const: true } },
					required: ['ok'],
					additionalProperties: false,
				},
			},
		]);
		expect(module).toContain('export interface DemoPingOutput {');
		expect(module).toContain('ok: true;');
		expect(module).toContain('export interface DemoToolOutputs {');
		expect(module).toContain('"demo_ping": DemoPingOutput;');
		expect(pascalCase('demo_ping')).toBe('DemoPing');
		expect(outputInterfaceName('demo_ping')).toBe('DemoPingOutput');
	});
});

describe('tool-output SDK drift guard (N23)', () => {
	it('checked-in src/generated/tool-outputs.ts match a fresh generation', async () => {
		const modules = await generateToolOutputModules();
		expect(modules.size).toBeGreaterThan(0);
		const drift: string[] = [];
		for (const [relPath, expected] of modules) {
			let onDisk = '';
			try {
				onDisk = readFileSync(resolve(REPO_ROOT, relPath), 'utf8');
			} catch {
				drift.push(
					`${relPath}: missing (run \`bun run types:generate\`)`,
				);
				continue;
			}
			if (onDisk !== expected) {
				drift.push(
					`${relPath}: stale (run \`bun run types:generate\`)`,
				);
			}
		}
		expect(drift, 'generated tool-output modules out of sync').toEqual([]);
	});
});
