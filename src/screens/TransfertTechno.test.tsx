import React from 'react';
import {fireEvent, render, screen, within} from '@testing-library/react';
import {ReportProvider, useReport} from '../context/ReportContext';
import TransfertTechno from './TransfertTechno';
import {saveProfiles} from '../storage/techTransferStore';
import {PROFILE_VERSION} from '../utils/techProfile';
import {GlobalData, Rapport, TechProfile} from '../types';

// L'écran lit tout son état via useReport : on mocke le hook (le reste du
// contexte, dont ReportProvider, reste le vrai)
jest.mock('../context/ReportContext', () => ({
    ...jest.requireActual('../context/ReportContext'),
    useReport: jest.fn(),
}));

// --- Fixtures minimales : un rapport (joueur num 5) + un catalogue de 3 technos ---

const RAPPORT: Rapport = {
    tour: 12,
    joueur: {
        numero: 5,
        nom: 'Moi',
        raceId: 1,
        reputation: '',
        statut: '',
        puissance: 0,
        argent: 0,
        capitale: {x: 0, y: 0},
        alliances: [],
        pna: [],
    },
    technologiesConnues: ['T1'],
    technologiesAtteignables: ['T1', 'T2'],
    systemesJoueur: [],
    systemesDetectes: [],
    systemesDetectesDuTour: [],
    flottesJoueur: [],
    flottesDetectees: [],
    plansVaisseaux: [],
    budgetTechnologique: 0,
    lieutenants: [],
    combats: [],
};

const GLOBAL_DATA: GlobalData = {
    commandants: [{numero: 5, nom: 'Moi'}, {numero: 7, nom: 'Ada'}],
    technologies: [
        {base: 'T1', code: 'T1', niv: 0, nom: 'Mine', type: 0, recherche: 100, parents: [], caracteristiques: []},
        {base: 'T2', code: 'T2', niv: 0, nom: 'Chantier', type: 1, recherche: 50, parents: [], caracteristiques: []},
        {base: 'T3', code: 'T3', niv: 0, nom: 'Gouverneur', type: 1, recherche: 30, parents: [], caracteristiques: []},
    ],
    races: [],
    marchandises: [],
    politiques: {},
    competencesLieutenants: {},
    caracteristiquesBatiment: {},
    caracteristiquesComposant: {},
    plansPublic: [],
    tailleVaisseaux: [],
    modificateursStabilite: [],
    modificateursStabiliteTaxation: [],
    systemes: [],
};

// Un autre joueur : connaît « Chantier » (T2), peut rechercher « Mine » (T1)
const ADA: TechProfile = {
    v: PROFILE_VERSION,
    tour: 12,
    num: 7,
    nom: 'Ada',
    known: ['T2'],
    atteignable: ['T1'],
    inProgress: [],
    wishes: [],
};

const mockRapport = (value?: {rapport?: Rapport; global?: GlobalData}) => {
    (useReport as jest.Mock).mockReturnValue({rapport: RAPPORT, global: GLOBAL_DATA, ...value});
};

