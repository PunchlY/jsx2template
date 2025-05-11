import { attributes, escapeHTML, HTML } from './html';

class Element implements JSX.Element {
    readonly $$typeof = Symbol.for('react.transitional.element');
    readonly [HTML]: string;
    constructor(
        public readonly type: string | ((config: any) => JSX.Element) | typeof Fragment,
        public readonly props: any,
    ) {
        if (typeof type === 'function') {
            this[HTML] = type(props).toString();
        } else {
            const { children, ...attrs } = props;
            let html = Array.isArray(children) ? children.map(escapeHTML).join('') : escapeHTML(children);
            if (typeof type === 'string')
                html = `<${type}${attributes(attrs)}>${html}</${type}>`;
            this[HTML] = html;
        }
    }
    toString(): string {
        return this[HTML];
    }
}

function jsx(type: string | ((config: any) => JSX.Element) | typeof Fragment, config: any, key: unknown) {
    return new Element(type, config);
}

const Fragment = /* @__PURE__ */ Symbol.for('react.fragment');

export { jsx, jsx as jsxDEV, Fragment };
