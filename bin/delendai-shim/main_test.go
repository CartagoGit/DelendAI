package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindCLIEntryFromFindsRepoLocalCLIWithinAncestorWindow(t *testing.T) {
	root := t.TempDir()
	cliEntry := filepath.Join(root, "packages", "cli", "src", "index.ts")
	if err := os.MkdirAll(filepath.Dir(cliEntry), 0o755); err != nil {
		t.Fatalf("mkdir cli tree: %v", err)
	}
	if err := os.WriteFile(cliEntry, []byte("export {};\n"), 0o644); err != nil {
		t.Fatalf("write cli entry: %v", err)
	}
	startDir := filepath.Join(root, "dist")
	if err := os.MkdirAll(startDir, 0o755); err != nil {
		t.Fatalf("mkdir start dir: %v", err)
	}

	got := findCLIEntryFrom(startDir)
	if got != cliEntry {
		t.Fatalf("findCLIEntryFrom(%q) = %q, want %q", startDir, got, cliEntry)
	}
}

func TestFindCLIEntryFromReturnsEmptyWithoutRepoLocalCLI(t *testing.T) {
	startDir := filepath.Join(t.TempDir(), "bin")
	if err := os.MkdirAll(startDir, 0o755); err != nil {
		t.Fatalf("mkdir start dir: %v", err)
	}

	if got := findCLIEntryFrom(startDir); got != "" {
		t.Fatalf("findCLIEntryFrom(%q) = %q, want empty", startDir, got)
	}
}