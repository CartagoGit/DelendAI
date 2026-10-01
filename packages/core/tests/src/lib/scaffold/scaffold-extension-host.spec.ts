import { describe, expect, it } from 'vitest';

import { scaffoldExtensionHostFiles } from '@delendai/core/public';

describe('scaffoldExtensionHostFiles', () => {
	it('generates a TypeScript reference extension host skeleton', () => {
		const files = scaffoldExtensionHostFiles({
			hostName: 'JetBrains',
			description: 'JetBrains host adapter.',
		});
		const paths = files.map((file) => file.path);

		expect(paths).toContain('extension-hosts/jetbrains/package.json');
		expect(paths).toContain('extension-hosts/jetbrains/tsconfig.json');
		expect(paths).toContain(
			'extension-hosts/jetbrains/src/host-adapter.ts',
		);
		expect(paths).toContain(
			'extension-hosts/jetbrains/src/commands/open-overview.ts',
		);
		expect(paths).toContain(
			'extension-hosts/jetbrains/tests/open-overview.spec.ts',
		);

		const pkg = files.find((file) => file.path.endsWith('package.json'));
		expect(pkg?.content).toContain('@delendai/ui-extension');
		expect(pkg?.content).toContain('@delendai/client');

		const adapter = files.find((file) =>
			file.path.endsWith('host-adapter.ts'),
		);
		expect(adapter?.content).toContain('IHostAdapter');
		expect(adapter?.content).toContain('registerCommand');
		expect(adapter?.content).toContain('createWebviewPanel');
		expect(adapter?.content).toContain('showInformationMessage');

		const command = files.find((file) =>
			file.path.endsWith('open-overview.ts'),
		);
		expect(command?.content).toContain('OverviewService');
		expect(command?.content).toContain('renderJsonHtml');
		expect(command?.content).toContain('getOverview({ compact: true })');
	});

	it('preserves the generated host id for repeated separators in hostName', () => {
		const files = scaffoldExtensionHostFiles({
			hostName: '  JetBrains___IDE!!!  ',
			description: 'JetBrains host adapter.',
		});
		expect(files.map((file) => file.path)).toContain(
			'extension-hosts/jetbrains-ide/package.json',
		);
	});

	it('normalises a long separator run in hostName quickly', () => {
		const started = Date.now();
		const files = scaffoldExtensionHostFiles({
			hostName: `JetBrains${'!'.repeat(40_000)}IDE`,
			description: 'JetBrains host adapter.',
		});
		expect(files.map((file) => file.path)).toContain(
			'extension-hosts/jetbrains-ide/package.json',
		);
		expect(Date.now() - started).toBeLessThan(500);
	});
});
