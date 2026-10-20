import {
    clearTechTransfer, getAllProfiles, getManualProfile, getPlan,
    getLatestManualBefore, getProfiles, saveManualProfile, savePlan, saveProfiles,
} from './techTransferStore';
import {TechProfile} from '../types';

describe('techTransferStore — migration des anciennes données v1', () => {
    beforeEach(() => localStorage.clear());

    test('inProgress {code, pct} devient des codes simples', () => {
        const v1 = {
            v: 1, tour: 10, num: 2, nom: 'Bob',
            known: ['plasmaI'], atteignable: ['radarI'],
            inProgress: [{code: 'radarII', pct: 40}], wishes: ['plasmaII'],
        };
        saveProfiles([v1 as unknown as TechProfile]);
        const [p] = getProfiles(10);
        expect(p.inProgress).toEqual(['radarII']);
        expect(p.known).toEqual(['plasmaI']);
        expect(p.atteignable).toEqual(['radarI']);
        expect(p.wishes).toEqual(['plasmaII']);
    });

    test('les entrées illisibles sont jetées', () => {
        const dirty = {
            v: 2, tour: 10, num: 3, nom: 'X',
            known: ['a', 42, null], inProgress: [{code: 'b'}, 'c', {pct: 1}], wishes: ['d'],
        };
        saveProfiles([dirty as unknown as TechProfile]);
        const [p] = getProfiles(10);
        expect(p.known).toEqual(['a']);
        expect(p.inProgress).toEqual(['b', 'c']);
        expect(p.wishes).toEqual(['d']);
    });

    test('profil manuel : v1 migré à la lecture', () => {
        localStorage.setItem('transfert_manual', JSON.stringify({
            9: {inProgress: [{code: 'radarII', pct: 40}], wishes: ['plasmaI']},
        }));
        const m = getLatestManualBefore(10);
        expect(m?.inProgress).toEqual(['radarII']);
        expect(m?.wishes).toEqual(['plasmaI']);
    });

    test('profil manuel : sauvegarde propre conservée telle quelle', () => {
        saveManualProfile(10, {inProgress: ['radarII'], wishes: ['plasmaI']});
        const m = getLatestManualBefore(11);
        expect(m?.inProgress).toEqual(['radarII']);
        expect(m?.wishes).toEqual(['plasmaI']);
    });
});

describe('techTransferStore — bornage et effacement des tours', () => {
    beforeEach(() => localStorage.clear());

    const profil = (tour: number): TechProfile => ({
        v: 2, tour, num: 1, nom: 'X',
        known: ['a'], atteignable: ['b'], inProgress: [], wishes: [],
    });

    test('seuls les 30 tours les plus récents sont conservés', () => {
        // Une clé non numérique doit survivre au bornage
        localStorage.setItem('transfert_manual', JSON.stringify({brouillon: {inProgress: [], wishes: ['a']}}));
        for (let tour = 1; tour <= 35; tour++) {
            saveManualProfile(tour, {inProgress: [`code${tour}`], wishes: []});
        }
        for (let tour = 1; tour <= 5; tour++) {
            expect(getManualProfile(tour)).toBeUndefined();
        }
        for (let tour = 6; tour <= 35; tour++) {
            expect(getManualProfile(tour)?.inProgress).toEqual([`code${tour}`]);
        }
        const raw = JSON.parse(localStorage.getItem('transfert_manual')!);
        expect(Object.keys(raw).map(Number).filter(Number.isFinite).sort((a, b) => a - b))
            .toEqual(Array.from({length: 30}, (_, i) => i + 6));
        expect(raw.brouillon).toEqual({inProgress: [], wishes: ['a']});
    });

    test('le bornage d\'une carte n\'affecte pas les autres', () => {
        for (let tour = 1; tour <= 35; tour++) saveManualProfile(tour, {inProgress: [`m${tour}`], wishes: []});
        saveProfiles(Array.from({length: 35}, (_, i) => profil(100 + i)));
        for (let tour = 200; tour <= 234; tour++) savePlan(tour, [{from: 1, code: 'a', to: 2}]);

        expect(Object.keys(JSON.parse(localStorage.getItem('transfert_manual')!)).map(Number).sort((a, b) => a - b))
            .toEqual(Array.from({length: 30}, (_, i) => i + 6));
        expect(Object.keys(getAllProfiles()).map(Number).sort((a, b) => a - b))
            .toEqual(Array.from({length: 30}, (_, i) => i + 105));
        expect(Object.keys(JSON.parse(localStorage.getItem('transfert_plan')!)).map(Number).sort((a, b) => a - b))
            .toEqual(Array.from({length: 30}, (_, i) => i + 205));

        expect(getProfiles(105).map(p => p.tour)).toEqual([105]);
        expect(getPlan(205)).toEqual([{from: 1, code: 'a', to: 2}]);
        expect(getManualProfile(35)?.inProgress).toEqual(['m35']);
    });

    test('clearTechTransfer efface les trois cartes', () => {
        saveManualProfile(10, {inProgress: ['a'], wishes: ['b']});
        saveProfiles([profil(10)]);
        savePlan(10, [{from: 1, code: 'a', to: 2}]);

        clearTechTransfer();

        expect(getManualProfile(10)).toBeUndefined();
        expect(getProfiles(10)).toEqual([]);
        expect(getPlan(10)).toEqual([]);
        expect(localStorage.getItem('transfert_manual')).toBeNull();
        expect(localStorage.getItem('transfert_profiles')).toBeNull();
        expect(localStorage.getItem('transfert_plan')).toBeNull();
    });
});
