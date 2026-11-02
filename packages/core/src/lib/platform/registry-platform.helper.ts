/**
 * registry-platform.helper.ts — this machine as the Agent Client Protocol
 * registry names platforms (`linux-x86_64`, `darwin-aarch64`,
 * `windows-x86_64`), to pick an agent's release archive.
 */
export const registryPlatform = (
	platform: string = process.platform,
	arch: string = process.arch,
): string =>
	`${platform === 'win32' ? 'windows' : platform}-${arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : arch}`;
