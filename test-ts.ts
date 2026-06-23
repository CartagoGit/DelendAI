import * as ts from 'typescript';

const code = `import { foo } from "./bar";\nexport const a = 1;`;
const sourceFile = ts.createSourceFile(
	'test.ts',
	code,
	ts.ScriptTarget.Latest,
	true,
);

const transformer =
	(context: ts.TransformationContext) => (rootNode: ts.Node) => {
		function visit(node: ts.Node): ts.Node {
			if (ts.isImportDeclaration(node)) {
				if (ts.isStringLiteral(node.moduleSpecifier)) {
					if (node.moduleSpecifier.text === './bar') {
						return ts.factory.updateImportDeclaration(
							node,
							node.modifiers,
							node.importClause,
							ts.factory.createStringLiteral(
								'../../services/bar.service',
							),
							node.assertClause,
						);
					}
				}
			}
			return ts.visitEachChild(node, visit, context);
		}
		return ts.visitNode(rootNode, visit);
	};

const result = ts.transform(sourceFile, [transformer]);
const printer = ts.createPrinter();
console.log(
	printer.printNode(
		ts.EmitHint.Unspecified,
		result.transformed[0],
		sourceFile,
	),
);
