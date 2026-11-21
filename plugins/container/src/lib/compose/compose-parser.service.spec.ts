import { describe, expect, it } from 'vitest';

import { parseCompose } from './compose-parser.service';

describe('parseCompose', () => {
	it('reads both long and short forms, and never an environment value', () => {
		expect(
			parseCompose(
				[
					'services:',
					'  api:',
					'    build:',
					'      context: ./api',
					'    environment:',
					'      - TOKEN=secret',
					'      - PLAIN',
					'    volumes:',
					'      - type: bind',
					'        source: ./data',
					'        target: /data',
					'      - logs:/var/log',
					'  bare: {}',
				].join('\n'),
			),
		).toEqual([
			{
				name: 'api',
				build: './api',
				ports: [],
				environment: ['TOKEN', 'PLAIN'],
				mounts: ['./data:/data', 'logs:/var/log'],
			},
			{ name: 'bare', ports: [], environment: [], mounts: [] },
		]);
	});

	it('has no services when the file declares none', () => {
		expect(parseCompose('version: "3"\n')).toEqual([]);
		expect(parseCompose('just text\n')).toEqual([]);
	});
});
