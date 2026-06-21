import re

src = open('apps/vscode/src/extension.ts', 'rb').read().decode()
i = src.find('f125')
print(repr(src[i:i+200]))
print('---')
# Search for the import statement
print('Has static import?', "createVscodeHostAdapter" in src and "./host/vscode-host-adapter" in src)
# What about the const?
print('Has const host = create?', "const host = createVscodeHostAdapter" in src)
# Show the lines around the const
i2 = src.find('const host = create')
print(repr(src[i2-50:i2+50]) if i2 >= 0 else 'NOT FOUND')
