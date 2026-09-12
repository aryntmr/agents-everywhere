// Deterministic seed data for Bayside Home Care. Pure: no API calls, no clock.

export const SKILLS = ['bathing', 'transfers', 'dementia', 'meals', 'meds', 'companionship', 'driving', 'hoyer', 'mobility', 'overnight'] as const;
export const SERIES_START = '2026-09-14'; // Monday
export const VISIT_COLOR = '#3b82f6';

export type Day = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';
const ALL_DAYS: Day[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_NAME: Record<Day, string> = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };

export type Props = Record<string, string | number>;

export type Person = {
  key: string;
  first: string;
  last: string;
  email: string;
  title: 'Caregiver' | 'Client' | 'Family contact';
  props: Props;
  notes: string[];
};

export type Caregiver = Person & { avail: Avail };
export type Client = Person & { familyKey: string };
export type Family = Person & { clientKey: string };

export type Series = {
  key: string;
  clientKey: string;
  caregiverKey: string;
  days: Day[];
  startHour: number;
  hours: number;
  /** First occurrence (YYYY-MM-DD), on or after SERIES_START. */
  firstDate: string;
  rrule: string;
  title: string;
};

export type SeedData = { caregivers: Caregiver[]; clients: Client[]; families: Family[]; series: Series[] };

type Avail = { days: Day[]; from: number; to: number; sat?: { from: number; to: number } };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAREGIVER_NAMES: [string, string, 'female' | 'male'][] = [
  ['Maria', 'Lopez', 'female'], ['Priya', 'Shah', 'female'], ['Dev', 'Mehta', 'male'], ['Rosa', 'Alvarez', 'female'],
  ['Anita', 'Desai', 'female'], ['Rahul', 'Kapoor', 'male'], ['Meera', 'Joshi', 'female'], ['Sunil', 'Rao', 'male'], ['Kavita', 'Nair', 'female'],
  ['Grace', 'Chen', 'female'], ['Linh', 'Nguyen', 'female'], ['Joy', 'Santos', 'female'], ['Carmen', 'Reyes', 'female'], ['Elena', 'Petrova', 'female'],
  ['James', 'Walker', 'male'], ['Aisha', 'Bello', 'female'], ['Marcus', 'Green', 'male'], ['Lucia', 'Moreno', 'female'], ['Hana', 'Kim', 'female'],
  ['Tomas', 'Silva', 'male'], ['Fatima', 'Haddad', 'female'], ['Olga', 'Ivanova', 'female'], ['Rey', 'Bautista', 'male'], ['Tanya', 'Brooks', 'female'],
  ['Mei', 'Wong', 'female'], ['Diego', 'Castro', 'male'], ['Amara', 'Okafor', 'female'], ['Sofia', 'Ramirez', 'female'], ['Kenji', 'Sato', 'male'],
  ['Beth', 'Collins', 'female'], ['Ana', 'Cruz', 'female'], ['Samuel', 'Tesfaye', 'male'], ['Nina', 'Volkova', 'female'], ['Lily', 'Tran', 'female'],
  ['Omar', 'Farah', 'male'], ['Rachel', 'Levy', 'female'], ['Gloria', 'Mendoza', 'female'], ['Paolo', 'Rossi', 'male'], ['Ivy', 'Lam', 'female'],
  ['Denise', 'Harris', 'female'], ['Rosario', 'Dela Cruz', 'female'], ['Victor', 'Aguilar', 'male'], ['Jin', 'Park', 'female'], ['Martha', 'Owens', 'female'],
  ['Luis', 'Herrera', 'male'], ['Teresa', 'Flores', 'female'], ['Kofi', 'Mensah', 'male'], ['Yuki', 'Tanaka', 'female'], ['Irene', 'Lau', 'female'],
  ['Carla', 'Ortega', 'female'],
];

