import { useEffect, useRef, useState } from 'react';
import type { Report, Slide } from '../../shared/model.ts';
import { fileUrl } from '../api.ts';
import { SlideView } from '../slides/SlideView.tsx';

/** Slide statique (sans animation) adaptée à la largeur de son conteneur : vignettes. */
export function ScaledSlide({ report, slide }: { report: Report; slide: Slide }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = width / report.size.w;
  return (
    <div ref={ref} className="thumb-frame" style={{ aspectRatio: `${report.size.w} / ${report.size.h}` }}>
      {width > 0 && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <SlideView
            report={report}
            slide={slide}
            scale={scale}
            ctx={{ playing: false, animate: false, navigate: () => {}, file: (n) => fileUrl(report.id, n) }}
          />
        </div>
      )}
    </div>
  );
}
