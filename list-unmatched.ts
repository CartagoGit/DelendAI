import { classifyPath } from './plugins/conventions/src/public/index';
import { globSync } from 'glob';
import { readFileSync, writeFileSync } from 'fs';

const files = globSync('plugins/**/*.{ts,tsx,mts}', {
	ignore: ['**/node_modules/**', '**/dist/**'],
});
const unmatched = files.filter(
	(f) =>
		classifyPath(f) === 'other' ||
		classifyPath(f) === 'barrel' ||
		classifyPath(f) === 'generated',
);

writeFileSync('unmatched-plugins.txt', unmatched.join('\n'));
