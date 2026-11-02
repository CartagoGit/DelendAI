import { describe, expect, it } from 'vitest';

import {
	collectComplexityFindings,
	scanComplexityProject,
} from '../../../src/lib/tools/complexity';

describe('collectComplexityFindings', () => {
	it('ignores control-flow tokens inside comments and strings', () => {
		const source = [
			'export function keepLow() {',
			'  const msg = "if && ||";',
			'  // if && ||',
			'  return msg;',
			'}',
			'export function hotspot(x: boolean) {',
			'  if (x && true) return 1;',
			'  for (const item of [1,2]) { if (item) return item; }',
			'  return 0;',
			'}',
		].join('\n');
		const findings = collectComplexityFindings('src/demo.ts', source, 3);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			function: 'hotspot',
			complexity: 5,
		});
	});

	it('returns summary metadata from the project scanner', () => {
		const result = scanComplexityProject(
			[
				{
					path: 'src/a.ts',
					source: 'export function hotspot(){ if (true) { if (false) {} } }',
				},
			],
			1,
		);
		expect(result.findings).toHaveLength(1);
		expect(
			result.summary.low + result.summary.medium + result.summary.high,
		).toBe(1);
		expect(result.worst).toBeDefined();
	});
});
