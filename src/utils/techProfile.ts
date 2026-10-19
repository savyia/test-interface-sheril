import {TechProfile, TransferAction} from '../types';

// Version du format partagé (incrémenter si la structure change)
export const PROFILE_VERSION = 2; // v2 : inProgress n'est plus {code, pct} mais une liste de codes

// Limite du jeu : un donneur ne peut transmettre qu'une techno par tour
export const MAX_GIFTS_PER_GIVER = 1;

// --- Codage base64 (UTF-8), même approche que les blueprints de construction ---

function encodeBase64(obj: unknown): string {
    const utf8Bytes = new TextEncoder().encode(JSON.stringify(obj));
    const binary = utf8Bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
    return btoa(binary);
}

function decodeBase64<T>(text: string): T {
    const binary = atob(text.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

// Les codes techno sont comparés sans distinction de casse
// (catalogue en chiffres romains, rapports, saisie manuelle)
export function normCode(code: string): string {
    return code.trim().toLowerCase();
}

export function encodeProfile(p: TechProfile): string {
    return encodeBase64(p);
}

// Renvoie undefined si la chaîne n'est pas un profil valide
export function decodeProfile(text: string): TechProfile | undefined {
    let raw: any;
    try {
        raw = decodeBase64<any>(text);
    } catch {
        return undefined;
    }
    if (raw?.v !== PROFILE_VERSION) return undefined;
    if (typeof raw.tour !== 'number' || typeof raw.num !== 'number' || typeof raw.nom !== 'string') return undefined;
    if (!Array.isArray(raw.known) || !Array.isArray(raw.atteignable)) return undefined;

    const strings = (list: unknown[]) => list.filter((c): c is string => typeof c === 'string');

    return {
        v: PROFILE_VERSION,
        tour: raw.tour,
        num: raw.num,
        nom: raw.nom,
        known: strings(raw.known),
        atteignable: strings(raw.atteignable),
        inProgress: strings(raw.inProgress),
        wishes: strings(raw.wishes),
    };
}

export type ProfileImportResult = {
    profiles: TechProfile[];
    errors: string[]; // lignes illisibles, tronquées
};

// Bloc de codes : un profil par ligne (lignes vides et citations Discord ignorées)
export function parseProfilesBlock(text: string): ProfileImportResult {
    const profiles: TechProfile[] = [];
    const errors: string[] = [];

    text.split(/\r?\n/).forEach(line => {
        const cleaned = line.replace(/^>\s?/, '').trim();
        if (!cleaned) return;
        const p = decodeProfile(cleaned);
        if (p) {
            profiles.push(p);
            return;
        }
        errors.push(cleaned.length > 60 ? cleaned.slice(0, 60) + '…' : cleaned);
    });

    return {profiles, errors};
}

// --- Validation du plan ---

export type ActionProblem = { kind: 'error' | 'warning'; message: string };
export type ValidatedAction = { action: TransferAction; problems: ActionProblem[] };

// Règles : le donneur doit connaître la techno, le receveur doit pouvoir la
// rechercher (sinon le jeu refuse la réception), et 1 techno donnée et 1 reçue
// par joueur et par tour (convention d'alliance)
export function validateActions(actions: TransferAction[], profiles: TechProfile[]): ValidatedAction[] {
    const byNum = new Map(profiles.map(p => [p.num, p]));
    const knownSets = new Map(profiles.map(p => [p.num, new Set(p.known.map(normCode))]));
    const reachSets = new Map(profiles.map(p => [p.num, new Set(p.atteignable.map(normCode))]));
    const giftCount = new Map<number, number>();
    const receiveCount = new Map<number, number>();
    actions.forEach(a => {
        giftCount.set(a.from, (giftCount.get(a.from) ?? 0) + 1);
        receiveCount.set(a.to, (receiveCount.get(a.to) ?? 0) + 1);
    });

    return actions.map(action => {
        const problems: ActionProblem[] = [];
        const giver = byNum.get(action.from);
        const receiver = byNum.get(action.to);

        if (!action.code) problems.push({kind: 'error', message: 'Techno à préciser'});
        if (!giver) problems.push({kind: 'error', message: 'Donneur inconnu'});
        if (!receiver) problems.push({kind: 'error', message: 'Receveur inconnu'});

        if (giver && receiver && action.code) {
            const code = normCode(action.code);
            if (giver.num === receiver.num) {
                problems.push({kind: 'error', message: 'Un joueur ne peut pas se donner sa propre techno'});
            }
            if (!knownSets.get(giver.num)?.has(code)) {
                problems.push({kind: 'error', message: `${giver.nom} ne connaît pas cette techno`});
            }
            if (knownSets.get(receiver.num)?.has(code)) {
                problems.push({kind: 'warning', message: `${receiver.nom} la connaît déjà`});
            } else if (!reachSets.get(receiver.num)?.has(code)) {
                problems.push({kind: 'error', message: `${receiver.nom} ne peut pas la rechercher (prérequis manquants)`});
            }
        }

        if ((giftCount.get(action.from) ?? 0) > MAX_GIFTS_PER_GIVER) {
            problems.push({kind: 'error', message: `${giver?.nom ?? 'Le donneur'} donne plus de ${MAX_GIFTS_PER_GIVER} techno ce tour`});
        }

        if ((receiveCount.get(action.to) ?? 0) > 1) {
            problems.push({kind: 'error', message: `${receiver?.nom ?? 'Le receveur'} reçoit plus de 1 techno ce tour`});
        }

        return {action, problems};
    });
}

// --- Transfert manuel (glisser-déposer sur la matrice) ---

export type TransferCheck = {ok: true} | {ok: false; message: string};

// Vérifie qu'un transfert manuel est jouable avant de l'ajouter au plan
export function checkTransfer(plan: TransferAction[], from: number, to: number, code: string, profiles: TechProfile[]): TransferCheck {
    if (!code) return {ok: false, message: 'Techno à préciser'};
    const giver = profiles.find(p => p.num === from);
    const receiver = profiles.find(p => p.num === to);
    if (!giver || !receiver) return {ok: false, message: 'Joueur inconnu'};
    if (from === to) return {ok: false, message: 'Un joueur ne peut pas se donner sa propre techno'};
    const c = normCode(code);
    if (!giver.known.some(k => normCode(k) === c)) return {ok: false, message: `${giver.nom} ne connaît pas cette techno`};
    if (!receiver.atteignable.some(r => normCode(r) === c)) return {ok: false, message: `${receiver.nom} ne peut pas la rechercher`};
    if (plan.some(a => a.from === from)) return {ok: false, message: `${giver.nom} a déjà donné ce tour`};
    if (plan.some(a => a.to === to)) return {ok: false, message: `${receiver.nom} a déjà reçu ce tour`};
    return {ok: true};
}