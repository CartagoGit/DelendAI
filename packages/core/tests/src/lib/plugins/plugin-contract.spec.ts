/**
 * plugin-contract.spec.ts — f00251 S2.
 *
 * Compile-time type tests for the two fields added to the plugin contract:
 *   - IMcpPluginRegistrations.errorSinks
 *   - IMcpPluginContext.errorCollector
 *
 * Uses vitest expectTypeOf assertions so TypeScript validates the shapes at
 * compilation and vitest confirms no runtime regression.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
	IMcpPlugin,
	IMcpPluginContext,
	IMcpPluginRegistrations,
} from '../../../../src/lib/plugins/plugin-contract.js';
import type { IErrorSink } from '../../../../src/lib/error-collection/sink.interface.js';
import type { IErrorCollector } from '../../../../src/lib/error-collection/collector.interface.js';

// ---------------------------------------------------------------------------
// Shape tests
// ---------------------------------------------------------------------------

describe('IMcpPluginRegistrations — f00251 errorSinks field', () => {
	it('errorSinks is readonly IErrorSink[] or undefined', () => {
		type ActualType = IMcpPluginRegistrations['errorSinks'];
		expectTypeOf<ActualType>().toEqualTypeOf<
			readonly IErrorSink[] | undefined
		>();
	});

	it('accepts a registration object with errorSinks populated', () => {
		const fakeSink: IErrorSink = {
			id: 'test-sink',
			async record() {},
		};

		const reg: IMcpPluginRegistrations = {
			errorSinks: [fakeSink],
		};

		expect(reg.errorSinks).toHaveLength(1);
	});

	it('accepts a registration object without errorSinks (optional)', () => {
		const reg: IMcpPluginRegistrations = {};
		expect(reg.errorSinks).toBeUndefined();
	});
});

describe('IMcpPluginContext — f00251 errorCollector field', () => {
	it('errorCollector is IErrorCollector or undefined', () => {
		type ActualType = IMcpPluginContext['errorCollector'];
		expectTypeOf<ActualType>().toEqualTypeOf<IErrorCollector | undefined>();
	});
});

describe('IMcpPlugin — example field', () => {
	it('example is a readonly config object or undefined', () => {
		type ActualType = IMcpPlugin['example'];
		expectTypeOf<ActualType>().toEqualTypeOf<
			Readonly<Record<string, unknown>> | undefined
		>();
	});
});
