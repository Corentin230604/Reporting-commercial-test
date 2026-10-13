import { useEffect, useState } from 'react';

const cache = new Map<string, Promise<string>>();

export function loadSvg(src: string): Promise<string> {
  let p = cache.get(src);
  if (!p) {
    p = fetch(src).then((r) => (r.ok ? r.text() : ''));
    cache.set(src, p);
  }
  return p;
}

/**
 * Graphique ou tableau vectoriel intégré directement dans la page (et non via
 * <img>) : il profite ainsi des polices de l'application et reste net à tout zoom.
 */
export function InlineSvg({ src, className, style }: { src: string; className?: string; style?: React.CSSProperties }) {
  const [markup, setMarkup] = useState<string>();
  useEffect(() => {
    let alive = true;
    loadSvg(src).then((m) => alive && setMarkup(m));
    return () => {
      alive = false;
    };
  }, [src]);
  return <div className={`svg-inline ${className ?? ''}`} style={style} dangerouslySetInnerHTML={markup ? { __html: markup } : undefined} />;
}
