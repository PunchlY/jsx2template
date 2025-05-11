import { attributes, escapeHTML, $$typeof } from './html';

function jsx(type: string | ((config: any) => JSX.Element) | typeof Fragment, props: any, key: unknown) {
    return {
        $$typeof,
        type,
        props,
        key,
        toString() {
            if (typeof type === 'function')
                return type(props).toString();
            const { children, ...attrs } = props;
            const html = Array.isArray(children)
                ? children.map(escapeHTML).join('')
                : escapeHTML(children);
            if (typeof type === 'string')
                return `<${type}${attributes(attrs)}>${html}</${type}>`;
            return html;
        },
    } as JSX.Element;
}

const Fragment = /* @__PURE__ */ Symbol.for('react.fragment');

export { jsx, jsx as jsxDEV, Fragment };
