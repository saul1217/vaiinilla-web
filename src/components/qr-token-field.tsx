import { Camera, CameraOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Field } from './ui';

interface BarcodeResult {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<BarcodeResult[]>;
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

export function QrTokenField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning) return;
    const detectorConstructor = (window as typeof window & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }).BarcodeDetector;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!detectorConstructor || !video || !stream) return;

    const detector = new detectorConstructor({ formats: ['qr_code'] });
    let cancelled = false;
    let timer: number | undefined;
    video.srcObject = stream;

    async function detect() {
      if (cancelled || !video) return;
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const result = (await detector.detect(video))[0];
          if (result?.rawValue) {
            onChange(result.rawValue);
            setScannerError(null);
            setScanning(false);
            return;
          }
        }
      } catch {
        setScannerError('No se pudo leer el código. Puedes capturarlo manualmente.');
      }
      timer = window.setTimeout(() => void detect(), 250);
    }

    void video.play().then(detect).catch(() => {
      setScannerError('No se pudo iniciar la cámara. Puedes capturar el token manualmente.');
      setScanning(false);
    });

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      stopStream(streamRef);
    };
  }, [onChange, scanning]);

  useEffect(() => () => stopStream(streamRef), []);

  async function startScanner() {
    setScannerError(null);
    if (!('BarcodeDetector' in window)) {
      setScannerError('Este navegador no permite leer QR con la cámara. Pega el token manualmente.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError('La cámara no está disponible. Pega el token manualmente.');
      return;
    }
    try {
      setStarting(true);
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      setScanning(true);
    } catch {
      setScannerError('No se concedió acceso a la cámara. Puedes pegar el token manualmente.');
    } finally {
      setStarting(false);
    }
  }

  function stopScanner() {
    setScanning(false);
    stopStream(streamRef);
  }

  return (
    <div className="qr-field">
      <Field
        id="pickup-token"
        name="pickup-token"
        label="Token QR de entrega"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        placeholder="Escanea o pega el código del cliente"
        error={error}
        hint="El token es de un solo pedido y no se guarda en esta Web."
      />
      <Button
        type="button"
        variant="secondary"
        loading={starting}
        onClick={() => void (scanning ? stopScanner() : startScanner())}
      >
        {scanning ? <CameraOff aria-hidden="true" className="size-5" /> : <Camera aria-hidden="true" className="size-5" />}
        {scanning ? 'Cancelar cámara' : 'Escanear con cámara'}
      </Button>
      {scanning && (
        <div className="qr-scanner" aria-live="polite">
          <video ref={videoRef} muted playsInline aria-label="Vista de la cámara para escanear QR" />
          <span>Coloca el código dentro del recuadro</span>
        </div>
      )}
      {scannerError && <p className="qr-field__error" role="alert">{scannerError}</p>}
    </div>
  );
}

function stopStream(ref: { current: MediaStream | null }) {
  ref.current?.getTracks().forEach((track) => track.stop());
  ref.current = null;
}
