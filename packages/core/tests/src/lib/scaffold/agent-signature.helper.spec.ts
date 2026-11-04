/**
 * agent-signature.helper.spec.ts — an agent file says who wrote it, and
 * whether it is still as written.
 */
import { describe, expect, it } from 'vitest';

import {
	readAgentSignature,
	signAgent,
} from '../../../../src/lib/scaffold/agent-signature.helper';

describe('agent signature', () => {
	it('reads back a catalog agent as untouched, and as edited once changed', () => {
		const file = signAgent('# agent\n', 'catalog-agent');
		expect(readAgentSignature(file)).toEqual({
			kind: 'catalog-agent',
			plugin: '',
			untouched: true,
		});
		expect(
			readAgentSignature(file.replace('# agent', '# mine'))?.untouched,
		).toBe(false);
	});

	it('keeps the plugin of a plugin agent, in the marker it always had', () => {
		const file = signAgent('body', 'plugin-agent', 'acme');
		expect(file).toMatch(
			/<!-- delendai:plugin-agent plugin=acme sha=[0-9a-f]{16} -->\n$/u,
		);
		expect(readAgentSignature(file)).toMatchObject({
			kind: 'plugin-agent',
			plugin: 'acme',
			untouched: true,
		});
	});

	it('finds no signature in a file delendai did not sign', () => {
		expect(readAgentSignature('just a file\n')).toBeUndefined();
	});
});
