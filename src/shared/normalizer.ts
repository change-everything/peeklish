const VERB_LEMMA: Record<string, string> = {
  taken: 'take',
  taking: 'take',
  takes: 'take',
  took: 'take',
  fallen: 'fall',
  falling: 'fall',
  falls: 'fall',
  fell: 'fall',
  carried: 'carry',
  carrying: 'carry',
  carries: 'carry',
  made: 'make',
  making: 'make',
  makes: 'make',
  got: 'get',
  getting: 'get',
  gets: 'get',
  gotten: 'get',
  came: 'come',
  coming: 'come',
  comes: 'come',
  went: 'go',
  going: 'go',
  goes: 'go',
  gone: 'go',
  looked: 'look',
  looking: 'look',
  looks: 'look',
  putting: 'put',
  puts: 'put',
  setting: 'set',
  sets: 'set',
  ran: 'run',
  running: 'run',
  runs: 'run',
  turned: 'turn',
  turning: 'turn',
  turns: 'turn',
  broke: 'break',
  broken: 'break',
  breaking: 'break',
  breaks: 'break',
  brought: 'bring',
  bringing: 'bring',
  brings: 'bring',
  called: 'call',
  calling: 'call',
  calls: 'call',
  kept: 'keep',
  keeping: 'keep',
  keeps: 'keep',
  held: 'hold',
  holding: 'hold',
  holds: 'hold',
  figured: 'figure',
  figuring: 'figure',
  figures: 'figure',
  ended: 'end',
  ending: 'end',
  ends: 'end',
  pointed: 'point',
  pointing: 'point',
  points: 'point',
  worked: 'work',
  working: 'work',
  works: 'work',
  relied: 'rely',
  relying: 'rely',
  relies: 'rely',
};

const PHRASE_ALIASES: Record<string, string> = {
  'taken into account': 'take into account',
  'taking into account': 'take into account',
  'takes into account': 'take into account',
  'took into account': 'take into account',
  'fell back to': 'fall back to',
  'fallen back to': 'fall back to',
  'falling back to': 'fall back to',
  'falls back to': 'fall back to',
  'carried out': 'carry out',
  'carrying out': 'carry out',
  'carries out': 'carry out',
  'is based on': 'based on',
  'be based on': 'based on',
  'was based on': 'based on',
  'were based on': 'based on',
};

export function normalizeCanonical(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';
  if (PHRASE_ALIASES[base]) return PHRASE_ALIASES[base];
  const parts = base.split(' ');
  if (parts.length >= 2 && VERB_LEMMA[parts[0]]) {
    parts[0] = VERB_LEMMA[parts[0]];
    const next = parts.join(' ');
    return PHRASE_ALIASES[next] ?? next;
  }
  return base;
}
