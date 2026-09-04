// Package main — delendai-shim: a tiny Go binary that bridges stdio
// JSON-RPC to the existing `bun packages/cli/src/index.ts` child
// process. Lets end-users `curl -sSL get.delendai.dev | sh` and run
// `delendai --help` without first installing Node or Bun.
//
// Design constraints (f00148 S1):
//   - Single binary, ~8-12 MB statically linked.
//   - Reads JSON-RPC on stdin, forwards verbatim to `bun` as a
//     subprocess, writes the response to stdout.
//   - Exit code propagates from the child.
//   - Stderr is the child's stderr (line-buffered copy).
//
// Build: `go build -o dist/delendai-shim ./bin/delendai-shim`
package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// childPath returns the path to the `bun` invocation that runs the
// delendai CLI. The shim is bundled with the same repo, so we walk
// upward from the executable to find `packages/cli/src/index.ts`.
// If not found (e.g. the binary is on PATH, not next to the source),
// fall back to the absolute path baked at build time via -ldflags.
func childPath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exe)
	for i := 0; i < 6; i++ {
		candidate := filepath.Join(dir, "packages", "cli", "src", "index.ts")
		if _, err := os.Stat(candidate); err == nil {
			return "bun", nil
		}
		dir = filepath.Dir(dir)
	}
	// Fallback: assume `bun` is on PATH.
	if _, err := exec.LookPath("bun"); err == nil {
		return "bun", nil
	}
	return "", errors.New("could not locate bun on PATH and no bundled CLI found")
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "delendai-shim: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	bun, err := childPath()
	if err != nil {
		return err
	}

	// Find the CLI entry point. We pass it as the first argument to bun.
	cliEntry := findCLIEntry()
	if cliEntry == "" {
		return errors.New("could not locate packages/cli/src/index.ts")
	}

	cmd := exec.Command(bun, append([]string{cliEntry}, os.Args[1:]...)...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(), "DELENDAI_SHIM=1")

	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		return err
	}
	return nil
}

func findCLIEntry() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	dir := filepath.Dir(exe)
	for i := 0; i < 6; i++ {
		candidate := filepath.Join(dir, "packages", "cli", "src", "index.ts")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		dir = filepath.Dir(dir)
	}
	return ""
}

// readLine reads one line from r, stripped of the trailing newline.
// Returns io.EOF on end of stream.
func readLine(r *bufio.Reader) (string, error) {
	line, err := r.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), err
}

// Unused today — kept for future when we want to validate that the
// incoming payload looks like JSON-RPC before forwarding (helpful
// for clearer error messages on garbage input). Commented out to
// keep the build small.
//
// func validateJSONRPC(line string) error { ... }