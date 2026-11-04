import Image from 'next/image';

/**
 * CHAMPION · NEW BURGER header from the owner's artwork (/brand/champion-header.jpg, 640x234).
 * The artwork is the top of an orange badge frame; the frame's vertical edges are at x=26..612 of 640 px,
 * so the orange body below is inset by the same 4.0625% / 91.72% and continues the frame seamlessly.
 * Multiply blend makes the artwork's white background take the page colour (#FFF6EC): the body colour
 * #F95C00 equals the badge orange (249,96,0) after that blend.
 * The body min-height reads the CSS variable --ch-body-h when an ancestor sets it (responsive pages), else bodyMinHeight.
 */
export function ChampionHeader({ children, bodyMinHeight = 250, className }: { children?: React.ReactNode; bodyMinHeight?: number; className?: string }) {
  return (
    <div className={className} style={{ position: 'relative', background: '#FFF6EC' }}>
      <Image src="/brand/champion-header.jpg" alt="CHAMPION — New burger" width={640} height={234} priority unoptimized
        style={{ display: 'block', width: '100%', height: 'auto', mixBlendMode: 'multiply' }} />
      <div style={{ marginLeft: '4.0625%', width: '91.72%', marginTop: -1, minHeight: `var(--ch-body-h, ${bodyMinHeight}px)`, background: '#F95C00', borderRadius: '0 0 34px 34px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

/** Slugs whose product page / banner use the CHAMPION artwork. */
export const CHAMPION_SLUGS = ['champion'];
