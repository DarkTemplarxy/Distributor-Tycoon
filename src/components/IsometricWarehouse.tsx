// ============================================================================
// Top-down isometric warehouse scene, drawn procedurally on a 2D canvas.
// No external assets: floor, walls, shelves, pallets, worker figures and the
// truck are all shapes. It reads the live game state each animation frame and
// animates workers (walking shelf <-> prep table) and the Monday truck run.
// ============================================================================

import { useEffect, useRef } from 'react';
import { useGame } from '../state/GameProvider';
import { inventoryTotal } from '../game/simulation';
import { PALETTE_SIZE } from '../game/constants';
import { dayName, formatClock, hourOf } from '../game/util';
import type { GameState, ProductId } from '../game/types';

// --- Palette (hex, tuned for the dark app background) -----------------------
const PROD_HEX: Record<ProductId, string> = {
  fisch: '#4da3ff',
  fleisch: '#f26d6d',
  gemuese: '#5fce8a',
};
const C = {
  skyTop: '#12303a',
  skyBottom: '#0c1a1f',
  grass: '#3f7a52',
  grassEdge: '#356646',
  road: '#40474e',
  roadLine: '#c7cf6a',
  floor: '#cbc6ba',
  floorAlt: '#c2bdb0',
  wallTop: '#7a4b45',
  wallFace: '#5f3a35',
  rack: '#b07a3f',
  table: '#8a8f98',
  shirtA: '#3f7fd0',
  shirtB: '#e08a3c',
  skin: '#e8b98f',
  hat: '#f5c542',
  truckCab: '#3f6aa0',
  truckCargo: '#e2e7ec',
  label: 'rgba(255,255,255,0.5)',
};

// --- Isometric constants & layout -------------------------------------------
const TILE_W = 64;
const TILE_H = 32;
const ELEV = 30; // pixels per elevation unit
const GRID_W = 9; // gx 0..8
const GRID_D = 6; // gy 0..5

// 12 shelf cells: 2 rows x 6 cols.
const SHELF_CELLS: { gx: number; gy: number }[] = [];
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 6; col++) {
    SHELF_CELLS.push({ gx: 2 + col, gy: 1 + row });
  }
}
const TABLES = [
  { gx: 2, gy: 4 },
  { gx: 3.3, gy: 4 },
];
const RAMP_SPOTS = [
  { gx: 5, gy: 4 },
  { gx: 6, gy: 4 },
  { gx: 7, gy: 4 },
  { gx: 5, gy: 5 },
  { gx: 6, gy: 5 },
  { gx: 7, gy: 5 },
];
const idleSpot = (i: number) => ({ gx: 1.5 + i * 1.1, gy: 3.3 });
const tableWorkSpot = (i: number) => ({ gx: TABLES[i % TABLES.length].gx, gy: TABLES[i % TABLES.length].gy + 0.75 });
const shelfFetchSpot = (i: number) => ({ gx: 2.5 + i * 1.4, gy: 2.9 });

const WALK_SPEED = 1.8; // tiles / second

interface WorkerAnim {
  gx: number;
  gy: number;
  wp: number;
  wait: number;
  bob: number;
  moving: boolean;
  carrying: boolean;
}
interface Anim {
  workers: Record<string, WorkerAnim>;
  truckP: number; // 0 = off-scene, 1 = docked
}

function truckPhase(state: GameState): 'away' | 'here' | 'leaving' {
  if (state.truckAnimUntil > state.totalDays) return 'leaving';
  // The truck comes by every day around 18:00.
  if (hourOf(state.totalDays) >= 16.5 && hourOf(state.totalDays) < 18) return 'here';
  return 'away';
}

interface ShelfPallet {
  productId: ProductId;
  qty: number;
  urgency: 'ok' | 'warn' | 'crit';
}
function shelfPallets(state: GameState): ShelfPallet[] {
  const out: ShelfPallet[] = [];
  for (const p of state.products) {
    const total = inventoryTotal(p);
    if (total <= 0) continue;
    const soonest = Math.min(...p.batches.map((b) => b.expiryDay));
    const ratio = Math.max(0, Math.min(1, (soonest - state.totalDays) / p.spoilageDays));
    const urgency = ratio < 0.15 ? 'crit' : ratio < 0.35 ? 'warn' : 'ok';
    let rem = total;
    while (rem > 0) {
      out.push({ productId: p.id, qty: Math.min(PALETTE_SIZE, rem), urgency });
      rem -= PALETTE_SIZE;
    }
  }
  return out;
}

