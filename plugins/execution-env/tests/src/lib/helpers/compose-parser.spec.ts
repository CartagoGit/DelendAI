import { describe, expect, it } from 'vitest';

import {
	parseComposeFile,
	parseMemoryLimit,
} from '../../../../src/lib/helpers/compose-parser.helper';

const SAMPLE = `
services:
  web:
    image: node:22
    working_dir: /app
    environment:
      MODE: test
      EMPTY:
    ports:
      - "3000:3000"
    volumes:
      - ./src:/app/src:ro
    mem_limit: 512m
    cpus: 0.5
  db:
    image: postgres:16
    environment:
      - POSTGRES_USER=app
      - FLAG
    deploy:
      resources:
        limits:
          memory: 1g
          cpus: "2"
`;

describe('parseComposeFile', () => {
	it('enumerates services with their ports, volumes and environment', () => {
		const file = parseComposeFile(SAMPLE);
		expect(Object.keys(file.services)).toEqual(['web', 'db']);
		expect(file.services.web).toMatchObject({
			image: 'node:22',
			workingDir: '/app',
			environment: { MODE: 'test', EMPTY: '' },
			ports: ['3000:3000'],
			volumes: ['./src:/app/src:ro'],
		});
		expect(file.services.db?.environment).toEqual({
			POSTGRES_USER: 'app',
			FLAG: '',
		});
	});

	it('reads limits from the short form and from deploy.resources', () => {
		const file = parseComposeFile(SAMPLE);
		expect(file.services.web?.limits).toEqual({
			memoryBytes: 512 * 1024 ** 2,
			cpus: 0.5,
		});
		expect(file.services.db?.limits).toEqual({
			memoryBytes: 1024 ** 3,
			cpus: 2,
		});
	});

	it('refuses a file with no services', () => {
		expect(() => parseComposeFile('name: x')).toThrow('no services');
		expect(() => parseComposeFile('- a')).toThrow('no services');
	});
});

describe('parseMemoryLimit', () => {
	it('understands the units compose uses', () => {
		expect(parseMemoryLimit('2048')).toBe(2048);
		expect(parseMemoryLimit('1k')).toBe(1024);
		expect(parseMemoryLimit('1.5gb')).toBe(1.5 * 1024 ** 3);
		expect(parseMemoryLimit(4096)).toBe(4096);
		expect(parseMemoryLimit('lots')).toBeUndefined();
		expect(parseMemoryLimit(undefined)).toBeUndefined();
	});
});
