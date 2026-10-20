import {TechProfile, TransferAction} from '../types';

// localStorage : parties manuelles du profil (souhaits, en cours), profils
// importés et plans, conservés par tour pour pouvoir revenir en arrière
const MANUAL_KEY = 'transfert_manual';      // { [tour]: ManualData }
const PROFILES_KEY = 'transfert_profiles';  // { [tour]: TechProfile[] }
const PLAN_KEY = 'transfert_plan';          // { [tour]: TransferAction[] }

// Nombre maximal de tours conservés par carte, pour que le localStorage ne grossisse pas indéfiniment
const MAX_STORED_TOURS = 30;

export type ManualData = {
    inProgress: string[];
    wishes: string[]; // ordre = priorité
};

export const EMPTY_MANUAL: ManualData = {inProgress: [], wishes: []};

function readAll<T>(key: string): Record<string, T> {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function writeAll(key: string, value: unknown) {
    localStorage.setItem(key, JSON.stringify(value));
}

// Conserve seulement les MAX_STORED_TOURS tours les plus récents d'une carte
// (les clés non numériques sont gardées)
function pruneTours<T>(all: Record<string, T>): Record<string, T> {
    Object.keys(all)
        .map(Number)
        .filter(t => Number.isFinite(t))
        .sort((a, b) => b - a)
        .slice(MAX_STORED_TOURS)
        .forEach(t => delete all[String(t)]);
    return all;
}

// Nettoyage des données lues de localStorage : l'ancien format v1 stockait
// inProgress en {code, pct} — on garde le code ; le reste est jeté
function normalizeCodes(list: unknown): string[] {
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    list.forEach(e => {
        const code = typeof e === 'string'
            ? e
            : (e && typeof e === 'object' && typeof (e as any).code === 'string' ? (e as any).code : undefined);
        if (code !== undefined && !out.includes(code)) out.push(code);
    });
    return out;
}

function sanitizeProfile(p: any): TechProfile | undefined {
    if (!p || typeof p.num !== 'number') return undefined;
    return {
        ...p,
        known: normalizeCodes(p.known),
        atteignable: normalizeCodes(p.atteignable),
        inProgress: normalizeCodes(p.inProgress),
        wishes: normalizeCodes(p.wishes),
    };
}

function sanitizeManual(m: any): ManualData | undefined {
    if (!m) return undefined;
    return {inProgress: normalizeCodes(m.inProgress), wishes: normalizeCodes(m.wishes)};
}

// --- Profil manuel (souhaits + recherches en cours) ---

export function getManualProfile(tour: number): ManualData | undefined {
    return sanitizeManual(readAll<any>(MANUAL_KEY)[String(tour)]);
}

// Dernier profil manuel stocké avant `tour`, pour pré-remplir un tour nouveau
export function getLatestManualBefore(tour: number): ManualData | undefined {
    const all = readAll<any>(MANUAL_KEY);
    const latest = Object.keys(all)
        .map(Number)
        .filter(t => t < tour)
        .sort((a, b) => b - a)[0];
    return latest !== undefined ? sanitizeManual(all[String(latest)]) : undefined;
}

export function saveManualProfile(tour: number, data: ManualData) {
    const all = readAll<any>(MANUAL_KEY);
    all[String(tour)] = sanitizeManual(data);
    writeAll(MANUAL_KEY, pruneTours(all));
}

// --- Profils importés ---

export function getProfiles(tour: number): TechProfile[] {
    return (readAll<any[]>(PROFILES_KEY)[String(tour)] ?? [])
        .map(sanitizeProfile)
        .filter((p): p is TechProfile => p !== undefined);
}

export function getAllProfiles(): Record<number, TechProfile[]> {
    const all = readAll<any[]>(PROFILES_KEY);
    const out: Record<number, TechProfile[]> = {};
    Object.keys(all).forEach(k => {
        out[Number(k)] = getProfiles(Number(k));
    });
    return out;
}

// Fusionne des profils reçus : le dernier code reçu gagne par (tour, commandant)
export function saveProfiles(incoming: TechProfile[]): number[] {
    const all = readAll<any[]>(PROFILES_KEY);
    const byTour = new Map<number, TechProfile[]>();
    incoming.forEach(p => {
        const list = byTour.get(p.tour) ?? [];
        list.push(sanitizeProfile(p) ?? p);
        byTour.set(p.tour, list);
    });

    const affected: number[] = [];
    byTour.forEach((list, tour) => {
        const existing = (all[String(tour)] ?? []).map(sanitizeProfile).filter((p): p is TechProfile => p !== undefined);
        const byNum = new Map(existing.map(p => [p.num, p]));
        list.forEach(p => byNum.set(p.num, p));
        all[String(tour)] = Array.from(byNum.values()).sort((a, b) => a.num - b.num);
        affected.push(tour);
    });
    writeAll(PROFILES_KEY, pruneTours(all));
    return affected;
}

export function removeProfile(tour: number, num: number) {
    const all = readAll<any[]>(PROFILES_KEY);
    all[String(tour)] = (all[String(tour)] ?? []).filter((p: any) => p?.num !== num);
    writeAll(PROFILES_KEY, pruneTours(all));
}

// --- Plan du tour ---

export function getPlan(tour: number): TransferAction[] {
    return readAll<TransferAction[]>(PLAN_KEY)[String(tour)] ?? [];
}

export function savePlan(tour: number, actions: TransferAction[]) {
    const all = readAll<TransferAction[]>(PLAN_KEY);
    all[String(tour)] = actions;
    writeAll(PLAN_KEY, pruneTours(all));
}

// Efface toutes les données de transfert (les trois cartes) : à appeler quand un rapport est (re)chargé
export function clearTechTransfer(): void {
    localStorage.removeItem(MANUAL_KEY);
    localStorage.removeItem(PROFILES_KEY);
    localStorage.removeItem(PLAN_KEY);
}
