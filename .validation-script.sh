#!/bin/bash
cd /home/cartago/_projects/mcp-vertex

echo "=== Git Status ===" > /tmp/validation-output.txt
git status --porcelain >> /tmp/validation-output.txt 2>&1

echo "" >> /tmp/validation-output.txt
echo "=== Type Check ===" >> /tmp/validation-output.txt
bun run type >> /tmp/validation-output.txt 2>&1
TYPE_EXIT=$?
echo "Exit code: $TYPE_EXIT" >> /tmp/validation-output.txt

echo "" >> /tmp/validation-output.txt
echo "=== Lint ===" >> /tmp/validation-output.txt
bun run lint >> /tmp/validation-output.txt 2>&1
LINT_EXIT=$?
echo "Exit code: $LINT_EXIT" >> /tmp/validation-output.txt

echo "" >> /tmp/validation-output.txt
echo "=== Test Glossary ===" >> /tmp/validation-output.txt
bun run test --filter proposal-glossary >> /tmp/validation-output.txt 2>&1
TEST_EXIT=$?
echo "Exit code: $TEST_EXIT" >> /tmp/validation-output.txt

echo "" >> /tmp/validation-output.txt
echo "=== Summary ===" >> /tmp/validation-output.txt
echo "Type: $TYPE_EXIT, Lint: $LINT_EXIT, Test: $TEST_EXIT" >> /tmp/validation-output.txt
