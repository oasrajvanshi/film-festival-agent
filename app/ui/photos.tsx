// Photos picked from Sienna's mood board options (docs/design/photo-options.html).
// All from Unsplash under the Unsplash License (free for commercial use, credit not required).
// The warm grade in globals.css (.ph-img) pulls each one toward the dark cinema palette.

const u = (id: string, w = 1400) => `https://images.unsplash.com/photo-${id}?w=${w}&q=72&auto=format&fit=crop`;

export const PHOTOS = {
  hero: { src: u('1485095329183-d0797cdc5676', 2000), alt: 'An audience in red velvet seats facing a bright screen', by: 'Jake Hills' },
  onboard: { src: u('1779696304968-fe2320d1db2c'), alt: 'A projectionist working a vintage projector with golden reels', by: 'Declan Sun' },
  organizer: { src: u('1792651431334-df768399d66f'), alt: 'A quiet cinema lobby with warm light and numbered theatre doors', by: 'Maximilian Bungart' },
  staff: { src: u('1785301501180-01d91682fe57'), alt: 'Two people in an ornate theatre with red seats', by: 'Yanhao Fang' },
  attendee: { src: u('1517604931442-7e0c8ed2963c'), alt: 'A person watching a film, lit by the screen', by: 'Krists Luhaers' },
  vendor: { src: u('1758216535068-02a000758bc2'), alt: 'A popcorn machine glowing at night', by: 'Maxim Nikiforov' },
  snow: { src: u('1677253170860-b5f20dab49c3', 1600), alt: 'Two people crossing a snowy street', by: 'Marcin Skalij' },
  flight: { src: u('1530521954074-e64f6810b32d'), alt: 'A traveller waiting at the gate with a plane outside', by: 'JESHOOTS.COM' },
  change: { src: u('1771574203514-e2901e26e4ed'), alt: 'A glowing screen number reflected on a shiny floor', by: 'Adhitya Sibikumar' },
} as const;

export type PhotoKey = keyof typeof PHOTOS;

/** Photo layer for a .hero block: sits behind the text, under a dark shade. */
export function HeroPhoto({ k }: { k: PhotoKey }) {
  const p = PHOTOS[k];
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ph-img" src={p.src} alt="" title={`Photo: ${p.by} / Unsplash`} loading="lazy" decoding="async" />
      <span className="ph-shade" aria-hidden="true" />
    </>
  );
}

/** A short photo strip at the top of a card. */
export function PhotoBand({ k, label }: { k: PhotoKey; label?: string }) {
  const p = PHOTOS[k];
  return (
    <figure className="ph-band">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ph-img" src={p.src} alt={p.alt} title={`Photo: ${p.by} / Unsplash`} loading="lazy" decoding="async" />
      <span className="ph-shade" aria-hidden="true" />
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}
