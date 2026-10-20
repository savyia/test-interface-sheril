import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import SearchableSelect from './SearchableSelect';

describe('SearchableSelect', () => {
    const options = [
        {value: 'a', label: 'Alpha'},
        {value: 'b', label: 'Beta'},
        {value: 'c', label: 'Gamma'},
    ];

    test('les options s\'affichent après l\'ouverture de la liste', () => {
        render(<SearchableSelect options={options} value="" onChange={() => {}} />);
        expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
        fireEvent.click(screen.getByPlaceholderText('Choisir…'));
        expect(screen.getByText('Alpha')).toBeInTheDocument();
        expect(screen.getByText('Beta')).toBeInTheDocument();
        expect(screen.getByText('Gamma')).toBeInTheDocument();
    });

    test('la saisie filtre les options', () => {
        render(<SearchableSelect options={options} value="" onChange={() => {}} />);
        const input = screen.getByPlaceholderText('Choisir…');
        fireEvent.click(input);
        fireEvent.change(input, {target: {value: 'am'}});
        expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
        expect(screen.getByText('Gamma')).toBeInTheDocument();
    });

    test('sélectionner une option au clic déclenche onChange avec sa valeur', () => {
        const onChange = jest.fn();
        render(<SearchableSelect options={options} value="" onChange={onChange} />);
        fireEvent.click(screen.getByPlaceholderText('Choisir…'));
        fireEvent.mouseDown(screen.getByText('Beta'));
        expect(onChange).toHaveBeenCalledWith('b');
    });

    test('ArrowDown déplace le surlignage et reste bloqué sur la dernière option', () => {
        const onChange = jest.fn();
        render(<SearchableSelect options={options} value="" onChange={onChange} />);
        const input = screen.getByPlaceholderText('Choisir…');
        fireEvent.keyDown(input, {key: 'ArrowDown'}); // ouvre la liste, surlignage sur Alpha (0)
        fireEvent.keyDown(input, {key: 'ArrowDown'}); // Beta (1)
        fireEvent.keyDown(input, {key: 'ArrowDown'}); // Gamma (2)
        fireEvent.keyDown(input, {key: 'ArrowDown'}); // clamp : reste sur Gamma (2)
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(onChange).toHaveBeenLastCalledWith('c');
    });

    test('ArrowUp reste sur la première option', () => {
        const onChange = jest.fn();
        render(<SearchableSelect options={options} value="" onChange={onChange} />);
        const input = screen.getByPlaceholderText('Choisir…');
        fireEvent.keyDown(input, {key: 'ArrowDown'}); // ouvre la liste, surlignage sur Alpha (0)
        fireEvent.keyDown(input, {key: 'ArrowUp'}); // clamp : reste sur Alpha (0)
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(onChange).toHaveBeenLastCalledWith('a');
    });

    test('Entrée valide l\'option surlignée', () => {
        const onChange = jest.fn();
        render(<SearchableSelect options={options} value="" onChange={onChange} />);
        const input = screen.getByPlaceholderText('Choisir…');
        fireEvent.keyDown(input, {key: 'ArrowDown'}); // ouvre la liste, surlignage sur Alpha (0)
        fireEvent.keyDown(input, {key: 'ArrowDown'}); // surligne Beta (1)
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(onChange).toHaveBeenLastCalledWith('b');
    });
});
