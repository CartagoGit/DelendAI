import type { IDogmaAdapter } from '../contracts';

/**
 * Go dogma (Go 1.22).
 *
 * Single Responsibility: the one place that declares idiomatic Go.
 */
export const GO_DOGMA: IDogmaAdapter = {
	language: 'go',
	displayName: 'Go',
	version: 'go-1.22',
	packageManager: 'go mod',
	ownership: 'gc',
	errorModel: 'multi-return',
	nullSafety: 'nil-pointer',
	naming: 'mixed',
	async: 'goroutines',
	visibility: 'public',
	immutability: 'default-mutable',
	testing: 'table-driven',
	bullets: [
		'Errors are values: return `(T, error)`; wrap with `fmt.Errorf("...: %w", err)`, never panic in libraries.',
		'Exported identifiers are PascalCase; unexported are camelCase — capitalisation IS the visibility modifier.',
		'Do not communicate by sharing memory; share memory by communicating (channels).',
		'Accept interfaces, return concrete types; keep interfaces small (often one method).',
		'Test by table: `[]struct{name string; in T; want U}` iterated with `t.Run`.',
		'Run `gofmt`/`goimports` + `golangci-lint run ./...` + `go vet ./...` before committing.',
	],
};