// Smoke test : l'écran se monte sans rapport chargé (cas initial)
describe('TransfertTechno', () => {
    beforeEach(() => {
        // Le stockage (profils, plan) est persisté par tour dans localStorage
        localStorage.clear();
        saveProfiles([ADA]);
        (useReport as jest.Mock).mockReset();
    });

    test('affiche les deux onglets sans rapport', () => {
        mockRapport({rapport: undefined, global: undefined});
        render(
            <ReportProvider>
                <TransfertTechno />
            </ReportProvider>
        );
        expect(screen.getByText('Transfert techno')).toBeInTheDocument();
        expect(screen.getAllByText('Mon profil').length).toBeGreaterThanOrEqual(1); // onglet + titre de section
        expect(screen.getByText(/Plan \(/)).toBeInTheDocument();
        expect(screen.queryByText(/Matrice/)).not.toBeInTheDocument();
        expect(screen.getByText(/Chargez un rapport\.xml/)).toBeInTheDocument();
    });

    describe('avec rapport', () => {
        const openPlanTab = () => fireEvent.click(screen.getByText('Plan (2)'));

        test('ne propose pas de retirer son propre profil, mais celui des joueurs importés', () => {
            mockRapport();
            render(
                <ReportProvider>
                    <TransfertTechno />
                </ReportProvider>
            );
            openPlanTab();

            // Les deux joueurs sont dans la matrice
            expect(screen.getByRole('columnheader', {name: 'Vous'})).toBeInTheDocument();
            expect(screen.getByRole('columnheader', {name: 'Ada'})).toBeInTheDocument();
            expect(screen.getByText('Mine I')).toBeInTheDocument();
            expect(screen.getByText('Chantier I')).toBeInTheDocument();

            // Le badge « Vous » n'a pas de bouton de retrait
            const youBadge = screen.getAllByText('Vous').map(el => el.closest('.badge')).find(Boolean);
            expect(youBadge).not.toBeNull();
            expect(youBadge?.querySelector('button')).toBeNull();

            // Le badge du joueur importé, lui, en a un
            const adaBadge = screen.getAllByText('Ada').map(el => el.closest('.badge')).find(Boolean);
            expect(adaBadge).not.toBeNull();
            expect(adaBadge?.querySelector('button')).not.toBeNull();
        });

        test('un propre profil importé (même numéro) reste retirable, et le profil dérivé revient après', () => {
            mockRapport();
            // Importer son propre code : la copie importée masque le profil dérivé
            saveProfiles([{...ADA, num: 5, nom: 'Moi', known: ['T2'], atteignable: ['T1']}]);
            render(
                <ReportProvider>
                    <TransfertTechno />
                </ReportProvider>
            );
            openPlanTab();

            const badges = () => screen.getAllByText('Vous')
                .map(el => el.closest('.badge'))
                .filter((b): b is HTMLElement => b !== null);
            // Un seul badge « Vous » (l'importé masque le dérivé), avec bouton de retrait
            expect(badges()).toHaveLength(1);
            const removeBtn = badges()[0].querySelector('button');
            expect(removeBtn).not.toBeNull();

            // Le retirer : le profil dérivé (non stocké) redevient visible, sans bouton
            fireEvent.click(removeBtn as Element);
            expect(badges()).toHaveLength(1);
            expect(badges()[0].querySelector('button')).toBeNull();
        });

        test('planifie un transfert par glisser-déposer et le retire en cliquant sur la pastille', () => {
            mockRapport();
            render(
                <ReportProvider>
                    <TransfertTechno />
                </ReportProvider>
            );
            openPlanTab();

            // Ligne « Chantier » : Ada la connaît (✓, source de drag),
            // le joueur peut la rechercher (▣, cible de dépôt)
            const row = screen.getByText('Chantier I').closest('tr') as HTMLElement;
            const sourceCell = within(row).getByText('✓').closest('td') as HTMLElement;
            const targetCell = within(row).getByText('▣').closest('td') as HTMLElement;
            expect(sourceCell).not.toBe(targetCell);

            // Drag : setData est requis par le handler (jsdom n'a pas de DataTransfer)
            const setData = jest.fn();
            fireEvent.dragStart(sourceCell, {dataTransfer: {setData}});
            expect(setData).toHaveBeenCalledWith('text/plain', 'T2');
            fireEvent.drop(targetCell);

            // Dépôt accepté : le transfert apparaît comme pastille dans la case du donneur
            const pill = screen.getByText('→ Moi');
            expect(pill).toBeInTheDocument();
            expect(pill.closest('button')).toHaveAttribute('title', 'Transfert planifié — cliquer pour retirer');

            // Un clic sur la pastille retire le transfert du plan
            fireEvent.click(pill);
            expect(screen.queryByText('→ Moi')).not.toBeInTheDocument();
        });

        test('trie les lignes de la matrice en cliquant sur l’en-tête Technologie', () => {
            mockRapport();
            render(
                <ReportProvider>
                    <TransfertTechno />
                </ReportProvider>
            );
            openPlanTab();

            const table = screen.getByRole('table');
            const rows = () => Array.from(table.querySelectorAll('tbody tr'));
            // Ordre initial = ordre du catalogue : Mine avant Chantier
            expect(rows()[0].textContent).toContain('Mine I');

            fireEvent.click(screen.getByTitle('Trier par nom'));

            // Tri croissant par nom : « Chantier » précède « Mine »
            expect(rows()[0].textContent).toContain('Chantier I');
            expect(rows()[1].textContent).toContain('Mine I');
        });
    });
});
