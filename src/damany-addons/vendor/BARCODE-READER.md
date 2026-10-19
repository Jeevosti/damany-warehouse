# Bundled barcode reader

The application loads `barcodeDecoder.js` only when camera or image scanning starts. Images are decoded in the browser. Selected product codes and serials are saved through the existing database workflows. USB scanners and typed codes do not need the decoder.

Source: [ZXing JS](https://github.com/zxing-js/library), npm `@zxing/library@0.21.3`, the published UMD bundle. Apache-2.0; see `ZXING-LICENSE.txt`. Its embedded ts-custom-error dependency is MIT; see `TS-CUSTOM-ERROR-LICENSE.txt`. Other upstream notices are retained in the JavaScript file.

The source archive SHA-256 is `c1aca7041e2723f30fd3ccaccb85e8281e714007dc474f1742798b4a1dc6a7af`.

The Damany wrapper converts RGBA pixels to luminance and uses the multi-format reader. Supported formats: QR, Code 128, Code 39, Code 93, EAN-13, EAN-8, UPC-A, UPC-E, ITF, Data Matrix, PDF417 and Aztec. Generated QR, Code 128 and EAN-13 fixtures were decoded in automated checks; physical camera/hardware operation remains device-dependent and has not been tested here.

The package includes the compiled decoder and its TypeScript declaration. No extra npm dependency or online decoding service is required. Keep the decoder, declaration and notices together. The reproducible wrapper/bundler is `scripts/vendor-barcode-decoder.mjs` in the development repository.
