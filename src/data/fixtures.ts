/**
 * SYNTHETIC DEMO DATA. Stops, lines, destinations and coordinates are plausible, not authoritative, and are not
 * Rejseplanen data. Nothing here claims to be live. Times are generated relative to the injected clock.
 */
import type { LatLng, ServiceAlert } from './types';

export const USER_LOCATION: LatLng = { lat: 55.6836, lng: 12.5712 };
/** Jægersborg Dyrehave: no stop within 1000 m. */
export const FAR_LOCATION: LatLng = { lat: 55.7826, lng: 12.5738 };
export const FALLBACK_CENTER: LatLng = { lat: 55.6761, lng: 12.5683 }; // Rådhuspladsen

export interface LineSpec { line: string; dest: string; via: string; first: number; headway: number; rtOffsetS?: number }
export interface StopSpec { id: string; name: string; road: string; lat: number; lng: number; lines: LineSpec[] }

const L = (line: string, dest: string, via: string, first: number, headway: number, rtOffsetS = 0): LineSpec =>
  ({ line, dest, via, first, headway, rtOffsetS });

export const STOPS: StopSpec[] = [
  { id: 'nv', name: 'Nørreport St.', road: 'Nørre Voldgade', lat: 55.6832, lng: 12.5718, lines: [
    L('5C', 'Husum Torv', 'via Nørrebro', 2, 7, 60), L('14', 'Vigerslev Allé', 'via Rådhuspladsen', 3, 10),
    L('150S', 'Kokkedal St.', 'via Nørre Voldgade', 4, 10), L('6A', 'Buddinge St.', 'via Nørrebro', 6, 6),
    L('37', 'Valby St.', 'via Vesterbro', 9, 15), L('184', 'Holte St.', 'via Lyngby', 12, 20),
    L('185', 'Nærum St.', 'via Lyngby', 17, 20), L('350S', 'Ballerup St.', 'via Husum', 23, 20),
  ] },
  { id: 'fb', name: 'Nørreport St.', road: 'Frederiksborggade', lat: 55.6841, lng: 12.5706, lines: [
    L('5C', 'Sundbyvester Plads', 'via Amagerbro', 5, 7), L('350S', 'Dragør', 'via Amagerbro', 7, 20),
    L('43', 'Svanemøllen St.', 'via Jagtvej', 11, 20), L('42', 'Hellerup St.', 'via Tagensvej', 14, 20),
  ] },
  { id: 'op', name: 'Ørstedsparken', road: 'Nørre Voldgade', lat: 55.6866, lng: 12.5646, lines: [
    L('14', 'Emdrup Torv', 'via Nørreport', 1, 10), L('37', 'Holmens Kirke', 'via Nørreport', 8, 15),
    L('184', 'Nørreport St.', '', 15, 20), L('185', 'Nørreport St.', '', 19, 20),
  ] },
  { id: 'st', name: 'Søtorvet', road: 'Frederiksborggade', lat: 55.6876, lng: 12.5693, lines: [
    L('5C', 'Sundbyvester Plads', 'via Amagerbro', 1, 7), L('350S', 'Dragør', 'via Nørreport', 6, 20),
    L('5C', 'Husum Torv', 'via Nørrebro', 10, 7),
  ] },
  { id: 'rp', name: 'Rådhuspladsen', road: 'Vester Voldgade', lat: 55.6761, lng: 12.5683, lines: [
    L('2A', 'Tingbjerg', 'via Vesterbro', 1, 5), L('5C', 'Husum Torv', 'via Nørreport', 3, 7),
    L('250S', 'Buddinge St.', 'via Nørreport', 6, 10), L('12', 'Hvidovre Hospital', 'via Valby', 8, 15),
    L('33', 'Refshaleøen', 'via Christianshavn', 14, 20), L('30E', 'Ny Ellebjerg St.', 'via Sydhavn', 18, 20),
  ] },
  { id: 'kn', name: 'Kongens Nytorv', road: 'Bredgade', lat: 55.6806, lng: 12.5857, lines: [
    L('1A', 'Bella Center', 'via Amagerbro', 4, 10), L('26', 'Klampenborg St.', 'via Østerbro', 9, 12),
    L('66', 'Valby St.', 'via Rådhuspladsen', 12, 15), L('350S', 'Ballerup St.', 'via Nørreport', 16, 20),
  ] },
  { id: 'nr', name: 'Nørrebros Runddel', road: 'Nørrebrogade', lat: 55.6911, lng: 12.5467, lines: [
    L('5C', 'Sundbyvester Plads', 'via Amagerbro', 2, 7), L('12', 'Brønshøj Torv', 'via Bispebjerg', 7, 15),
    L('66', 'Hellerup St.', 'via Nørrebro', 11, 15), L('350S', 'Dragør', 'via Nørreport', 14, 20),
  ] },
  { id: 'nc', name: 'Nørre Campus', road: 'Blegdamsvej', lat: 55.6963, lng: 12.5617, lines: [
    L('6A', 'Buddinge St.', 'via Nørrebro', 3, 6), L('42', 'Hellerup St.', 'via Østerbro', 8, 20),
    L('150S', 'Kokkedal St.', 'via Lyngby', 13, 10), L('184', 'Holte St.', 'via Lyngby', 17, 20),
  ] },
  { id: 'hb', name: 'Hovedbanegården', road: 'Tietgensgade', lat: 55.6727, lng: 12.5648, lines: [
    L('1A', 'Bella Center', 'via Amagerbro', 2, 10), L('10', 'Østerport St.', 'via Nørreport', 6, 12),
    L('23', 'Frederiksberg St.', 'via Vesterbro', 9, 15), L('250S', 'Buddinge St.', 'via Nørreport', 14, 10),
  ] },
  { id: 'va', name: 'Valby St.', road: 'Valby Langgade', lat: 55.6617, lng: 12.5114, lines: [
    L('1A', 'Bella Center', 'via Rådhuspladsen', 5, 10), L('4A', 'Husum Torv', 'via Rådhuspladsen', 8, 12),
    L('18', 'Vanløse St.', 'via Frederiksberg', 11, 20), L('37', 'Nørreport St.', 'via Vesterbro', 15, 15),
  ] },
  { id: 'fr', name: 'Frederiksberg Rådhus', road: 'Smallegade', lat: 55.6786, lng: 12.5333, lines: [
    L('8A', 'Sundby', 'via Rådhuspladsen', 3, 12), L('9A', 'Svanemøllen St.', 'via Nørreport', 7, 12),
    L('72', 'Brønshøj', 'via Godthåb', 12, 20), L('81N', 'Sengeløse', 'via Rådhuspladsen', 27, 30),
  ] },
  { id: 'kv', name: 'Klampenborgvej', road: 'Dyrehavevej', lat: 55.7618, lng: 12.5745, lines: [
    L('388', 'Klampenborg St.', '', 11, 30), L('187', 'Nørreport St.', 'via Lyngby', 19, 30),
  ] },
];

