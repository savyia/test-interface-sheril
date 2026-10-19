import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import SearchableSelect from './SearchableSelect';

describe('SearchableSelect', () => {
    const options = [
        {value: 'a', label: 'Alpha'},
        {value: 'b', label: 'Beta', disabled: true},
        {value: 'c', label: 'Gamma'},
    ];

    test('une option désactivée n\'est pas sélectionnable au clic', () => {
        const onChange = jest.fn();
        render(<SearchableSelect options={options} value="" onChange={onChange} />);
        fireEvent.click(screen.getByPlaceholderText('Choisir…'));
        fireEvent.mouseDown(screen.getByText('Beta'));
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.mouseDown(screen.getByText('Alpha'));
        expect(onChange).toHaveBeenCalledWith('a');
    });

    test('la valeur courante reste affichée même si son option est désactivée', () => {
        render(<SearchableSelect options={options} value="b" onChange={() => {}} />);
        expect(screen.getByPlaceholderText('Choisir…')).toHaveValue('Beta');
    });

    test('la navigation clavier saute les options désactivées', () => {
        const onChange = jest.fn();
        render(<SearchableSelect options={options} value="" onChange={onChange} />);
        const input = screen.getByPlaceholderText('Choisir…');
        fireEvent.keyDown(input, {key: 'ArrowDown'}); // ouvre la liste
        fireEvent.keyDown(input, {key: 'ArrowDown'}); // saute Beta (désactivée)
        fireEvent.keyDown(input, {key: 'Enter'});
        // le surlignage doit atterrir sur Gamma (2), pas sur Beta (1)
        expect(onChange).toHaveBeenCalledWith('c');
    });
});