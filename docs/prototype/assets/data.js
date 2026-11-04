/* Illustrative demo data. Lines, destinations and stop IDs are plausible, not authoritative.
   Shape mirrors the real feed: stop name + id, per-line departures with planned and realtime times,
   direction, product type, disruption messages and coordinates. */
window.DATA = (() => {
  const NOW = { h: 8, m: 14 };
  // Line category follows Movia's line-number suffixes: A, S, R, C, E, N; no suffix is regular.
  const cat = (line) => {
    if (/N$/.test(line)) return 'n';
    if (/A$/.test(line)) return 'a';
    if (/[SR]$/.test(line)) return 's';
    if (/C$/.test(line)) return 'c';
    if (/E$/.test(line)) return 'e';
    return 'regular';
  };

  // d(line, dest, via, minutes, next[], extra)
  const d = (line, dest, via, m, next = [], x = {}) => ({
    id: `${line}-${dest}-${m}`, line, cat: cat(line), product: 'bus', dest, via, m,
    planned: x.planned ?? m, status: x.status ?? 'rt', next, disrupted: !!x.disrupted,
  });

  const stops = [
    {
      key: 'nv', name: 'Nørreport St.', road: 'Nørre Voldgade', id: '10845', dist: 60,
      xy: [392, 520],
      deps: {
        normal: [
          d('5C', 'Lufthavnen', 'via Rådhuspladsen', 2, [9, 16]),
          d('14', 'Vigerslev Allé', 'via Rådhuspladsen', 3, [13]),
          d('150S', 'Kokkedal St.', 'via Nørre Voldgade', 4, [14]),
          d('6A', 'Buddinge St.', 'via Nørrebro', 6, [12, 18]),
          d('37', 'Valby St.', 'via Vesterbro', 9, [24]),
          d('184', 'Holte St.', 'via Lyngbyvej', 12, [32]),
          d('185', 'Nærum St.', 'via Lyngbyvej', 17, []),
          d('350S', 'Ballerup St.', 'via Husum', 23, [43]),
        ],
        now: [
          d('5C', 'Lufthavnen', 'via Rådhuspladsen', 0, [7, 14]),
          d('14', 'Vigerslev Allé', 'via Rådhuspladsen', 1, [11]),
          d('150S', 'Kokkedal St.', 'via Nørre Voldgade', 5, [15]),
          d('6A', 'Buddinge St.', 'via Nørrebro', 7, [13, 19]),
          d('37', 'Valby St.', 'via Vesterbro', 10, [25]),
          d('184', 'Holte St.', 'via Lyngbyvej', 13, [33]),
          d('185', 'Nærum St.', 'via Lyngbyvej', 18, []),
        ],
        issues: [
          d('5C', 'Lufthavnen', 'via Rådhuspladsen', 2, [9, 16]),
          d('150S', 'Kokkedal St.', 'via Nørre Voldgade', 4, [14], { status: 'cancelled' }),
          d('6A', 'Buddinge St.', 'via Nørrebro', 7, [12, 18], { status: 'delayed', planned: 3 }),
          d('14', 'Vigerslev Allé', 'via Rådhuspladsen', 11, [21]),
          d('37', 'Valby St.', 'via Vesterbro', 13, [28], { status: 'planned' }),
          d('184', 'Holte St.', 'via Lyngbyvej', 16, [36]),
          d('185', 'Nærum St.', 'via Lyngbyvej', 19, []),
        ],
      },
    },
    {
      key: 'fb', name: 'Nørreport St.', road: 'Frederiksborggade', id: '10846', dist: 110,
      xy: [282, 468],
      deps: {
        normal: [
          d('5C', 'Husum Torv', 'via Nørrebro', 5, [12, 19]),
          d('350S', 'Dragør', 'via Rådhuspladsen', 7, [27]),
          d('43', 'Nørrebro St.', 'via Jagtvej', 11, [31]),
          d('42', 'Hellerup St.', 'via Tagensvej', 14, [34]),
        ],
      },
    },
    {
      key: 'op', name: 'Ørstedsparken', road: 'Nørre Voldgade', id: '10471', dist: 180,
      xy: [348, 640],
      deps: {
        normal: [
          d('14', 'Emdrup Torv', 'via Nørreport', 1, [11]),
          d('37', 'Holmens Kirke', 'via Nørreport', 8, [23]),
          d('184', 'Nørreport St.', '', 15, [35]),
          d('185', 'Nørreport St.', '', 19, []),
        ],
      },
    },
    {
      key: 'st', name: 'Søtorvet', road: 'Frederiksborggade', id: '10392', dist: 340,
      xy: [262, 338],
      deps: {
        normal: [
          d('5C', 'Lufthavnen', 'via Nørreport', 1, [8, 15]),
          d('350S', 'Dragør', 'via Nørreport', 6, [26]),
          d('5C', 'Husum Torv', 'via Nørrebro', 10, [17]),
        ],
      },
    },
  ];

  const remote = {
    key: 'rp', name: 'Rådhuspladsen', road: 'H.C. Andersens Boulevard', id: '10102', dist: 1100,
    xy: [392, 520],
    deps: {
      normal: [
        d('2A', 'Tingbjerg', 'via Vesterbro', 1, [6, 11]),
        d('5C', 'Husum Torv', 'via Nørreport', 3, [10]),
        d('250S', 'Buddinge St.', 'via Nørreport', 6, [26]),
        d('12', 'Hvidovre Hospital', 'via Valby', 8, [23]),
        d('33', 'Refshaleøen', 'via Christianshavn', 14, [29]),
        d('30E', 'Ny Ellebjerg St.', 'via Sydhavn', 18, []),
      ],
    },
  };

  const disruption = {
    lines: ['5C'],
    title: 'Omkørsel på linje 5C',
    titleEn: 'Diversion on line 5C',
    short: 'Kører ikke via Søtorvet 10.00–15.00.',
    body: 'På grund af vejarbejde på Dronning Louises Bro kører linje 5C i retning mod Husum Torv via Nørre Søgade fra kl. 10.00 til 15.00. Stoppestedet Søtorvet betjenes ikke. Brug i stedet Nørreport St. (Frederiksborggade).',
    source: 'Movia · udsendt 07.52',
  };

  // Journey: 5C toward Lufthavnen, as seen from Nørreport St. (Nørre Voldgade)
  const journey = {
    line: '5C', cat: 'c', dest: 'Lufthavnen',
    stops: [
      { n: 'Husum Torv', t: -24, passed: true },
      { n: 'Husumvej', t: -22, passed: true },
      { n: 'Bellahøj', t: -18, passed: true },
      { n: 'Nørrebro St.', t: -12, passed: true },
      { n: 'Nørrebros Runddel', t: -8, passed: true },
      { n: 'Elmegade', t: -5, passed: true },
      { n: 'Ravnsborggade', t: -3, passed: true },
      { n: 'Søtorvet', t: 0, bus: 'at' },
      { n: 'Nørreport St.', t: 2, mine: true },
      { n: 'Rådhuspladsen', t: 6 },
      { n: 'Christmas Møllers Plads', t: 11 },
      { n: 'Amagerbro St.', t: 14 },
      { n: 'Lergravsparken St.', t: 17 },
      { n: 'Sundbyvester Plads', t: 21 },
      { n: 'Kastrup St.', t: 29 },
      { n: 'Lufthavnen', t: 36, last: true },
    ],
  };

  // Search index. Folding also matches æ→ae, ø→oe/o, å→aa/a.
  const index = [
    { key: 'nv', name: 'Nørreport St.', road: 'Nørre Voldgade', dist: 60, lines: ['5C', '6A', '14', '150S', '184'] },
    { key: 'fb', name: 'Nørreport St.', road: 'Frederiksborggade', dist: 110, lines: ['5C', '350S', '42', '43'] },
    { key: 'op', name: 'Ørstedsparken', road: 'Nørre Voldgade', dist: 180, lines: ['14', '37', '184', '185'] },
    { key: 'st', name: 'Søtorvet', road: 'Frederiksborggade', dist: 340, lines: ['5C', '350S'] },
    { key: 'rp', name: 'Rådhuspladsen', road: 'H.C. Andersens Boulevard', dist: 1100, lines: ['2A', '5C', '12', '33', '250S'] },
    { key: 'rp', name: 'Nørrebros Runddel', road: 'Nørrebrogade', dist: 1500, lines: ['5C', '12', '66', '350S'] },
    { key: 'rp', name: 'Nørre Campus', road: 'Blegdamsvej', dist: 1300, lines: ['6A', '42', '150S', '184'] },
    { key: 'rp', name: 'Nørrebro St.', road: 'Nørrebrogade', dist: 2600, lines: ['5C', '350S', '4A'] },
    { key: 'rp', name: 'Kongens Nytorv', road: 'Bredgade', dist: 1000, lines: ['1A', '26', '66', '350S'] },
    { key: 'rp', name: 'Hovedbanegården', road: 'Tietgensgade', dist: 1600, lines: ['1A', '10', '23', '250S'] },
    { key: 'rp', name: 'Valby St.', road: 'Valby Langgade', dist: 5200, lines: ['1A', '4A', '18', '37'] },
    { key: 'rp', name: 'Frederiksberg Rådhus', road: 'Smallegade', dist: 2700, lines: ['8A', '9A', '72', '81N'] },
  ];
  const recent = ['Rådhuspladsen', 'Kongens Nytorv'];

  const fmt = (min) => {
    let t = NOW.h * 60 + NOW.m + min;
    const h = Math.floor(((t % 1440) + 1440) % 1440 / 60), m = ((t % 60) + 60) % 60;
    return `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`; // da-DK uses "." in times
  };
  const fold = (s) => s.toLowerCase().normalize('NFKD')
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').replace(/[\u0300-\u036f]/g, '');
  const foldLoose = (s) => fold(s).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/aa/g, 'a');
  const dist = (m) => m < 1000 ? `${m}\u00a0m` : `${(m / 1000).toFixed(1).replace('.', ',')}\u00a0km`;

  return { NOW, stops, remote, disruption, journey, index, recent, fmt, fold, foldLoose, dist, cat };
})();
