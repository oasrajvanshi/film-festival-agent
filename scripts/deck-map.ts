// Writes public/deck/boulder.svg: the 13 Sundance 2027 venues on Boulder's streets, for the deck.
//   npx tsx scripts/deck-map.ts
import { writeFileSync } from 'node:fs';
import { MAP_MAJOR, MAP_MINOR, MAP_RES, MAP_WATER, MAP_PARK, MAP_CAMPUS, MAP_HWY, MAP_PED, project } from '../src/data/boulder-map';
import { VENUES } from '../src/data/sundance2027';
const pts = VENUES.map(v => ({ v, p: project(v.lat, v.lng) }));
const xs = pts.map(x => x.p[0]), ys = pts.map(x => x.p[1]);
const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 70, y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 40;
const w = x1 - x0, h = y1 - y0, u = w / 900;
const pins = pts.map(({ v, p: [x, y] }) => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="${(v.role === 'screen' ? 11 : 8) * u}" fill="${v.role === 'screen' ? '#c99863' : '#efe5d3'}" stroke="#120b09" stroke-width="${2.5 * u}"/></g>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(0)} ${y0.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}">
<rect x="${x0 - 50}" y="${y0 - 50}" width="${w + 100}" height="${h + 100}" fill="#150e0b"/>
<path d="${MAP_PARK}" fill="rgba(147,178,126,.08)"/><path d="${MAP_CAMPUS}" fill="rgba(201,152,99,.07)"/>
<path d="${MAP_WATER}" fill="none" stroke="#4f6f7e" stroke-width="${2.2 * u}" opacity=".8"/>
<path d="${MAP_RES}" fill="none" stroke="rgba(236,226,208,.08)" stroke-width="${u}"/>
<path d="${MAP_MINOR}" fill="none" stroke="rgba(236,226,208,.14)" stroke-width="${2.5 * u}"/>
<path d="${MAP_MAJOR}" fill="none" stroke="rgba(236,226,208,.24)" stroke-width="${2.6 * u}"/>
<path d="${MAP_HWY}" fill="none" stroke="rgba(201,152,99,.3)" stroke-width="${3.4 * u}"/>
<path d="${MAP_PED}" fill="none" stroke="rgba(227,183,132,.6)" stroke-width="${4 * u}"/>
${pins}</svg>`;
writeFileSync('public/deck/boulder.svg', svg);
console.log('wrote public/deck/boulder.svg', (svg.length / 1024).toFixed(0), 'KB');
