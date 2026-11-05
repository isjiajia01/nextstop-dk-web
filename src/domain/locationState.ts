export type LocationState = 'prompt' | 'asking' | 'granted' | 'denied' | 'unavailable' | 'closed';
export type LocationEvent = 'request' | 'grant' | 'deny' | 'unavailable' | 'dismiss';

export function locationTransition(state: LocationState, event: LocationEvent): LocationState {
  if (event === 'request') return 'asking';
  if (event === 'dismiss') return 'closed';
  if (state !== 'asking') return state;
  return event === 'grant' ? 'granted' : event === 'deny' ? 'denied' : 'unavailable';
}

export function locationCopy(state: LocationState, phone: boolean): { title: string; sub: string; action: string } | null {
  switch (state) {
    case 'prompt': return { title: 'Vis stoppesteder nær dig', sub: phone ? 'Indtil da viser vi Nørreport St.' : 'Indtil da viser vi Nørreport St. Browseren spørger dig, før siden får din placering.', action: 'Tillad placering' };
    case 'asking': return { title: 'Vis stoppesteder nær dig', sub: phone ? 'Vælg «Tillad» i dialogen.' : 'Vælg «Tillad» i browserens dialog ved adresselinjen.', action: 'Venter på svar …' };
    case 'denied': return { title: phone ? 'Placering er slået fra' : 'Placering er blokeret for siden', sub: phone ? 'Tillad placering for browseren i telefonens indstillinger, og prøv igen.' : 'Klik på ikonet til venstre for adressen, vælg Tillad ved Placering, og prøv igen.', action: 'Prøv igen' };
    case 'unavailable': return { title: 'Vi kunne ikke finde din placering', sub: 'Browseren svarede ikke i tide. Prøv igen, eller søg efter et stop.', action: 'Prøv igen' };
    default: return null;
  }
}
