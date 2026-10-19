import React from 'react';
import {render, screen} from '@testing-library/react';
import {ReportProvider} from '../context/ReportContext';
import TransfertTechno from './TransfertTechno';

// Smoke test : l'écran se monte sans rapport chargé (cas initial)
describe('TransfertTechno', () => {
    test('affiche les deux onglets sans rapport', () => {
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
});