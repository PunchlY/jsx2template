import ts from 'typescript';

function JsxToTemplatePlugin(): Bun.BunPlugin {
    return {
        name: 'jsx-to-template',
        setup(build) {
            const printer = ts.createPrinter();
            build.onLoad({ filter: /\.[jt]sx$/ }, async ({ path, loader }) => {
                const file = Bun.file(path);
                const sourceFile = ts.createSourceFile(path, await file.text(), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
                const transformed = replaceJsxToTemplateCall(addExtraImports(sourceFile));
                const code = printer.printFile(transformed);
                return { contents: code, loader };
            });
        },
    };
}

const htmlTag = /* @__PURE__ */ ts.factory.createTempVariable(undefined);

function nameImport(name: keyof typeof import('./html')) {
    return ts.factory.createPropertyAccessExpression(htmlTag, name);
}

function addExtraImports(ast: ts.SourceFile) {
    const allImports = [...ast.statements];
    allImports.unshift(ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
            false,
            undefined,
            ts.factory.createNamespaceImport(htmlTag),
        ),
        ts.factory.createStringLiteral(Bun.fileURLToPath(import.meta.resolve('./html'))),
    ));
    return ts.factory.updateSourceFile(ast, allImports);
}

function replaceJsxToTemplateCall<T extends ts.Node>(node: T): T;
function replaceJsxToTemplateCall(node: ts.JsxFragment | ts.JsxElement): ts.ObjectLiteralExpression;
function replaceJsxToTemplateCall<T extends ts.Node>(node: T): T | ts.ObjectLiteralExpression {
    if (ts.isJsxFragment(node) || ts.isJsxElement(node))
        return transformation(node);
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
                    nameImport('escapeHTML'),
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
                if (children && children.length) {
                    const childrenElements = children.flatMap((child) => {
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
                    });
                    expressions.push(ts.factory.createCallExpression(
                        tagName,
                        undefined,
                        [ts.factory.createObjectLiteralExpression([
                            ...JsxAttributesToObjectLiteralElements(attributes),
                            ts.factory.createPropertyAssignment(
                                'children',
                                childrenElements.length === 1
                                    ? childrenElements[0]!
                                    : ts.factory.createArrayLiteralExpression(childrenElements),
                            ),
                        ])],
                    ));
                } else {
                    expressions.push(ts.factory.createCallExpression(
                        tagName,
                        undefined,
                        [ts.factory.createObjectLiteralExpression(
                            [...JsxAttributesToObjectLiteralElements(attributes)],
                        )],
                    ));
                }
                strings.push('');
            } else {
                const tagNameText = tagName.kind === ts.SyntaxKind.JsxNamespacedName
                    ? `${tagName.namespace.text}:${tagName.name.text}`
                    : tagName.text;
                strings[strings.length - 1] += `<${tagNameText}`;
                const attes = [...JsxAttributesToObjectLiteralElements(attributes)];
                if (attes.length) {
                    expressions.push(ts.factory.createCallExpression(
                        nameImport('attributes'),
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

function transformation(node: ts.JsxChild) {
    const { strings, expressions } = parse(node);
    let returnValue;
    if (strings.length === 1) {
        returnValue = ts.factory.createNoSubstitutionTemplateLiteral(strings[0]!);
    } else {
        const head = ts.factory.createTemplateHead(strings.shift()!);
        const tail = ts.factory.createTemplateTail(strings.pop()!);
        const middles = strings.map((s) => ts.factory.createTemplateMiddle(s));
        const spans = [...middles, tail].map((s, i) => ts.factory.createTemplateSpan(expressions[i]!, s));
        returnValue = ts.factory.createTemplateExpression(head, spans);
    }
    return ts.factory.createObjectLiteralExpression([
        ts.factory.createPropertyAssignment('$$typeof', nameImport('$$typeof')),
        ts.factory.createPropertyAssignment('toString', ts.factory.createArrowFunction(
            undefined,
            undefined,
            [],
            undefined,
            undefined,
            returnValue,
        )),
    ]);
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