const CLIENT_NAMES: [string, string][] = [
  ['Arun', 'Patel'], ['Harold', 'Bennett'], ['Dorothy', 'Fischer'], ['Walter', 'Nakamura'], ['Evelyn', 'Murphy'],
  ['Frank', 'Russo'], ['Gladys', 'Coleman'], ['Henry', 'Yamamoto'], ['Irene', 'Kowalski'], ['Joseph', 'Donnelly'],
  ['Ruth', 'Goldberg'], ['Albert', 'Huang'], ['Margaret', "O'Brien"], ['Eugene', 'Vasquez'], ['Mildred', 'Schultz'],
  ['Raymond', 'Liu'], ['Betty', 'Jensen'], ['George', 'Papadopoulos'], ['Helen', 'Ramos'], ['Stanley', 'Weiss'],
  ['Lorraine', 'Chu'], ['Arthur', 'Sullivan'], ['Doris', 'Hoffman'], ['Chester', 'Morales'], ['Edith', 'Lindqvist'],
  ['Leonard', 'Abrams'], ['Florence', 'Tanaka-Reed'], ['Howard', 'Gallagher'], ['Agnes', 'Novak'], ['Clarence', 'Dubois'],
  ['Marion', 'Castillo'], ['Bernard', 'Ho'], ['Vera', 'Sorensen'], ['Lloyd', 'Whitfield'], ['June', 'Takahashi'],
  ['Norman', 'Katz'], ['Alice', 'Brennan'], ['Ernest', 'Gutierrez'], ['Rose', 'Mahoney'], ['Milton', 'Zhao'],
  ['Pearl', 'Hendricks'], ['Oscar', 'Lindgren'], ['Sylvia', 'Marino'], ['Wallace', 'Kwan'], ['Loretta', 'Byrne'],
  ['Herbert', 'Salazar'], ['Beatrice', 'Olsen'], ['Vincent', 'Feng'], ['Hazel', 'Duarte'], ['Cecil', 'Abernathy'],
];

const FAMILY_FIRSTS = [
  'Neha', 'Karen', 'Susan', 'Kevin', 'Laura', 'Michael', 'Denise', 'Brian', 'Paula', 'Steven',
  'Deborah', 'Jason', 'Colleen', 'Daniel', 'Heidi', 'Wendy', 'Eric', 'Nicole', 'Rita', 'Adam',
  'Tina', 'Patrick', 'Julie', 'Carlos', 'Anna', 'Mark', 'Emily', 'Sean', 'Kathy', 'Andre',
  'Monica', 'Peter', 'Lisa', 'Greg', 'Naomi', 'Seth', 'Megan', 'Rafael', 'Clare', 'Tony',
  'Diane', 'Erik', 'Gina', 'Victor', 'Maureen', 'Ruben', 'Kristin', 'Alan', 'Sara', 'Dean',
];

const ZIPS = ['94102', '94103', '94107', '94109', '94110', '94112', '94114', '94115', '94116', '94117', '94118', '94121', '94122', '94124', '94127', '94131', '94132', '94134'];
const OTHER_LANGUAGES = ['Spanish', 'Tagalog', 'Cantonese', 'Mandarin', 'Vietnamese', 'Russian', 'Korean', 'Amharic', 'Italian'];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const pick = <T>(rng: () => number, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];
function pickN<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

function plusAddress(base: string, tag: string): string {
  const [local, domain] = base.split('@');
  return `${local.split('+')[0]}+${tag}@${domain}`;
}

