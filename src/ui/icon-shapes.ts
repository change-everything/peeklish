export type Shape = ['path', string] | ['circle', number, number, number] | ['rect', number, number, number, number, number];

export const ICONS = {
  underline: [
    ['path', 'M6 4v6a6 6 0 0 0 12 0V4'],
    ['path', 'M4 20h16'],
  ],
  eye: [
    ['path', 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0'],
    ['circle', 12, 12, 3],
  ],
  cursor: [
    ['path', 'M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1'],
    ['path', 'M7 22h1a4 4 0 0 0 4-4v-1'],
    ['path', 'M7 2h1a4 4 0 0 1 4 4v1'],
  ],
  globe: [
    ['circle', 12, 12, 10],
    ['path', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'],
    ['path', 'M2 12h20'],
  ],
  languages: [
    ['path', 'm5 8 6 6'],
    ['path', 'm4 14 6-6 2-3'],
    ['path', 'M2 5h12'],
    ['path', 'M7 2h1'],
    ['path', 'm22 22-5-10-5 10'],
    ['path', 'M14 18h6'],
  ],
  gauge: [
    ['path', 'm12 14 4-4'],
    ['path', 'M3.34 19a10 10 0 1 1 17.32 0'],
  ],
  sparkles: [
    ['path', 'M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z'],
    ['path', 'M20 3v4'],
    ['path', 'M22 5h-4'],
  ],
  book: [
    ['path', 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'],
    ['path', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  ],
  sliders: [
    ['path', 'M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4'],
  ],
  home: [
    ['path', 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'],
    ['path', 'M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  ],
  gear: [
    ['path', 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'],
    ['circle', 12, 12, 3],
  ],
  chevron: [['path', 'm9 18 6-6-6-6']],
  speaker: [
    ['path', 'M11 4.7a.7.7 0 0 0-1.2-.5L6.41 7.59A1.4 1.4 0 0 1 5.42 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.42a1.4 1.4 0 0 1 1 .41l3.38 3.39a.7.7 0 0 0 1.2-.5z'],
    ['path', 'M16 9a5 5 0 0 1 0 6'],
    ['path', 'M19.36 18.36a9 9 0 0 0 0-12.73'],
  ],
  close: [['path', 'M18 6 6 18M6 6l12 12']],
  check: [['path', 'M20 6 9 17l-5-5']],
  bookmark: [['path', 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z']],
  copy: [
    ['rect', 8, 8, 14, 14, 2],
    ['path', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  ],
  search: [
    ['circle', 11, 11, 8],
    ['path', 'm21 21-4.3-4.3'],
  ],
  trash: [
    ['path', 'M3 6h18'],
    ['path', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'],
    ['path', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
  ],
  info: [
    ['circle', 12, 12, 10],
    ['path', 'M12 16v-4'],
    ['path', 'M12 8h.01'],
  ],
  shield: [
    ['path', 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
  ],
  key: [
    ['path', 'm15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4'],
    ['path', 'm21 2-9.6 9.6'],
    ['circle', 7.5, 15.5, 5.5],
  ],
  flask: [
    ['path', 'M14 2v6a2 2 0 0 0 .25.96l5.5 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.75-2.96l5.5-10.08A2 2 0 0 0 10 8V2'],
    ['path', 'M6.45 15h11.1'],
    ['path', 'M8.5 2h7'],
  ],
  wand: [
    ['path', 'm21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72'],
    ['path', 'm14 7 3 3'],
    ['path', 'M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9'],
  ],
  more: [
    ['circle', 5, 12, 1],
    ['circle', 12, 12, 1],
    ['circle', 19, 12, 1],
  ],
  lightbulb: [
    ['path', 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5'],
    ['path', 'M9 18h6'],
    ['path', 'M10 22h4'],
  ],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

export function iconElement(doc: Document, name: IconName, size = 18): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const shape of ICONS[name] as Shape[]) {
    const node = doc.createElementNS(ns, shape[0]);
    if (shape[0] === 'path') node.setAttribute('d', shape[1]);
    else if (shape[0] === 'circle') {
      node.setAttribute('cx', String(shape[1]));
      node.setAttribute('cy', String(shape[2]));
      node.setAttribute('r', String(shape[3]));
    } else {
      node.setAttribute('x', String(shape[1]));
      node.setAttribute('y', String(shape[2]));
      node.setAttribute('width', String(shape[3]));
      node.setAttribute('height', String(shape[4]));
      node.setAttribute('rx', String(shape[5]));
    }
    svg.append(node);
  }
  return svg;
}
