import { Camera, CameraOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Button, Field } from './ui';
import type { DeliveryValidation } from '../types/api';

// Lo que pide el campo según cómo valida la entrega el negocio (migración 226 del back). La
// credencial del alumno sirve en todos los modos.
const FIELD_COPY: Record<'qr_o_codigo' | 'qr' | 'codigo', { label: string; placeholder: string; hint: string }> = {
  qr_o_codigo: {
    label: 'QR o código de 4 dígitos',
    placeholder: 'Escanea su QR o escribe el código que te dicta',
    hint: 'El código y el QR son de un solo pedido. Tras 5 códigos equivocados, solo sirve su QR.',
  },
  qr: {
    label: 'QR del pedido o credencial',
    placeholder: 'Escanea su QR o su credencial',
    hint: 'En este negocio el código de 4 dígitos no sirve para entregar.',
  },
  codigo: {
    label: 'Código de 4 dígitos',
    placeholder: 'Escribe el código que te dicta o escanea su credencial',
    hint: 'El código es de un solo pedido. Tras 5 códigos equivocados, solo sirve su credencial.',
  },
};

interface BarcodeResult {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<BarcodeResult[]>;
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorInstance;

/**
 * Una pistola lectora teclea el código y manda Enter, así que basta con que el campo tenga el
 * foco y viva dentro del formulario de entrega: el Enter lo envía.
 */
export function QrTokenField({
  value,
  onChange,
  error,
  autoFocus = false,
  mode,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
  /** Cómo valida la entrega el negocio; sin él, QR o código (lo de siempre). */
  mode?: DeliveryValidation;
}) {
  const copy = FIELD_COPY[mode === 'qr' || mode === 'codigo' ? mode : 'qr_o_codigo'];
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
    if (!video || !stream) return;

    const detector = detectorConstructor ? new detectorConstructor({ formats: ['qr_code'] }) : null;
    const canvas = document.createElement('canvas');
    let cancelled = false;
    let timer: number | undefined;
    video.srcObject = stream;

    async function detect() {
      if (cancelled || !video) return;
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          if (detector) {
            const result = (await detector.detect(video))[0];
            if (result?.rawValue) {
              onChange(result.rawValue);
              setScannerError(null);
              setScanning(false);
              return;
            }
          } else if (video.videoWidth > 0 && video.videoHeight > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imgData.data, imgData.width, imgData.height);
              if (code?.data) {
                onChange(code.data);
                setScannerError(null);
                setScanning(false);
                return;
              }
            }
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
        label={copy.label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={copy.placeholder}
        error={error}
        hint={copy.hint}
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
