import { BUSINESS_WHATSAPP } from './config';
import type { Payment } from './types';
import { normalizePhone, parseCoords } from './lib';

/** Datos que se pueden sacar de un ticket o de un mensaje de WhatsApp. */
export interface Parsed {
  ticket?: string;
  customer_name?: string;
  customer_phone?: string;
  address?: string;
  maps_url?: string;
  dest?: { lat: number; lng: number };
  payment?: Payment;
  amount?: number;
  pay_with?: number;
}

const num = (s: string) => {
  // "24,00" · "1.024,50" · "24.00"
  const t = s.trim();
  const n = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
};

/**
 * Lee el texto pegado (o leído de la foto del ticket) y saca lo que encuentre.
 * Ejemplos que entiende:
 *   RECIBO#12086 · Total: S/. 24,00 · Efectivo: S/. 24,00
 *   Pagar con Yape · Ubicación: https://maps.app.goo.gl/... · WhatsApp 987 654 321
 */
export function parseText(raw: string): Parsed {
  const text = raw.replace(/\r/g, '');
  const out: Parsed = {};

  // N° de ticket / recibo
  const tk = text.match(/RECIB[O0]\s*[#*N°º:.]*\s*(\d{2,})/i)
    ?? text.match(/(?:ticket|pedido|orden|n[°º]|nro\.?|numero|número)\s*[#:.]*\s*(\d{2,})/i)
    ?? text.match(/#\s*(\d{3,})/);
  if (tk) out.ticket = tk[1];

  // Enlace de ubicación (Google Maps, WhatsApp, Waze)
  const url = text.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|waze\.com)\S*/i);
  if (url) out.maps_url = url[0].replace(/[).,;]+$/, '');
  const c = parseCoords(out.maps_url ?? '') ?? (text.match(/-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/) ? parseCoords(text.match(/-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/)![0]) : null);
  if (c) out.dest = c;

  // Celular del cliente: 9 dígitos que empiezan con 9 (con o sin +51), que no sea el del negocio.
  const own = BUSINESS_WHATSAPP ? normalizePhone(BUSINESS_WHATSAPP) : '';
  const phones = [...text.matchAll(/(?:\+?51[\s-]*)?(9\d{2})[\s-]*(\d{3})[\s-]*(\d{3})(?!\d)/g)]
    .filter((m) => !/\d/.test(text[(m.index ?? 0) - 1] ?? ''))
    .map((m) => m[1] + m[2] + m[3])
    .filter((p) => normalizePhone(p) !== own);
  if (phones.length) out.customer_phone = phones[phones.length - 1];

  // Total
  const tot = text.match(/total\s*(?:a\s*pagar)?\s*[:=]?\s*S\s*\/?\s*\.?\s*([\d.,]+\d)/i);
  if (tot) out.amount = num(tot[1]);

  // Forma de pago: primero lo que diga "pagar/paga con …", si no, la palabra que aparezca.
  const low = text.toLowerCase();
  const said = low.match(/pag(?:a|ar|ará|ara|o|ó)\s+con\s+([a-záéíóú]+)/);
  const pick = (w: string): Payment | undefined =>
    /yape/.test(w) ? 'yape' : /plin/.test(w) ? 'plin' : /tarjeta|pos|visa|master|pos\b/.test(w) ? 'tarjeta'
      : /efectivo|cash|sencillo/.test(w) ? 'efectivo' : /pagad|ya\s*pag|transfer/.test(w) ? 'pagado' : undefined;
  out.payment = (said && pick(said[1])) || (/ya\s*pag[oó]|pagado|cancelado/.test(low) ? 'pagado'
    : /yape/.test(low) ? 'yape' : /plin/.test(low) ? 'plin' : /tarjeta|\bpos\b|visa/.test(low) ? 'tarjeta'
    : /efectivo/.test(low) ? 'efectivo' : undefined);

  // "paga con 50" / "billete de 100" / "vuelto de 50" → con cuánto paga en efectivo
  const pw = low.match(/(?:paga(?:r|rá)?\s+con|billete\s+de|vuelto\s+(?:de|para))\s*s?\/?\.?\s*(\d+(?:[.,]\d{1,2})?)/);
  if (pw) { out.pay_with = num(pw[1]); if (!out.payment) out.payment = 'efectivo'; }
  if (out.pay_with && out.amount && out.pay_with <= out.amount) delete out.pay_with;

  // Nombre y dirección si vienen rotulados
  const name = text.match(/(?:nombre|cliente)\s*[:\-]\s*(.+)/i);
  if (name) out.customer_name = name[1].trim().slice(0, 80);
  const addr = text.match(/(?:direcci[oó]n|ubicaci[oó]n|dir\.?)\s*[:\-]\s*(.+)/i);
  if (addr) {
    const a = addr[1].replace(/https?:\/\/\S+/g, '').trim();
    if (a.length > 3) out.address = a.slice(0, 200);
  }
  return out;
}

/** Lee el texto de una foto/captura del ticket (la primera vez descarga el diccionario, ~2 MB). */
export async function readImage(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int',
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
  });
  try {
    const { data } = await worker.recognize(await prepare(file));
    return data.text;
  } finally {
    void worker.terminate();
  }
}

/** Agranda y pasa a gris la imagen para que se lea mejor. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(3, Math.max(1, 1600 / bmp.width));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  const ctx = cv.getContext('2d')!;
  ctx.filter = 'grayscale(1) contrast(1.3)';
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv;
}
