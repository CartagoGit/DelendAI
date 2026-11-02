import { describe, expect, it } from 'vitest';

import { scanFile, scanMarkers } from '../../../src/lib/tech-debt/scan-markers';
import type { ISourceFile } from '../../../src/lib/contracts/interfaces/tech-debt.interface';

const file = (path: string, content: string): ISourceFile => ({
	path,
	content,
});

describe('scanFile', () => {
	it('flags each marker with the right severity and line', () => {
		const findings = scanFile(
			file(
				'a.ts',
				[
					'const x = 1;',
					'// TODO: rename this',
					'// FIXME broken edge case',
					'const url = "https://todo.example";', // not a comment → ignored
				].join('\n'),
			),
		);
		expect(findings).toHaveLength(2);
		expect(findings[0]).toMatchObject({
			ruleId: 'marker-todo',
			severity: 'low',
			location: { file: 'a.ts', line: 2 },
		});
		expect(findings[1]).toMatchObject({
			ruleId: 'marker-fixme',
			severity: 'high',
			location: { file: 'a.ts', line: 3 },
		});
	});

	it('captures the trailing note in the message', () => {
		const [finding] = scanFile(file('b.ts', '# HACK: works only on linux'));
		expect(finding?.message).toBe('HACK: works only on linux');
	});

	it('does not match a marker word used as an identifier', () => {
		expect(scanFile(file('c.ts', 'const TODO_LIST = [];'))).toEqual([]);
	});
});

describe('scanMarkers', () => {
	it('scans every file in path order', () => {
		const findings = scanMarkers([
			file('z.ts', '// TODO later'),
			file('a.ts', '// FIXME now'),
		]);
		expect(findings.map((f) => f.location?.file)).toEqual(['a.ts', 'z.ts']);
	});
});
