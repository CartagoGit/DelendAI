import { describe, expect, it } from 'vitest';

import {
	applyJsoncEdits,
	detectIndent,
	parseJsonc,
} from '@delendai/core/lib/config/jsonc-document';

describe('jsonc-document (f00502 S1)', async () => {
	describe('parseJsonc', async () => {
		it('parses a document that carries line and block comments', async () => {
			const raw = [
				'{',
				'\t// Selección automática de agentes y modelos.',
				'\t"plugins": {',
				'\t\t/* activado por el preset swarm */',
				'\t\t"proposals": { "enabled": true }',
				'\t}',
				'}',
			].join('\n');

			const { value, errors } = parseJsonc(raw);

			expect(errors).toEqual([]);
			expect(value).toEqual({
				plugins: { proposals: { enabled: true } },
			});
		});

		it('tolerates a trailing comma', async () => {
			const { value, errors } = parseJsonc('{ "a": 1, }');

			expect(errors).toEqual([]);
			expect(value).toEqual({ a: 1 });
		});

		it('reports a syntax error with a 1-based line and column', async () => {
			const { errors } = parseJsonc('{\n\t"a": ,\n}');

			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0]?.line).toBe(2);
			expect(errors[0]?.column).toBeGreaterThan(1);
			expect(typeof errors[0]?.message).toBe('string');
		});

		it('never throws on arbitrary text', async () => {
			expect(() => parseJsonc('not json at all')).not.toThrow();
		});
	});

	describe('detectIndent', async () => {
		it('detects tabs', async () => {
			expect(detectIndent('{\n\t"a": 1\n}')).toEqual({
				indent: '\t',
				usesTabs: true,
			});
		});

		it('detects a space width', async () => {
			expect(detectIndent('{\n    "a": 1\n}')).toEqual({
				indent: '    ',
				usesTabs: false,
			});
		});
	});

	describe('applyJsoncEdits', async () => {
		const documented = [
			'{',
			'\t// NO activar esto en CI.',
			'\t"plugins": {',
			'\t\t"browser": {',
			'\t\t\t"enabled": false',
			'\t\t}',
			'\t}',
			'}',
		].join('\n');

		it('an empty edit list returns the text byte for byte', async () => {
			expect(applyJsoncEdits(documented, [])).toBe(documented);
		});

		it('editing one key keeps every comment in the document', async () => {
			const edited = applyJsoncEdits(documented, [
				{ path: ['plugins', 'browser', 'enabled'], value: true },
			]);

			expect(edited).toContain('// NO activar esto en CI.');
			expect(parseJsonc(edited).value).toEqual({
				plugins: { browser: { enabled: true } },
			});
		});

		it('keeps unknown keys the core does not model', async () => {
			const raw = '{\n\t"futureKey": { "kept": true },\n\t"a": 1\n}';

			const edited = applyJsoncEdits(raw, [{ path: ['a'], value: 2 }]);

			expect(parseJsonc(edited).value).toEqual({
				futureKey: { kept: true },
				a: 2,
			});
		});

		it('writes a leading comment when it creates the member', async () => {
			const edited = applyJsoncEdits('{\n\t"a": 1\n}', [
				{
					path: ['browser'],
					value: { enabled: false },
					leadingComment: [
						'Automatiza navegador.',
						'Opciones: docs/delendai/plugins/browser.md',
					],
				},
			]);

			expect(edited).toContain('// Automatiza navegador.');
			expect(edited).toContain(
				'// Opciones: docs/delendai/plugins/browser.md',
			);
			expect(parseJsonc(edited).value).toEqual({
				a: 1,
				browser: { enabled: false },
			});
		});

		it('anchors the comment to the member the path names, not to a same-named key elsewhere', async () => {
			// `browser` also exists further down under another parent. An
			// anchor resolved by searching the text for the quoted key
			// would find that later one and comment the wrong object.
			const raw = [
				'{',
				'\t"plugins": {',
				'\t\t"proposals": { "enabled": true }',
				'\t},',
				'\t"presets": {',
				'\t\t"browser": "swarm"',
				'\t}',
				'}',
			].join('\n');

			const edited = applyJsoncEdits(raw, [
				{
					path: ['plugins', 'browser'],
					value: { enabled: false },
					leadingComment: ['Automatiza navegador.'],
				},
			]);

			const lines = edited.split('\n');
			const commentLine = lines.findIndex((line) =>
				line.includes('Automatiza navegador.'),
			);

			const presetsLine = lines.findIndex((line) =>
				line.includes('"presets"'),
			);

			expect(commentLine).toBeGreaterThan(-1);
			expect(lines[commentLine + 1]).toContain('"browser"');
			// The comment sits inside `plugins`, above the member that was
			// created — not next to the `presets` entry of the same name.
			expect(commentLine).toBeLessThan(presetsLine);
			expect(parseJsonc(edited).value).toEqual({
				plugins: {
					proposals: { enabled: true },
					browser: { enabled: false },
				},
				presets: { browser: 'swarm' },
			});
		});

		it('does not re-add the comment when the member already exists', async () => {
			const edit = {
				path: ['browser'],
				value: { enabled: false },
				leadingComment: ['Automatiza navegador.'],
			};
			const once = applyJsoncEdits('{\n\t"a": 1\n}', [edit]);
			const twice = applyJsoncEdits(once, [edit]);

			expect(twice.match(/Automatiza navegador\./gu)).toHaveLength(1);
		});

		it('removes a member when the value is undefined', async () => {
			const edited = applyJsoncEdits('{\n\t"a": 1,\n\t"b": 2\n}', [
				{ path: ['b'], value: undefined },
			]);

			expect(parseJsonc(edited).value).toEqual({ a: 1 });
		});

		it('indents an inserted member the way the document is indented', async () => {
			const edited = applyJsoncEdits('{\n    "a": 1\n}', [
				{ path: ['b'], value: 2 },
			]);

			expect(edited).toContain('\n    "b": 2');
			expect(edited).not.toContain('\t');
		});

		it('applies several edits in order', async () => {
			const edited = applyJsoncEdits('{}', [
				{ path: ['plugins'], value: {} },
				{ path: ['plugins', 'proposals'], value: { enabled: true } },
				{ path: ['plugins', 'browser'], value: { enabled: false } },
			]);

			expect(parseJsonc(edited).value).toEqual({
				plugins: {
					proposals: { enabled: true },
					browser: { enabled: false },
				},
			});
		});
	});
});
