import type { IExtensionSettings } from '@mcp-vertex/client';

import { escapeHtml } from '../dashboard/format';

export interface IRenderSettingsOptions {
	readonly settings: IExtensionSettings;
	readonly saveCommand: string;
	readonly resetCommand: string;
}

const selected = (actual: string, expected: string): string =>
	actual === expected ? ' selected' : '';

export const renderSettings = (options: IRenderSettingsOptions): string => {
	const { settings } = options;
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>mcp-vertex Settings</title>
	<style>
		body { font-family: var(--vscode-font-family, system-ui); padding: 16px; }
		label { display: block; margin: 0 0 12px; }
		input, select { width: 100%; max-width: 520px; }
		.mv-actions { display: flex; gap: 8px; margin-top: 16px; }
	</style>
</head>
<body>
	<h1>mcp-vertex Settings</h1>
	<form data-save-command="${escapeHtml(options.saveCommand)}" data-reset-command="${escapeHtml(options.resetCommand)}">
		<label>Docs URL
			<input name="docsUrl" value="${escapeHtml(settings.docsUrl)}" />
		</label>
		<label>
			<input type="checkbox" name="allowLocalhost"${settings.allowLocalhost ? ' checked' : ''} />
			Allow localhost docs URL
		</label>
		<label>
			<input type="checkbox" name="allowPrivateIps"${settings.allowPrivateIps ? ' checked' : ''} />
			Allow private IP docs URL
		</label>
		<label>Log level
			<select name="logLevel">
				<option value="debug"${selected(settings.logLevel, 'debug')}>debug</option>
				<option value="info"${selected(settings.logLevel, 'info')}>info</option>
				<option value="warn"${selected(settings.logLevel, 'warn')}>warn</option>
				<option value="error"${selected(settings.logLevel, 'error')}>error</option>
			</select>
		</label>
		<label>Theme
			<select name="theme">
				<option value="system"${selected(settings.theme, 'system')}>system</option>
				<option value="light"${selected(settings.theme, 'light')}>light</option>
				<option value="dark"${selected(settings.theme, 'dark')}>dark</option>
			</select>
		</label>
		<div class="mv-actions">
			<button type="submit">Save</button>
			<button type="reset">Reset</button>
		</div>
	</form>
</body>
</html>`;
};