export const RECENT_IDS = ['rp', 'kn'];

export const ALERTS: ServiceAlert[] = [{
  id: 'demo-5c',
  lines: ['5C'],
  title: 'Omkørsel på linje 5C',
  short: 'Kører ikke via Søtorvet 10.00–15.00.',
  body: 'På grund af vejarbejde kører linje 5C mod Husum Torv via Nørre Søgade i en periode. Stoppestedet Søtorvet betjenes ikke. Brug i stedet Nørreport St. (Frederiksborggade). (Demotekst, ikke en rigtig driftsmelding.)',
  source: 'Demodata',
}];

export interface RouteStop { name: string; lat: number; lng: number; off: number }
/** Real 5C stop sequence and coordinates (Rejseplanen GTFS, CC BY 4.0). Offsets are synthetic minutes relative to Nørreport St. */
export const ROUTE_5C_TO_SUNDBY: RouteStop[] = [
  { name: 'Husum Torv', lat: 55.71193, lng: 12.47165, off: -26 },
  { name: 'Husumvej', lat: 55.71028, lng: 12.47817, off: -24 },
  { name: 'Kobbelvænget', lat: 55.70903, lng: 12.48184, off: -23 },
  { name: 'Veksøvej', lat: 55.70675, lng: 12.48791, off: -22 },
  { name: 'Astrupvej', lat: 55.70513, lng: 12.49402, off: -20 },
  { name: 'Brønshøj Torv', lat: 55.70449, lng: 12.49893, off: -19 },
  { name: 'Hyrdevangen', lat: 55.70588, lng: 12.50990, off: -18 },
  { name: 'Bellahøj', lat: 55.70664, lng: 12.51715, off: -16 },
  { name: 'Hulgårds Plads', lat: 55.70575, lng: 12.52258, off: -15 },
  { name: 'Glasvej', lat: 55.70312, lng: 12.53007, off: -14 },
  { name: 'Nørrebro St.', lat: 55.70056, lng: 12.53896, off: -12 },
  { name: 'Nørrebrohallen', lat: 55.69839, lng: 12.54273, off: -11 },
  { name: 'Stefansgade', lat: 55.69638, lng: 12.54573, off: -9 },
  { name: 'Nørrebros Runddel St.', lat: 55.69385, lng: 12.54953, off: -8 },
  { name: 'Sjællandsgade', lat: 55.69236, lng: 12.55180, off: -7 },
  { name: 'Kapelvej', lat: 55.69024, lng: 12.55503, off: -5 },
  { name: 'Elmegade', lat: 55.68852, lng: 12.55891, off: -4 },
  { name: 'Søtorvet', lat: 55.68581, lng: 12.56605, off: -3 },
  { name: 'Nørre Farimagsgade', lat: 55.68458, lng: 12.56928, off: -1 },
  { name: 'Nørreport St.', lat: 55.68370, lng: 12.57144, off: 0 },
  { name: 'Teglgårdstræde', lat: 55.67987, lng: 12.56693, off: 1 },
  { name: 'Rådhuspladsen St.', lat: 55.67549, lng: 12.56686, off: 3 },
  { name: 'Hovedbanegården, Tivoli', lat: 55.67233, lng: 12.56705, off: 4 },
  { name: 'Polititorvet', lat: 55.66984, lng: 12.57090, off: 5 },
  { name: 'Klaksvigsgade', lat: 55.66834, lng: 12.58315, off: 7 },
  { name: 'Ørestads Boulevard', lat: 55.66757, lng: 12.58865, off: 8 },
  { name: 'Amagerfælledvej', lat: 55.66623, lng: 12.59597, off: 9 },
  { name: 'Sønderport', lat: 55.66542, lng: 12.59924, off: 11 },
  { name: 'Amagerbro St.', lat: 55.66268, lng: 12.60223, off: 12 },
  { name: 'Tingvej', lat: 55.66074, lng: 12.60460, off: 14 },
  { name: 'Øresundsvej', lat: 55.65865, lng: 12.60714, off: 15 },
  { name: 'Tycho Brahes Allé', lat: 55.65494, lng: 12.61025, off: 16 },
  { name: 'Smyrnavej', lat: 55.65071, lng: 12.61234, off: 18 },
  { name: 'Sundbyvester Plads', lat: 55.64630, lng: 12.61373, off: 19 },
];
export const ROUTE_5C_TO_HUSUM: RouteStop[] = [
  { name: 'Sundbyvester Plads', lat: 55.64663, lng: 12.61419, off: -19 },
  { name: 'Smyrnavej', lat: 55.65143, lng: 12.61201, off: -18 },
  { name: 'Tycho Brahes Allé', lat: 55.65498, lng: 12.61022, off: -16 },
  { name: 'Øresundsvej', lat: 55.65793, lng: 12.60805, off: -15 },
  { name: 'Tingvej', lat: 55.66061, lng: 12.60476, off: -14 },
  { name: 'Amagerbro St.', lat: 55.66351, lng: 12.60127, off: -12 },
  { name: 'Sønderport', lat: 55.66583, lng: 12.59802, off: -11 },
  { name: 'Amagerfælledvej', lat: 55.66650, lng: 12.59535, off: -9 },
  { name: 'Ørestads Boulevard', lat: 55.66788, lng: 12.58682, off: -8 },
  { name: 'Klaksvigsgade', lat: 55.66909, lng: 12.58138, off: -7 },
  { name: 'Polititorvet', lat: 55.66971, lng: 12.57060, off: -5 },
  { name: 'Hovedbanegården, Tivoli', lat: 55.67284, lng: 12.56619, off: -4 },
  { name: 'Rådhuspladsen St.', lat: 55.67633, lng: 12.56737, off: -3 },
  { name: 'Teglgårdstræde', lat: 55.68046, lng: 12.56821, off: -1 },
  { name: 'Nørreport St.', lat: 55.68344, lng: 12.57158, off: 0 },
  { name: 'Nørre Farimagsgade', lat: 55.68529, lng: 12.56747, off: 1 },
  { name: 'Ravnsborggade', lat: 55.68751, lng: 12.56164, off: 3 },
  { name: 'Elmegade', lat: 55.68904, lng: 12.55759, off: 4 },
  { name: 'Kapelvej', lat: 55.69076, lng: 12.55421, off: 5 },
  { name: 'Sjællandsgade', lat: 55.69233, lng: 12.55184, off: 7 },
  { name: 'Nørrebros Runddel St.', lat: 55.69401, lng: 12.54930, off: 8 },
  { name: 'Stefansgade', lat: 55.69670, lng: 12.54528, off: 9 },
  { name: 'Nørrebrohallen', lat: 55.69852, lng: 12.54255, off: 11 },
  { name: 'Nørrebro St.', lat: 55.70111, lng: 12.53753, off: 12 },
  { name: 'Glasvej', lat: 55.70374, lng: 12.52848, off: 14 },
  { name: 'Hulgårds Plads', lat: 55.70620, lng: 12.52044, off: 15 },
  { name: 'Bellahøj', lat: 55.70669, lng: 12.51639, off: 16 },
  { name: 'Hyrdevangen', lat: 55.70579, lng: 12.50922, off: 18 },
  { name: 'Brønshøj Torv', lat: 55.70459, lng: 12.49832, off: 19 },
  { name: 'Astrupvej', lat: 55.70561, lng: 12.49147, off: 20 },
  { name: 'Veksøvej', lat: 55.70738, lng: 12.48626, off: 22 },
  { name: 'Kobbelvænget', lat: 55.70944, lng: 12.48061, off: 23 },
  { name: 'Husumvej', lat: 55.71088, lng: 12.47616, off: 24 },
  { name: 'Husum Torv', lat: 55.71193, lng: 12.47165, off: 26 },
];
