import type { Lineup, Player } from './db';
import { slotsFor } from './formations';

/**
 * Opens the phone's share sheet for a file (Messages, WhatsApp, Files, email…), or downloads it where sharing
 * files isn't supported. Returns false if the user closed the share sheet.
 */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      // Anything else (e.g. the browser refusing after a slow async step) falls back to a download.
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

/** File-name friendly version of a name, e.g. "Sat v Rovers" -> "sat-v-rovers". */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'line-up';

const W = 1080;
const PITCH = { x: 60, y: 200, w: 960, h: 1180 };
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const lastName = (p: Player) => {
  const parts = p.name.trim().split(/\s+/);
  return parts[parts.length - 1];
};

/** Draws the line-up on a pitch as a PNG to send to the team. */
export async function lineupImage(lineup: Lineup, players: Player[], teamName: string, title: string): Promise<Blob> {
  const byId = new Map(players.map((p) => [p.id, p]));
  const bench = lineup.bench.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  const benchLines = bench.length ? Math.ceil(bench.length / 3) : 0;
  const H = PITCH.y + PITCH.h + (benchLines ? 110 + benchLines * 52 : 60);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Header
  ctx.fillStyle = '#14532d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText(fit(ctx, teamName, W - 120), 60, 100);
  ctx.font = `500 38px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(fit(ctx, `${title} · ${lineup.formation}`, W - 120), 60, 155);

  // Pitch with stripes and markings
  const { x, y, w, h } = PITCH;
  roundRect(ctx, x, y, w, h, 28);
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? '#2a7340' : '#2f7d45';
    ctx.fillRect(x, y + (h / 10) * i, w, h / 10);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, w * 0.13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(x + w * 0.22, y - 5, w * 0.56, h * 0.14);
  ctx.strokeRect(x + w * 0.22, y + h * 0.86 + 5, w * 0.56, h * 0.14);
  ctx.restore();
  roundRect(ctx, x, y, w, h, 28);
  ctx.stroke();

  // Players
  slotsFor(lineup.formation).forEach((s, i) => {
    const p = lineup.slots[i] ? byId.get(lineup.slots[i]!) : undefined;
    const cx = x + (w * s.x) / 100;
    const cy = y + h - (h * s.y) / 100 - 20;
    ctx.beginPath();
    ctx.arc(cx, cy, 48, 0, Math.PI * 2);
    ctx.fillStyle = p ? '#ffffff' : 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p ? '#13201a' : '#ffffff';
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(p ? String(p.number ?? '') || '•' : '?', cx, cy + 2);
    if (p && p.id === lineup.captainId) {
      ctx.beginPath();
      ctx.arc(cx + 38, cy - 38, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = `800 24px ${FONT}`;
      ctx.fillText('C', cx + 38, cy - 37);
    }
    const label = p ? lastName(p) : s.label;
    ctx.font = `700 30px ${FONT}`;
    const text = fit(ctx, label, 200);
    const tw = ctx.measureText(text).width + 28;
    roundRect(ctx, cx - tw / 2, cy + 58, tw, 44, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, cy + 81);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });

  // Bench
  if (bench.length) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 36px ${FONT}`;
    ctx.fillText('Subs', 60, PITCH.y + PITCH.h + 70);
    ctx.font = `500 32px ${FONT}`;
    bench.forEach((p, i) => {
      const col = i % 3;
      const line = Math.floor(i / 3);
      const text = `${p.number != null ? `${p.number} ` : ''}${p.name}`;
      ctx.fillText(fit(ctx, text, 300), 60 + col * 330, PITCH.y + PITCH.h + 125 + line * 52);
    });
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'),
  );
}

/** Shortens text with an ellipsis to fit a width. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
