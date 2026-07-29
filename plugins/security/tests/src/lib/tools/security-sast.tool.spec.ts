import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../../tools/scripts/lib/test-mcp-server';
import { buildSecuritySastRegistration } from '../../../../src/lib/tools/security-sast.tool';

const fakeDetectStack = async () =>
	({ pack: 'generic', languages: [], files: [] }) as const;
const fakeRunSastRunner = async () => ({
	source: 'fallback' as const,
	scanned: 0,
	findings: [],
});

describe('security_sast tool', () => {
	it('scans the workspace root when no cwd override is passed', async () => {
		const captured = await captureToolRegistration(
			buildSecuritySastRegistration({
				namespacePrefix: 'mcp',
				workspaceRootAbs: '/tmp/security-fixture',
				detectStack: fakeDetectStack,
				runSastRunner: fakeRunSastRunner,
			}),
		);
		const out = (await captured.invoke({})) as { tool: string };
		expect(out.tool).toBe('sast');
	});

	// x00168 (S4): `cwd` used to reach `detectStack`/`runSastRunner` with
	// zero containment check — same bug class as security_deps' F16.
	it('rejects a cwd that escapes the workspace', async () => {
		const captured = await captureToolRegistration(
			buildSecuritySastRegistration({
				namespacePrefix: 'mcp',
				workspaceRootAbs: '/tmp/security-fixture',
				detectStack: fakeDetectStack,
				runSastRunner: fakeRunSastRunner,
			}),
		);
		const out = (await captured.invoke({
			cwd: '../../../../etc',
		})) as { error?: unknown };
		expect(out.error).toBeDefined();
	});

	it('rejects an absolute cwd', async () => {
		const captured = await captureToolRegistration(
			buildSecuritySastRegistration({
				namespacePrefix: 'mcp',
				workspaceRootAbs: '/tmp/security-fixture',
				detectStack: fakeDetectStack,
				runSastRunner: fakeRunSastRunner,
			}),
		);
		const out = (await captured.invoke({ cwd: '/etc' })) as {
			error?: unknown;
		};
		expect(out.error).toBeDefined();
	});
});
