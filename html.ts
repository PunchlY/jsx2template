
const $$typeof = Symbol.for('react.transitional.element');

function attributes(attributes: Record<string, unknown>) {
    let str = '';
    for (const [name, value] of Object.entries(attributes)) {
        if (value === null || value === undefined || value === false)
            continue;
        if (value === true)
            str += ` ${name}`;
        else
            str += ` ${name}="${escapeHTML(value)}"`;
    }
    return str;
}

function escapeHTML(value: unknown): string {
    switch (typeof value) {
        case 'boolean':
        case 'undefined':
            return '';
        case 'object':
            if (value === null)
                return '';
            if (Object.hasOwn(value, '$$typeof') && Reflect.get(value, '$$typeof') === $$typeof)
                return String(value);
            if (Array.isArray(value))
                return value.map(escapeHTML).join(' ');
    }
    return Bun.escapeHTML(value!);
}

export { $$typeof, attributes, escapeHTML };

declare global {
    namespace JSX {
        interface Element {
            $$typeof: symbol;
        }
        interface IntrinsicElements {
            [name: string]: any;
        }
    }
}
