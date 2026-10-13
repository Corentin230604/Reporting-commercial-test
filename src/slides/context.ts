import { createContext, useContext } from 'react';
import type { Link } from '../../shared/model.ts';

export interface SlideCtx {
  /** La slide est affichée et ses animations sont lancées. */
  playing: boolean;
  /** Les animations sont activées (désactivées pour l'impression et les vignettes). */
  animate: boolean;
  navigate: (link: Link) => void;
  /** URL d'un fichier du reporting. */
  file: (name: string) => string;
  zoom?: (src: string) => void;
}

export const SlideContext = createContext<SlideCtx>({
  playing: false,
  animate: false,
  navigate: () => {},
  file: (n) => n,
});

export const useSlideCtx = () => useContext(SlideContext);
