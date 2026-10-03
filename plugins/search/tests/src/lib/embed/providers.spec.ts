import { describe, expect, it, vi } from 'vitest';

import { discoverProviders } from '../../../../src/lib/embed/providers';

describe('discoverProviders', () => {
	it('reports provider presence without exposing secret values', () => {
		const secret = 'sk-secret-value';
		const logSpy = vi
			.spyOn(console, 'log')
			.mockImplementation(() => undefined);
		const warnSpy = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined);
		const errorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);

		try {
			const providers = discoverProviders({
				OPENAI_API_KEY: secret,
				VOYAGE_API_KEY: '   ',
				COHERE_API_KEY: undefined,
			});

			expect(providers).toEqual([
				{ id: 'openai', present: true },
				{ id: 'voyage', present: false },
				{ id: 'cohere', present: false },
			]);
			expect(JSON.stringify(providers)).not.toContain(secret);
			expect(logSpy).not.toHaveBeenCalled();
			expect(warnSpy).not.toHaveBeenCalled();
			expect(errorSpy).not.toHaveBeenCalled();
		} finally {
			logSpy.mockRestore();
			warnSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});
});
