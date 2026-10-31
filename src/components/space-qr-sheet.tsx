import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, Nfc } from 'lucide-react';
import QRCode from 'qrcode';
import { AppSheet } from './app-sheet';
import { Button, Feedback } from './ui';
import { canWriteNfc, writeNfcUrl } from '../lib/nfc-tag';
import type { ManagedSpace } from '../types/api';

export function SpaceQrSheet({
  space,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  space: ManagedSpace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nfc, setNfc] = useState<'idle' | 'waiting' | 'done' | 'error'>('idle');
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    void QRCode.toDataURL(space.qr_url, {
      margin: 2,
      width: 240,
      color: { dark: '#000000', light: '#FFFFFF' },
    }).then((value) => {
      if (mounted) setQr(value);
    });
    return () => {
      mounted = false;
    };
  }, [open, space.qr_url]);
  async function copyUrl() {
    await navigator.clipboard.writeText(space.qr_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  async function writeTag() {
    setNfc('waiting');
    try {
      await writeNfcUrl(space.qr_url);
      setNfc('done');
    } catch {
      setNfc('error');
    }
  }
  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`QR y código · ${space.nombre}`}
      description="Código y enlace de este espacio."
      size="compact"
      returnFocusRef={returnFocusRef}
    >
      <AppSheet.Body>
        <div className="space-qr-sheet">
          {qr ? (
            <img src={qr} alt={`Código QR de ${space.nombre}`} width="240" height="240" />
          ) : (
            <p role="status">Preparando código QR…</p>
          )}
          {space.codigo && (
            <div>
              <p className="eyebrow">Código del espacio</p>
              <p className="font-mono text-3xl font-extrabold tracking-[0.25em]">{space.codigo}</p>
            </div>
          )}
          <div>
            <p className="eyebrow">Enlace del QR y NFC</p>
            <p className="break-all text-sm">{space.qr_url}</p>
            {!canWriteNfc() && (
              <p className="mt-2 text-sm text-muted">
                Para NFC, graba este enlace en la etiqueta con cualquier app de NFC.
              </p>
            )}
          </div>
          <div className="space-qr-sheet__actions">
            <Button type="button" variant="secondary" onClick={() => void copyUrl()}>
              <Copy aria-hidden="true" className="size-4" />
              {copied ? 'Copiado' : 'Copiar enlace'}
            </Button>
            {qr && (
              <a className="button button--ghost" href={qr} download={`${space.nombre.replace(/\s+/g, '-')}-qr.png`}>
                <Download aria-hidden="true" className="size-4" />
                Descargar QR
              </a>
            )}
            <a className="button button--ghost" href={space.qr_url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" className="size-4" />
              Abrir
            </a>
            {canWriteNfc() && (
              <Button type="button" variant="ghost" onClick={() => void writeTag()} disabled={nfc === 'waiting'}>
                <Nfc aria-hidden="true" className="size-4" />
                {nfc === 'waiting'
                  ? 'Acerca la etiqueta…'
                  : nfc === 'done'
                    ? 'Grabada'
                    : nfc === 'error'
                      ? 'No se grabó, reintenta'
                      : 'Grabar en NFC'}
              </Button>
            )}
          </div>
          {nfc === 'error' && (
            <Feedback tone="error">No se pudo grabar la etiqueta NFC. Puedes reintentar o usar el enlace.</Feedback>
          )}
        </div>
      </AppSheet.Body>
    </AppSheet>
  );
}
