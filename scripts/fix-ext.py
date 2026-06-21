import re

p = 'apps/vscode/src/extension.ts'
src = open(p, 'rb').read().decode()

i = src.find('f125')
print('CONTEXT:', repr(src[i:i+500]))
print('---')
print('Has createVscodeHostAdapter?', 'createVscodeHostAdapter' in src)

pat = re.compile(
    r'\t// f125.*?\.`\.\)\n'
    r'\tconst host = createVscodeHostAdapter\(\);\n'
    r'\tcontext\.subscriptions\.push\(\n'
    r'\t\tregisterOpenDashboardCommand\(\{(?:.*?\n)*?\t\t\}\),\n'
    r'\t\);',
    re.DOTALL,
)

GT = chr(62)
T = chr(9)
new = (
    T + '// f125 -- IDE-agnostic dashboard, lazy-loaded adapter so\n'
    + T + '// unit tests injecting a fake vscode API never resolve the\n'
    + T + '// real vscode module (unavailable outside VS Code runtime).\n'
    + T + 'if (deps.vscode === undefined) {\n'
    + T + T + 'const { createVscodeHostAdapter } = await import(\n'
    + T + T + T + "'./host/vscode-host-adapter'\n"
    + T + T + ');\n'
    + T + T + 'const host = createVscodeHostAdapter();\n'
    + T + T + 'context.subscriptions.push(\n'
    + T + T + T + 'registerOpenDashboardCommand({\n'
    + T + T + T + T + 'host,\n'
    + T + T + T + T + 'client,\n'
    + T + T + T + T + 'getConfig: () =' + GT + ' {\n'
    + T + T + T + T + T + 'try {\n'
    + T + T + T + T + T + T + 'const section =\n'
    + T + T + T + T + T + T + T + 'host.getConfiguration<' + '{\n'
    + T + T + T + T + T + T + T + T + 'readonly extension?: { readonly docsUrl?: string };\n'
    + T + T + T + T + T + T + T + '}>' + GT + "('mcp-vertex');\n"
    + T + T + T + T + T + T + 'return section ?? {};\n'
    + T + T + T + T + T + '} catch {\n'
    + T + T + T + T + T + T + 'return {};\n'
    + T + T + T + T + T + '}\n'
    + T + T + T + T + '},\n'
    + T + T + T + '}),\n'
    + T + T + ');\n'
    + T + '}\n'
)

result, n = pat.subn(new, src)
print('replacements:', n)
open(p, 'w').write(result)

