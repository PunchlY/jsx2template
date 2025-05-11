import ts from 'typescript';

function JsxToTemplatePlugin(): Bun.BunPlugin {
    return {
        name: 'jsx-to-template',
        setup(build) {
            build.onLoad({ filter: /\.[jt]sx$/ }, async ({ path, loader }) => {
                const file = Bun.file(path);
                const { outputText } = ts.transpileModule(await file.text(), {
                    compilerOptions: {
                        module: ts.ModuleKind.ESNext,
                        target: ts.ScriptTarget.ESNext,
                        jsx: ts.JsxEmit.Preserve,
                    },
                });
                let sourceFile = ts.createSourceFile(path, outputText, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
                sourceFile = addExtraImports(sourceFile);
                const code = ts
                    .createPrinter()
                    .printNode(
                        ts.EmitHint.Unspecified,
                        replaceJsxToTemplateCall(sourceFile),
                        sourceFile,
                    );
                return { contents: code, loader: loader === 'tsx' ? 'ts' : 'js' };
            });
        },
    };
}

const htmlTag = ts.factory.createTempVariable(undefined);
const attributesTag = ts.factory.createTempVariable(undefined);
const escapeTag = ts.factory.createTempVariable(undefined);
const toStringTag = ts.factory.createTempVariable(undefined);

function addExtraImports(ast: ts.SourceFile) {
    const allImports = [...ast.statements];
    allImports.unshift(ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
            false,
            undefined,
            ts.factory.createNamedImports([
                ts.factory.createImportSpecifier(
                    false,
                    ts.factory.createIdentifier('HTML'),
                    htmlTag,
                ),
                ts.factory.createImportSpecifier(
                    false,
                    ts.factory.createIdentifier('attributes'),
                    attributesTag,
                ),
                ts.factory.createImportSpecifier(
                    false,
                    ts.factory.createIdentifier('escapeHTML'),
                    escapeTag,
                ),
                ts.factory.createImportSpecifier(
                    false,
                    ts.factory.createIdentifier('toString'),
                    toStringTag,
                ),
            ]),
        ),
        ts.factory.createStringLiteral(Bun.fileURLToPath(import.meta.resolve('./html'))),
    ));
    return ts.factory.updateSourceFile(ast, allImports);
}

function replaceJsxToTemplateCall<T extends ts.Node>(node: T): T;
function replaceJsxToTemplateCall(node: ts.JsxFragment | ts.JsxElement): ts.ObjectLiteralExpression;
function replaceJsxToTemplateCall<T extends ts.Node>(node: T): T | ts.ObjectLiteralExpression {
    if (ts.isJsxFragment(node) || ts.isJsxElement(node))
        return transformation(node, true);
    return ts.visitEachChild(node, replaceJsxToTemplateCall, undefined);
}

