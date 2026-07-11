import { describe, expect, it } from 'vitest';

import { scaffoldExtensionHostFiles } from '@mcp-vertex/core/public';

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
		expect(pkg?.content).toContain('@mcp-vertex/ui-extension');
		expect(pkg?.content).toContain('@mcp-vertex/client');

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
});
