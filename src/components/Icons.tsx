/** Icônes au trait (style homogène, 18 px par défaut). */
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

type P = { size?: number };
const S = ({ size = 18, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden>{children}</svg>
);

export const IconGrid = (p: P) => <S {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></S>;
export const IconExpand = (p: P) => <S {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></S>;
export const IconPdf = (p: P) => <S {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 12v6M9.5 15.5 12 18l2.5-2.5" /></S>;
export const IconLink = (p: P) => <S {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></S>;
export const IconLeft = (p: P) => <S {...p}><path d="M15 18l-6-6 6-6" /></S>;
export const IconRight = (p: P) => <S {...p}><path d="M9 18l6-6-6-6" /></S>;
export const IconClose = (p: P) => <S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>;
export const IconUpload = (p: P) => <S {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" /></S>;
export const IconTrash = (p: P) => <S {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></S>;
export const IconPlay = (p: P) => <S {...p}><path d="M7 4v16l13-8z" /></S>;
export const IconHome = (p: P) => <S {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></S>;
export const IconReplay = (p: P) => <S {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></S>;
export const IconDownload = (p: P) => <S {...p}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></S>;
