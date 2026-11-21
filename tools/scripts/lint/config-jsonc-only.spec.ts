/**
 * config-jsonc-only.spec.ts — the rule is one sentence; the window it
 * reads is the part that can rot.
 *
 * `delendai.config.json` is JSONC by contract, so a `JSON.parse` of it
 * breaks the moment a human writes the first `//` in their own
 * configuration. The gate reports those reads. What these cases pin is
 * the window: a config read IS reported, and a `JSON.parse` of anything
 * else — a `package.json`, a CLI value expression, a machine-written
 * cache record — is NOT.
 */
import { describe, expect, it } from 'vitest';

import { findViolations } from './config-jsonc-only.script';

describe('findViolations', () => {
	it('reports a JSON.parse that reads the config file', () => {
		const violations = findViolations({
			file: 'tools/scripts/lint/example.script.ts',
			text: [
				'const config = JSON.parse(',
				"\treadFileSync(join(root, 'delendai.config.json'), 'utf8'),",
				') as { plugins?: Record<string, unknown> };',
				'',
			].join('\n'),
		});
		expect(violations).toHaveLength(1);
		expect(violations[0]?.file).toBe(
			'tools/scripts/lint/example.script.ts',
		);
		expect(violations[0]?.line).toBe(1);
	});

	it('reports the line the call sits on, not the line it reads', () => {
		const violations = findViolations({
			file: 'example.script.ts',
			text: [
				'// a comment above the read',
				'const config = JSON.parse(configRaw);',
				'',
			].join('\n'),
		});
		expect(violations).toHaveLength(1);
		expect(violations[0]?.line).toBe(2);
	});

	it('leaves a package.json read alone', () => {
		const violations = findViolations({
			file: 'example.script.ts',
			text: 'const pkg = JSON.parse(rawPackageJson);\n',
		});
		expect(violations).toEqual([]);
	});

	it('leaves a file with no JSON.parse alone', () => {
		const violations = findViolations({
			file: 'example.script.ts',
			text: 'const config = parseJsonc(raw);\n',
		});
		expect(violations).toEqual([]);
	});

	it('leaves a CLI value expression alone', () => {
		// `config set key=<json-value>` parses what the user typed, not
		// the configuration file: strict JSON is the right contract there.
		const violations = findViolations({
			file: 'packages/cli/src/lib/config-file.service.ts',
			text: [
				'const parseValue = (raw: string): unknown => {',
				'\ttry {',
				'\t\treturn JSON.parse(raw);',
				'\t} catch {',
				'\t\treturn raw;',
				'\t}',
				'};',
				'',
			].join('\n'),
		});
		expect(violations).toEqual([]);
	});

	it('leaves a machine-written cache record alone', () => {
		const violations = findViolations({
			file: 'packages/core/src/lib/workspace-migration/config-transitions.service.ts',
			text: [
				'const parsed: unknown = JSON.parse(',
				"\tawait readFile(join(root, APPLIED_CONFIG_FILE), 'utf8'),",
				');',
				'',
			].join('\n'),
		});
		expect(violations).toEqual([]);
	});
});