// --- Color helpers ----------------------------------------------------------
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f));
  const b = Math.max(0, Math.min(255, (n & 255) * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function IsometricWarehouse() {
  const { state } = useGame();
  const stateRef = useRef(state);
  stateRef.current = state;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<Anim>({ workers: {}, truckP: 0 });
  const tickRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let cw = 0;
    let ch = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cw = wrap.clientWidth;
      ch = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(cw * dpr));
      canvas.height = Math.max(1, Math.floor(ch * dpr));
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      updateAnim(dt, stateRef.current, animRef.current);
      draw(ctx, stateRef.current, animRef.current, cw, ch);
    };
    tickRef.current = tick;

    const loop = () => {
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    tick(); // one immediate frame

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      tickRef.current = () => {};
    };
  }, []);

  // Also redraw on every React render (~11fps state pump) so the scene keeps
  // updating even where requestAnimationFrame is throttled/blocked.
  useEffect(() => {
    tickRef.current();
  });

  return (
    <div className="scene-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// --- Animation update -------------------------------------------------------
function moveToward(a: WorkerAnim, tx: number, ty: number, maxd: number): boolean {
  const dx = tx - a.gx;
  const dy = ty - a.gy;
  const d = Math.hypot(dx, dy);
  if (d <= maxd || d < 1e-4) {
    a.gx = tx;
    a.gy = ty;
    a.moving = false;
    return true;
  }
  a.gx += (dx / d) * maxd;
  a.gy += (dy / d) * maxd;
  a.moving = true;
  return false;
}

function updateAnim(dt: number, state: GameState, anim: Anim) {
  const workers = state.employees.filter((e) => e.role === 'lager');
  const seen = new Set<string>();
  workers.forEach((e, i) => {
    seen.add(e.id);
    let a = anim.workers[e.id];
    if (!a) {
      const s = idleSpot(i);
      a = { gx: s.gx, gy: s.gy, wp: 0, wait: 0, bob: Math.random() * 6, moving: false, carrying: false };
      anim.workers[e.id] = a;
    }
    const busy = !!e.task;
    const targets = busy ? [shelfFetchSpot(i), tableWorkSpot(i)] : [idleSpot(i)];
    const tgt = targets[a.wp % targets.length];
    const arrived = moveToward(a, tgt.gx, tgt.gy, WALK_SPEED * dt);
    a.carrying = busy && targets.length > 1 && a.wp % 2 === 1;
    if (arrived) {
      a.wait += dt;
      if (a.wait > (busy ? 0.45 : 1.4)) {
        a.wait = 0;
        a.wp = (a.wp + 1) % targets.length;
      }
    }
    a.bob += dt * (a.moving ? 9 : 2.2);
  });
  // Drop anims for workers that no longer exist.
  for (const id of Object.keys(anim.workers)) if (!seen.has(id)) delete anim.workers[id];

  const phase = truckPhase(state);
  const target = phase === 'here' ? 1 : 0;
  const speed = 0.7 * dt;
  if (anim.truckP < target) anim.truckP = Math.min(target, anim.truckP + speed);
  else if (anim.truckP > target) anim.truckP = Math.max(target, anim.truckP - speed);
}

// --- Drawing ----------------------------------------------------------------
interface View {
  ox: number;
  oy: number;
  s: number;
}
function iso(v: View, gx: number, gy: number, gz = 0): [number, number] {
  return [
    v.ox + (gx - gy) * (TILE_W / 2) * v.s,
    v.oy + (gx + gy) * (TILE_H / 2) * v.s - gz * ELEV * v.s,
  ];
}

function quad(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string, stroke = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function tile(ctx: CanvasRenderingContext2D, v: View, gx: number, gy: number, fill: string, stroke = false) {
  quad(
    ctx,
    [iso(v, gx, gy), iso(v, gx + 1, gy), iso(v, gx + 1, gy + 1), iso(v, gx, gy + 1)],
    fill,
    stroke,
  );
}

/** Draw an axis-aligned iso box; returns nothing. base drives face shades. */
function box(
  ctx: CanvasRenderingContext2D,
  v: View,
  gx: number,
  gy: number,
  wx: number,
  wy: number,
  h: number,
  base: string,
  faces?: { top: string; left: string; right: string },
) {
  const top = faces?.top ?? shade(base, 1.12);
  const right = faces?.right ?? shade(base, 0.86);
  const left = faces?.left ?? shade(base, 0.66);
  const A = iso(v, gx, gy, h);
  const B = iso(v, gx + wx, gy, h);
  const Cc = iso(v, gx + wx, gy + wy, h);
  const D = iso(v, gx, gy + wy, h);
  const B0 = iso(v, gx + wx, gy, 0);
  const C0 = iso(v, gx + wx, gy + wy, 0);
  const D0 = iso(v, gx, gy + wy, 0);
  // right face (+gx side), left face (+gy side), then top
  quad(ctx, [B, Cc, C0, B0], right);
  quad(ctx, [D, Cc, C0, D0], left);
  quad(ctx, [A, B, Cc, D], top);
}

function worker(ctx: CanvasRenderingContext2D, v: View, a: WorkerAnim, shirt: string, progress: number | null) {
  const [sx, sy] = iso(v, a.gx, a.gy, 0);
  const s = v.s;
  const bob = a.moving ? Math.abs(Math.sin(a.bob)) * 2.2 * s : Math.sin(a.bob) * 0.8 * s;
  // shadow
  ctx.beginPath();
  ctx.ellipse(sx, sy, 9 * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  const baseY = sy - bob;
  // body
  ctx.fillStyle = shirt;
  roundRect(ctx, sx - 5 * s, baseY - 20 * s, 10 * s, 15 * s, 3 * s);
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(sx, baseY - 24 * s, 4.6 * s, 0, Math.PI * 2);
  ctx.fillStyle = C.skin;
  ctx.fill();
  // hard hat
  ctx.beginPath();
  ctx.arc(sx, baseY - 26 * s, 5 * s, Math.PI, 0);
  ctx.fillStyle = C.hat;
  ctx.fill();
  // carried box
  if (a.carrying) {
    ctx.fillStyle = '#c79a5b';
    roundRect(ctx, sx - 4 * s, baseY - 16 * s, 8 * s, 7 * s, 1.5 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.stroke();
  }
  // progress bar
  if (progress !== null) {
    const bw = 16 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, sx - bw / 2, baseY - 34 * s, bw, 3.5 * s, 1.5 * s);
    ctx.fill();
    ctx.fillStyle = '#4da3ff';
    roundRect(ctx, sx - bw / 2, baseY - 34 * s, bw * Math.max(0, Math.min(1, progress)), 3.5 * s, 1.5 * s);
    ctx.fill();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, v: View, gx: number, gy: number, text: string) {
  const [sx, sy] = iso(v, gx, gy, 0);
  ctx.font = `${Math.round(10 * v.s + 3)}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = C.label;
  ctx.fillText(text, sx, sy);
}

function draw(ctx: CanvasRenderingContext2D, state: GameState, anim: Anim, cw: number, ch: number) {
  if (cw === 0 || ch === 0) return;

  // Sky/backdrop
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, C.skyTop);
  g.addColorStop(1, C.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);

  // Fit the scene.
  const spanW = (GRID_W + GRID_D) * (TILE_W / 2);
  const spanH = (GRID_W + GRID_D) * (TILE_H / 2) + ELEV * 1.5 + 90;
  const s = Math.max(0.4, Math.min(1.5, Math.min((cw - 40) / spanW, (ch - 40) / spanH)));
  const cx = GRID_W / 2;
  const cy = GRID_D / 2;
  const v: View = {
    ox: cw / 2 - (cx - cy) * (TILE_W / 2) * s,
    oy: ch * 0.46 - (cx + cy) * (TILE_H / 2) * s,
    s,
  };

  // Grass plot (a big diamond under the building).
  quad(
    ctx,
    [iso(v, -2.5, -2.5), iso(v, GRID_W + 2, -2.5), iso(v, GRID_W + 2, GRID_D + 4), iso(v, -2.5, GRID_D + 4)],
    C.grass,
    false,
  );

  // Road out to the dock.
  quad(
    ctx,
    [iso(v, 5.4, GRID_D), iso(v, 6.9, GRID_D), iso(v, 6.9, GRID_D + 4), iso(v, 5.4, GRID_D + 4)],
    C.road,
    false,
  );

  // Warehouse floor.
  for (let gx = 0; gx < GRID_W; gx++) {
    for (let gy = 0; gy < GRID_D; gy++) {
      tile(ctx, v, gx, gy, (gx + gy) % 2 === 0 ? C.floor : C.floorAlt, true);
    }
  }

  // Zone labels (drawn on the floor).
  label(ctx, v, 4.5, 0.4, 'LAGER');
  label(ctx, v, 2.6, 4.5, 'HERRICHTUNG');
  label(ctx, v, 6, 4.6, 'RAMPE');

  // Back walls (far edges) — drawn before objects.
  box(ctx, v, 0, 0, GRID_W, 0.14, 1.15, C.wallFace, { top: C.wallTop, left: shade(C.wallFace, 0.8), right: shade(C.wallFace, 0.95) });
  box(ctx, v, 0, 0, 0.14, GRID_D, 1.15, C.wallFace, { top: C.wallTop, left: shade(C.wallFace, 0.7), right: shade(C.wallFace, 0.9) });

  // Build a depth-sorted draw list of everything on the floor.
  type Item = { depth: number; z: number; draw: () => void };
  const items: Item[] = [];

  // Shelf racks + pallets on them.
  const pallets = shelfPallets(state);
  SHELF_CELLS.forEach((cell, idx) => {
    const occupied = pallets[idx];
    items.push({
      depth: cell.gx + cell.gy,
      z: 0,
      draw: () => {
        box(ctx, v, cell.gx + 0.12, cell.gy + 0.12, 0.76, 0.76, 0.16, C.rack);
        if (occupied) {
          const col = PROD_HEX[occupied.productId];
          const top =
            occupied.urgency === 'crit' ? shade(col, 1.0) : occupied.urgency === 'warn' ? shade(col, 1.05) : shade(col, 1.15);
          box(ctx, v, cell.gx + 0.2, cell.gy + 0.2, 0.6, 0.6, 0.5, col, {
            top,
            left: shade(col, 0.62),
            right: shade(col, 0.84),
          });
          if (occupied.urgency !== 'ok') {
            const [mx, my] = iso(v, cell.gx + 0.5, cell.gy + 0.5, 0.5);
            ctx.fillStyle = occupied.urgency === 'crit' ? '#ff5a5a' : '#ffcf4d';
            ctx.font = `${Math.round(9 * v.s + 2)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('!', mx, my - 2 * v.s);
          }
        }
      },
    });
  });

  // Prep tables.
  TABLES.forEach((t) => {
    items.push({
      depth: t.gx + t.gy,
      z: 0,
      draw: () => box(ctx, v, t.gx + 0.1, t.gy + 0.1, 0.8, 0.8, 0.38, C.table),
    });
  });

  // Ready pallets on the ramp.
  const ready = state.palettes.filter((p) => p.status === 'ready');
  ready.slice(0, RAMP_SPOTS.length).forEach((p, k) => {
    const spot = RAMP_SPOTS[k];
    const col = PROD_HEX[p.productId] ?? '#8a8f98';
    items.push({
      depth: spot.gx + spot.gy,
      z: 0,
      draw: () => box(ctx, v, spot.gx + 0.2, spot.gy + 0.2, 0.6, 0.6, 0.45, col, { top: shade(col, 1.15), left: shade(col, 0.62), right: shade(col, 0.84) }),
    });
  });

  // Workers.
  const lager = state.employees.filter((e) => e.role === 'lager');
  lager.forEach((e, i) => {
    const a = anim.workers[e.id];
    if (!a) return;
    const shirt = i % 2 === 0 ? C.shirtA : C.shirtB;
    const progress = e.task ? 1 - e.task.remainingDays / e.task.totalDays : null;
    items.push({ depth: a.gx + a.gy, z: 1, draw: () => worker(ctx, v, a, shirt, progress) });
  });

  // Truck (drives along the road to the dock).
  const tp = anim.truckP;
  if (tp > 0.001) {
    const gy = 5.3 + (1 - tp) * 4.2; // docked at 5.3, off-scene at ~9.5
    const gx = 5.6;
    items.push({
      depth: gx + gy + 6, // keep truck in front
      z: 2,
      draw: () => {
        box(ctx, v, gx, gy, 1.2, 0.8, 0.62, C.truckCargo, { top: shade(C.truckCargo, 1.05), left: shade(C.truckCargo, 0.7), right: shade(C.truckCargo, 0.85) });
        box(ctx, v, gx + 0.05, gy + 0.85, 1.1, 0.55, 0.5, C.truckCab);
        // wheels
        ctx.fillStyle = '#1b1f24';
        for (const wp of [
          [gx + 0.15, gy + 0.05],
          [gx + 1.05, gy + 0.05],
          [gx + 0.15, gy + 0.75],
          [gx + 1.05, gy + 0.75],
        ]) {
          const [wx, wy] = iso(v, wp[0], wp[1], 0.05);
          ctx.beginPath();
          ctx.ellipse(wx, wy, 3.5 * v.s, 2 * v.s, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  }

  items.sort((a, b) => a.depth - b.depth || a.z - b.z);
  items.forEach((it) => it.draw());

  // HUD overlay.
  const usedSlots = pallets.length;
  const hud = `🏭 Lager  ·  Belegt ${usedSlots}/${state.warehouse.paletteSlotsTotal}  ·  Fertig ${ready.length}  ·  ${dayName(state.totalDays)} ${formatClock(state.totalDays)}`;
  ctx.font = `600 ${Math.round(12)}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'left';
  const pad = 10;
  const w = ctx.measureText(hud).width + pad * 2;
  ctx.fillStyle = 'rgba(10,16,22,0.62)';
  roundRect(ctx, 10, 10, w, 26, 7);
  ctx.fill();
  ctx.fillStyle = '#e6edf3';
  ctx.fillText(hud, 10 + pad, 27);

  const phase = truckPhase(state);
  const note =
    phase === 'here' ? '🚚 Laster wartet…' : phase === 'leaving' ? '🚚 Laster fährt ab' : 'Abholung: täglich 18:00';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(230,237,243,0.85)';
  ctx.fillText(note, cw - 14, 27);
}
