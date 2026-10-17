// jsQR 1.4.0; MIT license in jsQR-LICENSE.txt. Bundled locally for browser use.
declare function decode(data: Uint8ClampedArray, width: number, height: number, options?: {inversionAttempts?: 'attemptBoth' | 'dontInvert' | 'onlyInvert' | 'invertFirst'}): {data: string} | null;
export default decode;
