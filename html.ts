
const HTML = Symbol('HTML');

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
            if (HTML in value)
                return value[HTML] as string;
            if (Array.isArray(value))
                return value.map(escapeHTML).join(' ');
    }
    return Bun.escapeHTML(value!);
}

function isElement(value: unknown): value is JSX.Element {
    return value !== undefined && value !== null && Reflect.has(value, HTML);
}

function toString(this: { [key in typeof HTML]: string; }) {
    return this[HTML];
}

export { HTML, attributes, escapeHTML, toString, isElement };

declare global {
    namespace JSX {
        interface Element {
        }
        interface IntrinsicElements {
            [name: string]: any;
        }
    }
}
