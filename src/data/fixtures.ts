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
    L('5C', 'Lufthavnen', 'via Kongens Nytorv', 2, 7, 60), L('14', 'Vigerslev Allé', 'via Rådhuspladsen', 3, 10),
    L('150S', 'Kokkedal St.', 'via Nørre Voldgade', 4, 10), L('6A', 'Buddinge St.', 'via Nørrebro', 6, 6),
    L('37', 'Valby St.', 'via Vesterbro', 9, 15), L('184', 'Holte St.', 'via Lyngby', 12, 20),
    L('185', 'Nærum St.', 'via Lyngby', 17, 20), L('350S', 'Ballerup St.', 'via Husum', 23, 20),
  ] },
  { id: 'fb', name: 'Nørreport St.', road: 'Frederiksborggade', lat: 55.6841, lng: 12.5706, lines: [
    L('5C', 'Husum Torv', 'via Nørrebro', 5, 7), L('350S', 'Dragør', 'via Amagerbro', 7, 20),
    L('43', 'Svanemøllen St.', 'via Jagtvej', 11, 20), L('42', 'Hellerup St.', 'via Tagensvej', 14, 20),
  ] },
  { id: 'op', name: 'Ørstedsparken', road: 'Nørre Voldgade', lat: 55.6866, lng: 12.5646, lines: [
    L('14', 'Emdrup Torv', 'via Nørreport', 1, 10), L('37', 'Holmens Kirke', 'via Nørreport', 8, 15),
    L('184', 'Nørreport St.', '', 15, 20), L('185', 'Nørreport St.', '', 19, 20),
  ] },
  { id: 'st', name: 'Søtorvet', road: 'Frederiksborggade', lat: 55.6876, lng: 12.5693, lines: [
    L('5C', 'Lufthavnen', 'via Nørreport', 1, 7), L('350S', 'Dragør', 'via Nørreport', 6, 20),
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
    L('5C', 'Lufthavnen', 'via Nørreport', 2, 7), L('12', 'Brønshøj Torv', 'via Bispebjerg', 7, 15),
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
/** Offsets are minutes relative to the rider's stop (Nørreport St.). Coordinates are illustrative. */
export const ROUTE_5C: RouteStop[] = [
  { name: 'Husum Torv', lat: 55.7121, lng: 12.4723, off: -24 },
  { name: 'Husumvej', lat: 55.7066, lng: 12.4820, off: -22 },
  { name: 'Bellahøj', lat: 55.7040, lng: 12.5000, off: -18 },
  { name: 'Nørrebros Runddel', lat: 55.6911, lng: 12.5467, off: -8 },
  { name: 'Elmegade', lat: 55.6892, lng: 12.5560, off: -5 },
  { name: 'Ravnsborggade', lat: 55.6879, lng: 12.5598, off: -3 },
  { name: 'Søtorvet', lat: 55.6876, lng: 12.5693, off: -1 },
  { name: 'Nørreport St.', lat: 55.6832, lng: 12.5718, off: 0 },
  { name: 'Kongens Nytorv', lat: 55.6806, lng: 12.5857, off: 4 },
  { name: 'Christmas Møllers Plads', lat: 55.6668, lng: 12.5970, off: 11 },
  { name: 'Amagerbro St.', lat: 55.6630, lng: 12.6035, off: 14 },
  { name: 'Lergravsparken St.', lat: 55.6603, lng: 12.6252, off: 17 },
  { name: 'Sundbyvester Plads', lat: 55.6510, lng: 12.6130, off: 21 },
  { name: 'Kastrup St.', lat: 55.6355, lng: 12.6478, off: 29 },
  { name: 'Lufthavnen', lat: 55.6300, lng: 12.6540, off: 36 },
];
