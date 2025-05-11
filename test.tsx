const i = 0;
const data = { uid: 101, pid: 100 };

console.debug(<>
    <p>text<a href={'/api/test'} key={1}>
        foo
        foo
        foo
    </a></p>
    <p>
        text<a href='/api/test'>foo</a>
    </p>
    i = {i}
    <Element>
        {i}
        1
        2
        {[3, , 4]}
        {{}}
        {true} <Element></Element>
        {console.log(<p></p>)}
    </Element>
    <Element></Element>
    <Element uid={100} />
    <Element {...{ uid: 101, pid: 100 }} {...data} />
    <Element {...data} />
    <Element {...{ ...data }} />
    <Element on />
    <></>
</>);

function Element<T>({ uid, pid, on, children }: { uid?: number, pid?: number, on?: boolean, children?: T; }) {
    return <div data-uid={uid} data-pid={pid}>{children}</div>;
}
