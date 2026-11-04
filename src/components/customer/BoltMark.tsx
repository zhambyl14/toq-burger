import Image from 'next/image';

/** The TOK BURGER lightning bolt as a decorative mark (orange gradient = icon2, ink = icon1). aria-hidden. */
export function BoltMark({ size = 48, tone = 'orange', rotate = 0, style, className }: {
  size?: number; tone?: 'orange' | 'ink'; rotate?: number; style?: React.CSSProperties; className?: string;
}) {
  return (
    <Image src={tone === 'ink' ? '/brand/bolt-ink.png' : '/brand/bolt-orange.png'} alt="" width={size} height={size} unoptimized aria-hidden="true"
      className={className} style={{ display: 'block', flex: 'none', transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style }} />
  );
}
