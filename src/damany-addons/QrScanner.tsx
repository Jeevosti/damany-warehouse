import {useEffect, useRef, useState} from 'react';
import {Camera, ImageUp, ScanLine, X} from 'lucide-react';
import {Button, FormError, Input} from '../components/ui';
import {cameraScanGate} from './inventoryScanning';

export function QrScanner({onRead, disabled = false, continuous = true}: {onRead: (text: string) => void; disabled?: boolean; continuous?: boolean}) {
  const [camera, setCamera] = useState(false), [text, setText] = useState(''), [error, setError] = useState(''), [reading, setReading] = useState(false), [lastCode, setLastCode] = useState('');
  const video = useRef<HTMLVideoElement>(null), imageInput = useRef<HTMLInputElement>(null), callback = useRef(onRead), enabled = useRef(!disabled), mounted = useRef(true);
  callback.current = onRead; enabled.current = !disabled;
  useEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useEffect(() => {
    if (!camera) return;
    let active = true, stream: MediaStream | undefined, frame = 0, last = 0;
    const accept = cameraScanGate();
    const stop = () => {if (document.hidden) setCamera(false);}; document.addEventListener('visibilitychange', stop);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera scanning needs HTTPS and camera access. Use an image or USB scanner if a camera is unavailable.');
        const decoder = (await import('./vendor/barcodeDecoder')).default;
        if (!active || !enabled.current) return;
        stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1600}, height: {ideal: 900}}});
        if (!active) {stream.getTracks().forEach(track => track.stop()); return;}
        const element = video.current; if (!element) {stream.getTracks().forEach(track => track.stop()); return;}
        element.srcObject = stream; await element.play();
        if (!active) return;
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d', {willReadFrequently: true});
        if (!context) throw new Error('Image scanning is unavailable in this browser.');
        const scan = (time: number) => {
          if (!active || !enabled.current) return;
          try {
            if (time - last > 300 && element.readyState >= 2 && element.videoWidth) {
              last = time; canvas.width = Math.min(1280, element.videoWidth); canvas.height = Math.round(element.videoHeight * canvas.width / element.videoWidth);
              context.drawImage(element, 0, 0, canvas.width, canvas.height);
              const pixels = context.getImageData(0, 0, canvas.width, canvas.height), code = decoder(pixels.data, pixels.width, pixels.height);
              if (accept(code, time) && code) {setLastCode(code); callback.current(code); if (!continuous) {setCamera(false); return;}}
            }
            frame = requestAnimationFrame(scan);
          } catch (value) {setError((value as Error).message || 'Camera scanning failed. Try an image or USB scanner.'); setCamera(false);}
        }; frame = requestAnimationFrame(scan);
      } catch (value) {if (active) {setError((value as Error).message || 'Camera access failed. Try an image or manual entry.'); setCamera(false);}}
    })();
    return () => {active = false; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); if (video.current) video.current.srcObject = null; document.removeEventListener('visibilitychange', stop);};
  }, [camera, continuous]);
  useEffect(() => {if (disabled) setCamera(false);}, [disabled]);
  const readText = () => {setError(''); if (!disabled && text.trim()) {setLastCode(text.trim()); onRead(text); setText('');}};
  async function scanImage(file: File) {
    setReading(true); setError('');
    const url = URL.createObjectURL(file);
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
      const picture = new Image(); picture.src = url; await picture.decode();
      const scale = Math.min(1, 2000 / Math.max(picture.width, picture.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(picture.width * scale)); canvas.height = Math.max(1, Math.round(picture.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('Could not read the image.');
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height), decoder = (await import('./vendor/barcodeDecoder')).default;
      const code = decoder(pixels.data, pixels.width, pixels.height);
      if (!code) throw new Error('No QR code or barcode found. Use a clear image with the whole label visible.');
      if (mounted.current && enabled.current) {setLastCode(code); callback.current(code);}
    } catch (value) {if (mounted.current) setError((value as Error).message || 'Could not scan this image.');} finally {URL.revokeObjectURL(url); if (mounted.current) setReading(false);}
  }
  return <div className="dw-scanner"><div className="dw-action-row"><Button type="button" variant="secondary" disabled={disabled || reading} onClick={() => {setError(''); setCamera(!camera);}}>{camera ? <X size={16}/> : <Camera size={16}/>} {camera ? 'Stop camera' : 'Scan QR / barcode'}</Button><Button type="button" variant="secondary" disabled={disabled || reading} onClick={() => imageInput.current?.click()}><ImageUp size={16}/>{reading ? 'Reading…' : 'Read code from image'}</Button><input type="file" accept="image/*" ref={imageInput} hidden onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if (file && !disabled) void scanImage(file);}}/></div>{camera && <><video className="dw-camera" ref={video} muted playsInline autoPlay aria-label="QR and barcode camera scanner"/><p className="dw-help">Point at one label at a time. Codes are read automatically. To count another unit with the same product barcode, move the label fully out of view for a second, then scan the next unit.</p></>}<div className="dw-scan-text"><Input aria-label="Scanned barcode, SKU or serial" placeholder="Click here, then scan with a USB scanner or type a code" value={text} disabled={disabled} onChange={event => setText(event.target.value)} onKeyDown={event => {if (event.key === 'Enter' && !event.nativeEvent.isComposing) {event.preventDefault(); readText();}}}/><Button type="button" disabled={disabled || !text.trim()} onClick={readText}><ScanLine size={16}/>Read code</Button></div><p className="dw-help">USB scanners submit automatically when configured to end each scan with Enter. Stock changes only after Review → Confirm and save. Images are processed on this device.</p>{lastCode && <p className="dw-scanner-result" role="status">Last code read: {lastCode.slice(0, 120)}</p>}<FormError message={error}/></div>;
}
