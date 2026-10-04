import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Nfc } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Choice } from './choice';
import { Button, Feedback } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { canWriteNfc, writeNfcUrl } from '../lib/nfc-tag';
import type { BusinessSettings } from '../types/api';

// Cómo te encuentran: aparecer o no en el directorio de Vaiinilla, y el QR general de la
// tienda (entrada, mostrador) que abre su menú aunque esté oculta. Se guarda solo.
export function StoreDirectoryCard({
  token,
  scopeId,
  settings,
}: {
  token: string;
  scopeId: string;
  settings: BusinessSettings;
}) {
  const queryClient = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nfc, setNfc] = useState<'idle' | 'waiting' | 'done' | 'error'>('idle');
  const storeUrl = settings.tienda_url ?? null;
  const visible = settings.visible_en_directorio === true;

  const save = useMutation({
    mutationFn: (next: boolean) => api.saveBusinessSettings(token, { visible_en_directorio: next }),
    onSuccess: (data) => {
      queryClient.setQueryData(['business-settings', scopeId], data);
    },
  });

  useEffect(() => {
    if (!storeUrl) return;
    let mounted = true;
    void QRCode.toDataURL(storeUrl, { margin: 2, width: 220, color: { dark: '#16150F', light: '#FBF9F2' } }).then(
      (value) => {
        if (mounted) setQr(value);
      },
    );
    return () => {
      mounted = false;
    };
  }, [storeUrl]);

  async function copy() {
    if (!storeUrl) return;
    await navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function writeTag() {
    if (!storeUrl) return;
    setNfc('waiting');
    try {
      await writeNfcUrl(storeUrl);
      setNfc('done');
    } catch {
      setNfc('error');
    }
  }

  return (
    <section className="panel-card grid gap-5 p-5 sm:p-6" aria-labelledby="store-directory-title">
      <div>
        <h2 id="store-directory-title" className="text-xl font-extrabold text-ink">
          ¿Cómo te encuentran tus clientes?
        </h2>
        <p className="mt-1 text-sm text-muted">
          Siempre pueden llegar por el QR o el código de su mesa, o por el QR de tu tienda. Esto decide si además
          apareces en la lista de lugares de Vaiinilla.
        </p>
      </div>
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      <Choice
        name="Directorio de Vaiinilla"
        value={visible}
        onChange={(next) => {
          if (next !== visible && !save.isPending) save.mutate(next);
        }}
        options={[
          { value: false, label: 'Solo con QR o código', hint: 'No apareces en la lista: entran quienes escanean o escriben tu código.' },
          { value: true, label: 'También en la lista de Vaiinilla', hint: 'Cualquiera te encuentra al buscar lugares en la app.' },
        ]}
      />
      {storeUrl && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-cream p-4">
          {qr && <img src={qr} alt="Código QR de la tienda" width="112" height="112" className="size-28 rounded-xl" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted">QR de la tienda</p>
            <p className="mt-1 text-sm leading-5 text-ink">Ponlo en la entrada o el mostrador: abre tu menú para pedir.</p>
            <p className="mt-1 break-all text-xs leading-5 text-muted">{storeUrl}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2">
            {qr && (
              <a className="button button--ghost" href={qr} download="qr-tienda.png">
                <Download aria-hidden="true" className="size-4" />
                Descargar QR
              </a>
            )}
            <Button type="button" variant="secondary" onClick={() => void copy()}>
              <Copy aria-hidden="true" className="size-4" />
              {copied ? 'Copiado' : 'Copiar enlace'}
            </Button>
            {canWriteNfc() && (
              <Button type="button" variant="ghost" onClick={() => void writeTag()} disabled={nfc === 'waiting'}>
                <Nfc aria-hidden="true" className="size-4" />
                {nfc === 'waiting' ? 'Acerca la etiqueta…' : nfc === 'done' ? 'Grabada' : nfc === 'error' ? 'No se grabó, reintenta' : 'Grabar en NFC'}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
