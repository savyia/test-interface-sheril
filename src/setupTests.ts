// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom ne définit pas TextEncoder/TextDecoder (utilisés pour les codes base64 UTF-8)
import {TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder} from 'util';

if (typeof globalThis.TextEncoder === 'undefined') {
    (globalThis as any).TextEncoder = NodeTextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
    (globalThis as any).TextDecoder = NodeTextDecoder;
}