function parse(node: ts.JsxChild, strings = [''], expressions: ts.Expression[] = []) {
    switch (node.kind) {
        case ts.SyntaxKind.JsxText: {
            if (node.containsOnlyTriviaWhiteSpaces)
                break;
            strings[strings.length - 1] += node.text
                .replaceAll(/^\s*\n\s*|\s*\n\s*$/g, '')
                .replaceAll(/\s+/g, ' ');
        } break;
        case ts.SyntaxKind.JsxExpression: if (node.expression) {
            const expression = replaceJsxToTemplateCall(node.expression);
            if (ts.isStringLiteralLike(expression)) {
                strings[strings.length - 1] += Bun.escapeHTML(expression.text);
            } else {
                expressions.push(ts.factory.createCallExpression(
                    escapeTag,
                    undefined,
                    [expression],
                ));
                strings.push('');
            }
        } break;
        case ts.SyntaxKind.JsxFragment: {
            for (const child of node.children)
                parse(child, strings, expressions);
        } break;
        case ts.SyntaxKind.JsxSelfClosingElement:
        case ts.SyntaxKind.JsxElement: {
            const tagName = node.kind === ts.SyntaxKind.JsxElement
                ? node.openingElement.tagName
                : node.tagName;
            const children = node.kind === ts.SyntaxKind.JsxElement && node.children;
            const attributes = node.kind === ts.SyntaxKind.JsxElement
                ? node.openingElement.attributes
                : node.attributes;
            if ((tagName.kind === ts.SyntaxKind.Identifier && /^[A-Z]/.test(tagName.text))
                || tagName.kind === ts.SyntaxKind.ThisKeyword
                || tagName.kind === ts.SyntaxKind.PropertyAccessExpression
            ) {
                expressions.push(ts.factory.createElementAccessExpression(
                    ts.factory.createCallExpression(
                        tagName,
                        undefined,
                        [ts.factory.createObjectLiteralExpression(children && children.length
                            ? [
                                ...JsxAttributesToObjectLiteralElements(attributes),
                                ts.factory.createPropertyAssignment(
                                    'children',
                                    children.length === 1 && children[0]?.kind === ts.SyntaxKind.JsxText
                                        ? ts.factory.createStringLiteral(children[0].text)
                                        : ts.factory.createArrayLiteralExpression(children.flatMap((child) => {
                                            if (child.kind === ts.SyntaxKind.JsxText) {
                                                if (child.containsOnlyTriviaWhiteSpaces)
                                                    return [];
                                                return ts.factory.createStringLiteral(
                                                    child.text
                                                        .replaceAll(/^\s*\n\s*|\s*\n\s*$/g, '')
                                                        .replaceAll(/\s+/g, ' '),
                                                );
                                            }
                                            if (child.kind === ts.SyntaxKind.JsxExpression) {
                                                return replaceJsxToTemplateCall(child.expression!);
                                            }
                                            return transformation(child);
                                        })),
                                ),
                            ]
                            : [...JsxAttributesToObjectLiteralElements(attributes)],
                        )],
                    ),
                    htmlTag,
                ));
                strings.push('');
            } else {
                const tagNameText = tagName.kind === ts.SyntaxKind.JsxNamespacedName
                    ? `${tagName.namespace.text}:${tagName.name.text}`
                    : tagName.text;
                strings[strings.length - 1] += `<${tagNameText}`;
                const attes = [...JsxAttributesToObjectLiteralElements(attributes)];
                if (attes.length) {
                    expressions.push(ts.factory.createCallExpression(
                        attributesTag,
                        undefined,
                        [ts.factory.createObjectLiteralExpression(attes)],
                    ));
                    strings.push('');
                }
                if (children) {
                    strings[strings.length - 1] += `>`;
                    for (const child of children)
                        parse(child, strings, expressions);
                    strings[strings.length - 1] += `</${tagNameText}>`;
                } else {
                    strings[strings.length - 1] += `/>`;
                }
            }
        } break;
    }
    return { strings, expressions };
}

function transformation(node: ts.JsxChild, isRoot = false) {
    const { strings, expressions } = parse(node);
    const properties: ts.ObjectLiteralElementLike[] = isRoot
        ? [ts.factory.createPropertyAssignment('toString', toStringTag)]
        : [];
    if (strings.length === 1) {
        properties.push(ts.factory.createPropertyAssignment(
            ts.factory.createComputedPropertyName(htmlTag),
            ts.factory.createNoSubstitutionTemplateLiteral(strings[0]!),
        ));
    } else {
        const head = ts.factory.createTemplateHead(strings.shift()!);
        const tail = ts.factory.createTemplateTail(strings.pop()!);
        const middles = strings.map((s) => ts.factory.createTemplateMiddle(s));
        const spans = [...middles, tail].map((s, i) => ts.factory.createTemplateSpan(expressions[i]!, s));
        properties.push(ts.factory.createPropertyAssignment(
            ts.factory.createComputedPropertyName(htmlTag),
            ts.factory.createTemplateExpression(head, spans),
        ));
    }
    return ts.factory.createObjectLiteralExpression(properties);
}

function* JsxAttributesToObjectLiteralElements({ properties }: ts.JsxAttributes) {
    for (const attribute of properties) {
        if (attribute.kind === ts.SyntaxKind.JsxSpreadAttribute) {
            yield ts.factory.createSpreadAssignment(attribute.expression);
        } else if (attribute.name.kind === ts.SyntaxKind.Identifier) {
            yield ts.factory.createPropertyAssignment(
                ts.factory.createStringLiteral(attribute.name.text),
                attribute.initializer
                    ? JsxAttributeValueToExpression(attribute.initializer)
                    : ts.factory.createTrue(),
            );
        } else {
            yield ts.factory.createPropertyAssignment(
                ts.factory.createStringLiteral(`${attribute.name.namespace.text}:${attribute.name.name.text}`),
                attribute.initializer
                    ? JsxAttributeValueToExpression(attribute.initializer)
                    : ts.factory.createTrue(),
            );
        }
    }
}

function JsxAttributeValueToExpression(value: ts.JsxAttributeValue) {
    if (value.kind === ts.SyntaxKind.StringLiteral)
        return ts.factory.createStringLiteral(value.text);
    if (value.kind === ts.SyntaxKind.JsxExpression) {
        if (!value.expression)
            throw new Error('JSX attributes must only be assigned a non-empty \'expression\'.');
        return replaceJsxToTemplateCall(value.expression);

    }
    return transformation(value);
}

export { JsxToTemplatePlugin };
