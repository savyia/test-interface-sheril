import {
    getLatestManualBefore, getProfiles, saveManualProfile, saveProfiles,
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