function hh(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function availText(a: Avail): string {
  const weekdays = a.days.filter((d) => d !== 'SA');
  const contiguous = weekdays.length === 5;
  const dayPart = contiguous ? 'Mon-Fri' : weekdays.map((d) => DAY_NAME[d]).join(', ');
  const parts = weekdays.length ? [`${dayPart} ${hh(a.from)}-${hh(a.to)}`] : [];
  if (a.sat) parts.push(`Sat ${hh(a.sat.from)}-${hh(a.sat.to)}`);
  return parts.join('; ');
}

function fitsAvail(a: Avail, days: Day[], start: number, end: number): boolean {
  return days.every((d) => {
    if (d === 'SA') return Boolean(a.sat) && start >= a.sat!.from && end <= a.sat!.to;
    return a.days.includes(d) && start >= a.from && end <= a.to;
  });
}

function firstDateFor(days: Day[]): string {
  const base = new Date(`${SERIES_START}T12:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    if (days.includes(ALL_DAYS[(d.getUTCDay() + 6) % 7])) return d.toISOString().slice(0, 10);
  }
  return SERIES_START;
}

const DAY_PATTERNS: Day[][] = [
  ['MO', 'WE', 'FR'], ['TU', 'TH'], ['MO', 'WE'], ['TU', 'FR'], ['WE', 'FR'], ['MO', 'TH'],
  ['TU', 'TH', 'SA'], ['MO', 'FR'], ['WE', 'SA'], ['TH', 'FR'],
];
const START_HOURS = [8, 9, 10, 13, 14, 15];

export function buildSeed(demoGmail: string): SeedData {
  const rng = mulberry32(20260914);
  const exampleEmail = (first: string, last: string) => `${slug(first)}.${slug(last)}@example.com`;

  const caregivers: Caregiver[] = CAREGIVER_NAMES.map(([first, last, gender], i) => {
    const skills = pickN(rng, SKILLS, 2 + Math.floor(rng() * 3));
    const avail: Avail = { days: ['MO', 'TU', 'WE', 'TH', 'FR'], from: 8, to: 18, sat: rng() < 0.4 ? { from: 8, to: 14 } : undefined };
    const status = i >= 9 && i < 17 ? 'onboarding' : i >= 17 && i < 23 ? 'inactive' : 'active';
    const certExpires = `2027-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rng() * 28)).padStart(2, '0')}`;
    // Only the demo pool (indices 1-8) may speak Gujarati or Hindi, so exactly Priya, Dev, Rosa qualify for Patel.
    const languages = ['English', pick(rng, OTHER_LANGUAGES)];
    return {
      key: `cg:${slug(first)}.${slug(last)}`,
      first, last, email: exampleEmail(first, last), title: 'Caregiver', avail, notes: [],
      props: {
        role: 'caregiver',
        skills: skills.join(','),
        languages: languages.join(','),
        gender,
        ok_with_pets: rng() < 0.75 ? 'yes' : 'no',
        ok_with_smokers: rng() < 0.3 ? 'yes' : 'no',
        has_car: rng() < 0.6 ? 'yes' : 'no',
        availability: '',
        max_hours_week: pick(rng, [30, 32, 36, 40]),
        zip: pick(rng, ZIPS),
        cert_type: pick(rng, ['HHA', 'HHA', 'CNA', 'none']),
        cert_expires: certExpires,
        status,
      },
    };
  });

  const cg = (i: number) => caregivers[i];
  const setCg = (i: number, props: Props, extra: Partial<Caregiver> = {}) => {
    Object.assign(cg(i).props, props);
    Object.assign(cg(i), extra);
  };
  const withTransfers = (i: number, more: string[]) => [...new Set(['transfers', ...more])].join(',');

  setCg(0, { skills: withTransfers(0, ['meals', 'meds', 'bathing']), languages: 'English,Spanish', ok_with_pets: 'yes', ok_with_smokers: 'no', cert_type: 'HHA', cert_expires: '2027-03-18', status: 'active' }, { email: plusAddress(demoGmail, 'maria') });
  setCg(1, { skills: withTransfers(1, ['meals', 'meds', 'companionship']), languages: 'English,Gujarati,Hindi', ok_with_pets: 'yes', ok_with_smokers: 'no', has_car: 'yes', zip: '94110', cert_type: 'CNA', cert_expires: '2027-06-02', status: 'active' }, { email: plusAddress(demoGmail, 'priya') });
  setCg(2, { skills: withTransfers(2, ['meals', 'meds', 'mobility']), languages: 'English,Hindi', ok_with_pets: 'yes', ok_with_smokers: 'no', has_car: 'yes', zip: '94112', cert_type: 'HHA', cert_expires: '2027-01-22', status: 'active' }, { email: plusAddress(demoGmail, 'dev') });
  setCg(3, { skills: withTransfers(3, ['meals', 'bathing', 'meds']), languages: 'English,Spanish,Hindi', ok_with_pets: 'yes', ok_with_smokers: 'no', has_car: 'no', zip: '94124', cert_type: 'HHA', cert_expires: '2026-12-11', status: 'active' }, { email: plusAddress(demoGmail, 'rosa') });
  // Near misses for Patel: transfers plus Gujarati or Hindi, each with exactly one blocker.
  setCg(4, { skills: withTransfers(4, ['meals', 'meds']), languages: 'English,Gujarati', status: 'active' }); // Tue 14-18 visit
  setCg(5, { skills: withTransfers(5, ['meds', 'driving']), languages: 'English,Hindi', status: 'active' }); // Tue 15-18 visit
  setCg(6, { skills: withTransfers(6, ['meals', 'companionship']), languages: 'English,Hindi', status: 'active' }, { avail: { days: ['MO', 'WE', 'FR'], from: 8, to: 18 } });
  setCg(7, { skills: withTransfers(7, ['meds', 'bathing']), languages: 'English,Gujarati,Hindi', status: 'inactive' });
  setCg(8, { skills: withTransfers(8, ['meals', 'meds']), languages: 'English,Hindi', status: 'active' }, { avail: { days: ['MO', 'TU', 'WE', 'TH', 'FR'], from: 7, to: 12 } });
  for (const c of caregivers) c.props.availability = availText(c.avail);

  const families: Family[] = [];
  const clients: Client[] = CLIENT_NAMES.map(([first, last], i) => {
    const famFirst = FAMILY_FIRSTS[i];
    const key = `cl:${slug(first)}.${slug(last)}`;
    const familyKey = `fam:${slug(famFirst)}.${slug(last)}`;
    const isActive = i < 40;
    const client: Client = {
      key, first, last, email: exampleEmail(first, last), title: 'Client', familyKey, notes: [],
      props: {
        role: 'client',
        needs: pickN(rng, SKILLS, 2 + Math.floor(rng() * 2)).join(','),
        preferences: pick(rng, ['female caregiver preferred', 'morning visits preferred', 'quiet, patient caregiver', 'likes to chat about baseball', 'Spanish speaker preferred', 'no strong preferences']),
        has_pets: rng() < 0.35 ? 'yes' : 'no',
        smoker: rng() < 0.12 ? 'yes' : 'no',
        language: rng() < 0.7 ? 'English' : pick(rng, OTHER_LANGUAGES),
        zip: pick(rng, ZIPS),
        hours_week: 0,
        status: isActive ? 'active' : i < 45 ? 'onboarding' : 'paused',
      },
    };
    families.push({
      key: familyKey, first: famFirst, last, email: exampleEmail(famFirst, last), title: 'Family contact', clientKey: key, notes: [],
      props: { role: 'family' },
    });
    return client;
  });

  const patel = clients[0];
  Object.assign(patel.props, { needs: 'transfers,meals,meds', preferences: 'Gujarati speaker preferred', has_pets: 'no', smoker: 'no', language: 'Gujarati', zip: '94110' });
  families[0].email = plusAddress(demoGmail, 'neha');

  const series = scheduleVisits(rng, caregivers, clients);

  for (const c of clients) {
    const hours = series.filter((s) => s.clientKey === c.key).reduce((n, s) => n + s.hours * s.days.length, 0);
    c.props.hours_week = hours;
  }

  addNotes(rng, caregivers, clients);
  return { caregivers, clients, families, series };
}

function scheduleVisits(rng: () => number, caregivers: Caregiver[], clients: Client[]): Series[] {
  const busy = new Map<string, Set<string>>(caregivers.map((c) => [c.key, new Set<string>()]));
  const hoursOf = new Map<string, number>(caregivers.map((c) => [c.key, 0]));
  const countOf = new Map<string, number>(caregivers.map((c) => [c.key, 0]));
  const out: Series[] = [];
  const slotKeys = (days: Day[], start: number, end: number) => days.flatMap((d) => Array.from({ length: end - start }, (_, k) => `${d}${start + k}`));

  // Priya, Dev and Rosa must stay free Tuesday afternoons so they remain the only valid covers for Patel.
  for (const i of [1, 2, 3]) for (const k of slotKeys(['TU'], 12, 19)) busy.get(caregivers[i].key)!.add(k);

  const canTake = (cgv: Caregiver, clientKey: string, days: Day[], start: number, hours: number) => {
    if (cgv.props.status !== 'active') return false;
    if ((countOf.get(cgv.key) ?? 0) >= 4) return false;
    if ((hoursOf.get(cgv.key) ?? 0) + hours * days.length > 30) return false;
    if (!fitsAvail(cgv.avail, days, start, start + hours)) return false;
    if (out.some((s) => s.clientKey === clientKey && s.caregiverKey === cgv.key)) return false;
    const b = busy.get(cgv.key)!;
    return slotKeys(days, start, start + hours).every((k) => !b.has(k));
  };

  const place = (client: Client, cgv: Caregiver, days: Day[], start: number, hours: number) => {
    for (const k of slotKeys(days, start, start + hours)) busy.get(cgv.key)!.add(k);
    hoursOf.set(cgv.key, (hoursOf.get(cgv.key) ?? 0) + hours * days.length);
    countOf.set(cgv.key, (countOf.get(cgv.key) ?? 0) + 1);
    out.push({
      key: `${client.key}|${cgv.key}`,
      clientKey: client.key,
      caregiverKey: cgv.key,
      days, startHour: start, hours,
      firstDate: firstDateFor(days),
      rrule: `FREQ=WEEKLY;BYDAY=${days.join(',')}`,
      title: `Visit — ${client.last} — ${cgv.first}`,
    });
  };

  // Fixed series the demo depends on.
  place(clients[0], caregivers[0], ['TU', 'TH'], 14, 4); // Patel with Maria
  place(clients[1], caregivers[4], ['TU', 'TH'], 14, 4); // near miss: overlapping Tue visit
  place(clients[2], caregivers[5], ['TU', 'FR'], 15, 3); // near miss: overlapping Tue visit

  const requests: Client[] = [];
  const active = clients.filter((c) => c.props.status === 'active');
  active.forEach((c, i) => {
    const want = i === 0 ? 1 : i < 33 ? 2 : 1;
    const have = out.filter((s) => s.clientKey === c.key).length;
    for (let n = have; n < want; n++) requests.push(c);
  });

  for (const client of requests) {
    const needs = String(client.props.needs).split(',');
    let placed = false;
    for (let attempt = 0; attempt < 40 && !placed; attempt++) {
      const days = pick(rng, DAY_PATTERNS);
      const start = pick(rng, START_HOURS);
      const hours = 2 + Math.floor(rng() * 3);
      if (start + hours > 19) continue;
      const ranked = caregivers
        .map((c) => ({ c, tie: rng(), match: needs.filter((n) => String(c.props.skills).split(',').includes(n)).length }))
        .sort((a, b) => (countOf.get(a.c.key)! - countOf.get(b.c.key)!) || (b.match - a.match) || (a.tie - b.tie));
      // Skill match is preferred for the first half of the attempts, then dropped so every request lands.
      const pool = attempt < 20 ? ranked.filter((r) => r.match > 0) : ranked;
      const hit = pool.find((r) => canTake(r.c, client.key, days, start, hours));
      if (hit) {
        place(client, hit.c, days, start, hours);
        placed = true;
      }
    }
  }
  return out;
}

function addNotes(rng: () => number, caregivers: Caregiver[], clients: Client[]) {
  const [maria, priya] = caregivers;
  const patel = clients[0];
  priya.notes.push(
    'Sam: covered Patel Tue Aug 18 2-6pm after Maria called out sick.',
    'Sam: covered Patel Tue Aug 25 2-6pm after Maria called out sick. Family was happy, Mr. Patel enjoyed speaking Gujarati.',
  );
  patel.notes.push(
    'Sam: Priya covered Tue Aug 18 2-6pm while Maria was out sick.',
    'Sam: Priya covered Tue Aug 25 2-6pm while Maria was out sick. Family asked for Priya again if Maria is ever out.',
    'Cara: family (Neha) prefers a Gujarati speaker; Mr. Patel needs help standing up from his chair.',
  );
  maria.notes.push('Ops: called out sick 2026-08-18.', 'Ops: called out sick 2026-08-25.');

  const cgNotes = [
    'Ops: called out sick 2026-08-21.',
    'Ravi: renewed HHA certificate, copy on file.',
    'Sam: very reliable, has not missed a visit this year.',
    'Ops: asked for fewer weekend shifts.',
    'Ravi: completed dementia care training 2026-07-30.',
    'Sam: running late twice in August; talked it through, no issue since.',
  ];
  const clNotes = [
    'Cara: family prefers morning visits.',
    'Ops: daughter called to confirm next week schedule.',
    'Cara: uses a walker; keep hallway clear.',
    'Sam: caregiver swap went smoothly on Thu Aug 27.',
    'Cara: diabetic, meals should be low sugar.',
    'Ops: family asked for the same caregiver each week when possible.',
  ];
  for (const c of pickN(rng, caregivers.slice(9), 13)) {
    for (const n of pickN(rng, cgNotes, 1 + Math.floor(rng() * 2))) c.notes.push(n);
  }
  for (const c of pickN(rng, clients.slice(3), 14)) {
    for (const n of pickN(rng, clNotes, 1 + Math.floor(rng() * 3))) c.notes.push(n);
  }
}

export function seriesTimes(s: Series): { startLocal: string; endLocal: string } {
  return { startLocal: `${String(s.startHour).padStart(2, '0')}:00`, endLocal: `${String(s.startHour + s.hours).padStart(2, '0')}:00` };
}
