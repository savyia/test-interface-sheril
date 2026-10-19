import {
    checkTransfer, decodeProfile, encodeProfile,
    parseProfilesBlock, PROFILE_VERSION, validateActions,
} from './techProfile';
import {TechProfile} from '../types';

const profile = (
    num: number,
    nom: string,
    known: string[],
    atteignable: string[],
    wishes: string[] = [],
    inProgress: string[] = [],
): TechProfile => ({v: PROFILE_VERSION, tour: 10, num, nom, known, atteignable, inProgress, wishes});

describe('encode/decode profil', () => {
    test('allers-retours avec un nom accentué et des % en cours', () => {
        const p = profile(3, 'Élodie', ['plasmaI', 'moteurV'], ['plasmaII'], ['bouclierIII'], ['radarII']);
        expect(decodeProfile(encodeProfile(p))).toEqual(p);
    });

    test('rejette les chaînes invalides ou d\'une autre version', () => {
        expect(decodeProfile('nonsense')).toBeUndefined();
        expect(decodeProfile('')).toBeUndefined();
        // Un ancien profil v1 (inProgress en {code, pct}) doit être rejeté
        const v1 = {v: 1, tour: 10, num: 1, nom: 'a', known: [], atteignable: [], inProgress: [{code: 'radarII', pct: 40}], wishes: []};
        expect(decodeProfile(encodeProfile(v1 as unknown as TechProfile))).toBeUndefined();
    });
});

describe('parseProfilesBlock', () => {
    test('un profil par ligne, lignes vides et citations Discord ignorées', () => {
        const a = encodeProfile(profile(1, 'a', ['x'], []));
        const b = encodeProfile(profile(2, 'b', ['y'], []));
        const {profiles, errors} = parseProfilesBlock(`\n${a}\n> ${b}\n\n`);
        expect(profiles).toHaveLength(2);
        expect(errors).toHaveLength(0);
    });

    test('signale les lignes illisibles', () => {
        const {profiles, errors} = parseProfilesBlock('notacode\n' + encodeProfile(profile(1, 'a', [], [])));
        expect(profiles).toHaveLength(1);
        expect(errors).toHaveLength(1);
    });
});

describe('validateActions', () => {
    const alice = profile(1, 'Alice', [], ['plasmaI', 'radarI']);
    const bob = profile(2, 'Bob', ['plasmaI', 'radarI'], []);

    const errorsOf = (actions: {from: number; code: string; to: number}[]) =>
        validateActions(actions, [alice, bob]).map(v => v.problems.filter(p => p.kind === 'error'));

    test('accepte un transfert valide', () => {
        expect(errorsOf([{from: 2, code: 'plasmaI', to: 1}])).toEqual([[]]);
    });

    test('le donneur doit connaître la techno', () => {
        const [v] = validateActions([{from: 1, code: 'plasmaI', to: 2}], [alice, bob]);
        expect(v.problems.some(p => p.message.includes('ne connaît pas'))).toBe(true);
    });

    test('le receveur doit pouvoir la rechercher', () => {
        const dave = profile(4, 'Dave', [], ['radarI']); // plasmaI non recherchable pour dave
        const [v] = validateActions([{from: 2, code: 'plasmaI', to: 4}], [bob, dave]);
        expect(v.problems.some(p => p.message.includes('ne peut pas la rechercher'))).toBe(true);
    });

    test('avertit si le receveur la connaît déjà', () => {
        const erin = profile(5, 'Erin', ['radarI'], ['plasmaI']);
        const [v] = validateActions([{from: 2, code: 'radarI', to: 5}], [bob, erin]);
        expect(v.problems.filter(p => p.kind === 'error')).toHaveLength(0);
        expect(v.problems.some(p => p.kind === 'warning' && p.message.includes('connaît déjà'))).toBe(true);
    });

    test('un donneur ne peut donner qu\'une techno par tour', () => {
        const dave = profile(4, 'Dave', [], ['plasmaI', 'radarI']);
        const validated = validateActions([
            {from: 2, code: 'plasmaI', to: 1},
            {from: 2, code: 'radarI', to: 4},
        ], [alice, bob, dave]);
        // les deux actions de bob sont en faute
        expect(validated.every(v => v.problems.some(p => /plus de 1 techno/.test(p.message)))).toBe(true);
    });

    test('un receveur ne peut recevoir qu\'une techno par tour', () => {
        const dave = profile(4, 'Dave', ['radarI'], []);
        const erin = profile(5, 'Erin', ['plasmaI'], []);
        const validated = validateActions([
            {from: 4, code: 'radarI', to: 1},
            {from: 5, code: 'plasmaI', to: 1},
        ], [alice, bob, dave, erin]);
        // les deux actions reçues par alice sont en faute
        expect(validated.every(v => v.problems.some(p => p.message.includes('reçoit plus de 1 techno')))).toBe(true);
    });

    test('joueur inconnu = erreur', () => {
        const [v] = validateActions([{from: 99, code: 'plasmaI', to: 1}], [alice, bob]);
        expect(v.problems.some(p => p.message === 'Donneur inconnu')).toBe(true);
    });

    test('techno vide = erreur', () => {
        const [v] = validateActions([{from: 2, code: '', to: 1}], [alice, bob]);
        expect(v.problems.some(p => p.message === 'Techno à préciser')).toBe(true);
    });
});

describe('checkTransfer (dépôt sur la matrice)', () => {
    const giver = profile(1, 'G', ['plasmaI'], []);
    const receiver = profile(2, 'R', [], ['plasmaI']);
    const all = [giver, receiver];

    test('accepte un transfert valide', () => {
        expect(checkTransfer([], 1, 2, 'plasmaI', all).ok).toBe(true);
    });

    test('refuse si le donneur ne connaît pas la techno', () => {
        const res = checkTransfer([], 2, 1, 'plasmaI', all);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.message).toContain('ne connaît pas');
    });

    test('refuse si le receveur ne peut pas la rechercher', () => {
        const other = profile(3, 'O', [], ['radarI']);
        const res = checkTransfer([], 1, 3, 'plasmaI', [giver, other]);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.message).toContain('ne peut pas la rechercher');
    });

    test('refuse l\'auto-donation', () => {
        const res = checkTransfer([], 1, 1, 'plasmaI', all);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.message).toContain('propre techno');
    });

    test('refuse si le donneur a déjà donné ce tour', () => {
        const res = checkTransfer([{from: 1, code: 'radarI', to: 2}], 1, 2, 'plasmaI', all);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.message).toContain('a déjà donné');
    });

    test('refuse si le receveur a déjà reçu ce tour', () => {
        const res = checkTransfer([{from: 3, code: 'radarI', to: 2}], 1, 2, 'plasmaI', all);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.message).toContain('a déjà reçu');
    });
});