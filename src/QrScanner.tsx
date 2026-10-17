import {useEffect, useRef, useState} from 'react';
import {Camera, ImageUp, ScanLine, X} from 'lucide-react';
import {Button, FormError, Input} from '../components/ui';
export function QrScanner({onRead, disabled = false}: {onRead: (text: string) => void; disabled?: boolean}) {
  const [camera, setCamera] = useState(false), [text, setText] = useState(''), [error, setError] = useState(''), [reading, setReading] = useState(false);
  const video = useRef<HTMLVideoElement>(null), imageInput = useRef<HTMLInputElement>(null), callback = useRef(onRead);
  callback.current = onRead;
  useEffect(() => {
    if (!camera) return;
    let active = true, stream: MediaStream | undefined, frame = 0, last = 0;
    const stop = () => {if (document.hidden) setCamera(false);}; document.addEventListener('visibilitychange', stop);
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera scanning needs HTTPS and a supported camera. Upload a QR image or type the code below.');
        const decoder = (await import('./vendor/qrDecoder')).default;
        stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}}});
        if (!active) {stream.getTracks().forEach(track => track.stop()); return;}
        const element = video.current; if (!element) {stream.getTracks().forEach(track => track.stop()); return;}
        element.srcObject = stream; await element.play();
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d', {willReadFrequently: true});
        if (!context) throw new Error('Image scanning is unavailable in this browser.');
        const scan = (time: number) => {
          if (!active) return;
          if (time - last > 200 && element.readyState >= 2 && element.videoWidth) {
            last = time; canvas.width = Math.min(800, element.videoWidth); canvas.height = Math.round(element.videoHeight * canvas.width / element.videoWidth);
            context.drawImage(element, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = decoder(pixels.data, pixels.width, pixels.height, {inversionAttempts: 'attemptBoth'});
            if (code?.data) {setCamera(false); callback.current(code.data); return;}
          }
          frame = requestAnimationFrame(scan);
        }; frame = requestAnimationFrame(scan);
      } catch (value) {if (active) {setError((value as Error).message || 'Camera access failed. Try a QR image or manual entry.'); setCamera(false);}}
    })();
    return () => {active = false; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); if (video.current) video.current.srcObject = null; document.removeEventListener('visibilitychange', stop);};
  }, [camera]);
  useEffect(() => {if (disabled) setCamera(false);}, [disabled]);
  const readText = () => {setError(''); if (text.trim()) {onRead(text); setText('');}};
  async function scanImage(file: File) {
    setReading(true); setError('');
    const url = URL.createObjectURL(file);
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('Choose a QR image smaller than 12 MB.');
      const picture = new Image(); picture.src = url; await picture.decode();
      const scale = Math.min(1, 1800 / Math.max(picture.width, picture.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(picture.width * scale)); canvas.height = Math.max(1, Math.round(picture.height * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('Could not read the image.');
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height), decoder = (await import('./vendor/qrDecoder')).default;
      const result = decoder(pixels.data, pixels.width, pixels.height, {inversionAttempts: 'attemptBoth'});
      if (!result?.data) throw new Error('No QR code found. Try a clear, close-up image.');
      onRead(result.data);
    } catch (value) {setError((value as Error).message || 'Could not scan this image.');} finally {URL.revokeObjectURL(url); setReading(false);}
  }
  return <div className="dw-scanner"><div className="dw-action-row"><Button type="button" variant="secondary" disabled={disabled || reading} onClick={() => {setError(''); setCamera(!camera);}}>{camera ? <X size={16}/> : <Camera size={16}/>} {camera ? 'Stop camera' : 'Scan QR with camera'}</Button><Button type="button" variant="secondary" disabled={disabled || reading} onClick={() => imageInput.current?.click()}><ImageUp size={16}/>{reading ? 'Reading…' : 'Read QR image'}</Button><input type="file" accept="image/*" ref={imageInput} hidden onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if (file) void scanImage(file);}}/></div>{camera && <video className="dw-camera" ref={video} muted playsInline autoPlay aria-label="Camera QR scanner"/>}<div className="dw-scan-text"><Input aria-label="Scanned SKU or serial" placeholder="Scan with a USB scanner, or type a SKU / serial" value={text} disabled={disabled} onChange={event => setText(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); readText();}}}/><Button type="button" disabled={disabled || !text.trim()} onClick={readText}><ScanLine size={16}/>Read code</Button></div><p className="dw-help">Scanning fills the form. Stock changes only after you review and save. Camera images stay in this browser.</p><FormError message={error}/></div>;
}
