// ============================================================================
// Top-down isometric warehouse scene, drawn procedurally on a 2D canvas from the
// live warehouse STATE (tiles, shelves, tables, inbound/pickup zones). No external
// assets. Supports a build mode: valid tiles are highlighted and clicks are mapped
// back to grid coordinates (inverse isometric projection).
// ============================================================================

import { useEffect, useRef } from 'react';
import { useGame } from '../state/GameProvider';
import { inboundStock, shelfStock, shelfCapacity, shelfUsed, inboundUsed, inboundCapacity } from '../game/simulation';
import { PALETTE_SIZE, SHELF_SLOTS, WORK_END_HOUR, WORK_START_HOUR } from '../game/constants';
import { dayName, formatClock, hourOf } from '../game/util';
import type { GameState, ProductId } from '../game/types';

export type BuildTool = 'shelf' | 'table' | 'inbound' | 'expand' | 'desk' | 'officeExpand';
export interface BuildProps {
  tool: BuildTool | null;
  /** Place a single-tile object (shelf/table/inbound) at a grid tile. */
  onPlaceTile: (gx: number, gy: number) => void;
  /** Expand the hall by a 2×2 block (its 4 tiles). */
  onExpand: (block: { gx: number; gy: number }[]) => void;
}

// --- Palette ---------------------------------------------------------------
const PROD_HEX: Record<ProductId, string> = {
  fisch: '#4da3ff',
  fleisch: '#f26d6d',
  gemuese: '#5fce8a',
};
const C = {
  skyTop: '#12303a',
  skyBottom: '#0c1a1f',
  grass: '#3f7a52',
  road: '#40474e',
  floor: '#cbc6ba',
  floorAlt: '#c2bdb0',
  rampFloor: '#b9b3a2',
  rampFloorAlt: '#b1ab9a',
  wallTop: '#7a4b45',
  wallFace: '#5f3a35',
  rack: '#b07a3f',
  table: '#8a8f98',
  inbound: '#c79a5b',
  shirtA: '#3f7fd0',
  shirtB: '#e08a3c',
  skin: '#e8b98f',
  hat: '#f5c542',
  truckCab: '#3f6aa0',
  truckCargo: '#e2e7ec',
  label: 'rgba(255,255,255,0.5)',
  officeFloor: '#39485c',
  officeWall: '#47576b',
  desk: '#9c8f79',
  monitor: '#1c222b',
  screen: '#63d0ff',
  buildOk: 'rgba(90,210,120,0.42)',
  buildOkEdge: 'rgba(120,240,150,0.9)',
  buildHover: 'rgba(120,240,150,0.7)',
};

const OFFICE_SHIRT: Record<string, string> = {
  einkaeufer: '#3fb3a2',
  kam: '#b077e2',
  admin: '#7f8fa6',
};

// --- Isometric constants ---------------------------------------------------
const TILE_W = 60;
const TILE_H = 30;
const ELEV = 28;
const WALK_SPEED = 1.8;

interface WorkerAnim {
  gx: number;
  gy: number;
  bob: number;
  moving: boolean;
  carrying: boolean;
}
interface Anim {
  workers: Record<string, WorkerAnim>;
  truckP: number;
}

function truckPhase(state: GameState): 'away' | 'here' | 'leaving' {
  if (state.truckAnimUntil > state.totalDays) return 'leaving';
  if (hourOf(state.totalDays) >= 16.5 && hourOf(state.totalDays) < 18) return 'here';
  return 'away';
}

// --- Warehouse layout derived from state -----------------------------------
/** Bounds over the HALL tiles (storage + ramp, i.e. everything except the
 * office), used for walls, zone labels and worker positioning. */
function hallBounds(state: GameState) {
  const t = state.warehouse.tiles.filter((x) => x.zone !== 'office');
  const gxs = t.map((x) => x.gx);
  const gys = t.map((x) => x.gy);
  return {
    minGx: Math.min(...gxs),
    maxGx: Math.max(...gxs),
    minGy: Math.min(...gys),
    maxGy: Math.max(...gys),
  };
}
/** Bounds over the OFFICE tiles (empty-safe: returns null if none). */
function officeBounds(state: GameState) {
  const t = state.warehouse.tiles.filter((x) => x.zone === 'office');
  if (t.length === 0) return null;
  const gxs = t.map((x) => x.gx);
  const gys = t.map((x) => x.gy);
  return {
    minGx: Math.min(...gxs),
    maxGx: Math.max(...gxs),
    minGy: Math.min(...gys),
    maxGy: Math.max(...gys),
  };
}
function tileAt(state: GameState, gx: number, gy: number) {
  return state.warehouse.tiles.find((t) => t.gx === gx && t.gy === gy);
}
function shelfAt(state: GameState, gx: number, gy: number) {
  return state.warehouse.shelves.find((s) => s.gx === gx && s.gy === gy);
}
function tableAt(state: GameState, gx: number, gy: number) {
  return state.warehouse.tables.find((s) => s.gx === gx && s.gy === gy);
}
function deskAt(state: GameState, gx: number, gy: number) {
  return state.warehouse.desks.find((d) => d.gx === gx && d.gy === gy);
}
/** Ramp tiles, front row (nearest storage) first, sorted left→right. */
function rampTiles(state: GameState) {
  return state.warehouse.tiles
    .filter((t) => t.zone === 'ramp')
    .slice()
    .sort((a, b) => a.gy - b.gy || a.gx - b.gx);
}
/** Inbound (Wareneingang) pallet positions — first inboundSlots ramp tiles. */
function inboundPositions(state: GameState) {
  return rampTiles(state).slice(0, state.warehouse.inboundSlots);
}
/** Pickup (Abhol) positions — ramp tiles from the dock side. */
function pickupPositions(state: GameState) {
  const used = new Set(inboundPositions(state).map((t) => `${t.gx},${t.gy}`));
  return rampTiles(state)
    .filter((t) => !used.has(`${t.gx},${t.gy}`))
    .slice()
    .sort((a, b) => b.gy - a.gy || b.gx - a.gx)
    .slice(0, state.warehouse.abholzone);
}

interface ShelfPallet {
  productId: ProductId;
  qty: number;
  urgency: 'ok' | 'warn' | 'crit';
}
function chunkStock(state: GameState, which: 'shelf' | 'inbound'): ShelfPallet[] {
  const out: ShelfPallet[] = [];
  for (const p of state.products) {
    const total = which === 'shelf' ? shelfStock(p) : inboundStock(p);
    if (total <= 0) continue;
    const relevant = p.batches.filter((b) => b.location === which);
    const soonest = relevant.length ? Math.min(...relevant.map((b) => b.expiryDay)) : Infinity;
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

/** 2×2 expansion blocks adjacent to the hall on the right (+gx) and back (−gy). */
function expansionBlocks(state: GameState): { gx: number; gy: number }[][] {
  const b = hallBounds(state);
  const has = (gx: number, gy: number) => !!tileAt(state, gx, gy);
  const blocks: { gx: number; gy: number }[][] = [];
  const align = (v: number, base: number) => base + Math.floor((v - base) / 2) * 2;
  // Right edge: one column of 2×2 blocks just past maxGx.
  const gx0 = b.maxGx + 1;
  for (let gy = align(b.minGy, b.minGy); gy <= b.maxGy; gy += 2) {
    if (has(gx0, gy) || has(gx0, gy + 1)) continue;
    // only where it touches the existing hall
    if (has(gx0 - 1, gy) || has(gx0 - 1, gy + 1)) {
      blocks.push([
        { gx: gx0, gy },
        { gx: gx0 + 1, gy },
        { gx: gx0, gy: gy + 1 },
        { gx: gx0 + 1, gy: gy + 1 },
      ]);
    }
  }
  // Back edge: one row of 2×2 blocks just before minGy.
  const gy0 = b.minGy - 2;
  for (let gx = align(b.minGx, b.minGx); gx <= b.maxGx; gx += 2) {
    if (has(gx, gy0) || has(gx + 1, gy0)) continue;
    if (has(gx, gy0 + 2) || has(gx + 1, gy0 + 2)) {
      blocks.push([
        { gx, gy: gy0 },
        { gx: gx + 1, gy: gy0 },
        { gx, gy: gy0 + 1 },
        { gx: gx + 1, gy: gy0 + 1 },
      ]);
    }
  }
  return blocks;
}

/** 2×2 office-expansion blocks adjacent to the office on the LEFT (−gx) and
 * back (−gy), so the office grows away from the hall. */
function officeExpansionBlocks(state: GameState): { gx: number; gy: number }[][] {
  const b = officeBounds(state);
  if (!b) return [];
  const has = (gx: number, gy: number) => !!tileAt(state, gx, gy);
  const blocks: { gx: number; gy: number }[][] = [];
  const align = (v: number, base: number) => base + Math.floor((v - base) / 2) * 2;
  // Left edge: one column of 2×2 blocks just before minGx.
  const gx0 = b.minGx - 2;
  for (let gy = align(b.minGy, b.minGy); gy <= b.maxGy; gy += 2) {
    if (has(gx0, gy) || has(gx0 + 1, gy)) continue;
    if (has(gx0 + 2, gy) || has(gx0 + 2, gy + 1)) {
      blocks.push([
        { gx: gx0, gy },
        { gx: gx0 + 1, gy },
        { gx: gx0, gy: gy + 1 },
        { gx: gx0 + 1, gy: gy + 1 },
      ]);
    }
  }
  // Back edge: one row of 2×2 blocks just before minGy.
  const gy0 = b.minGy - 2;
  for (let gx = align(b.minGx, b.minGx); gx <= b.maxGx; gx += 2) {
    if (has(gx, gy0) || has(gx + 1, gy0)) continue;
    if (has(gx, gy0 + 2) || has(gx + 1, gy0 + 2)) {
      blocks.push([
        { gx, gy: gy0 },
        { gx: gx + 1, gy: gy0 },
        { gx, gy: gy0 + 1 },
        { gx: gx + 1, gy: gy0 + 1 },
      ]);
    }
  }
  return blocks;
}

/** Tiles that are valid targets for the current build tool. */
function validBuildTiles(state: GameState, tool: BuildTool): { gx: number; gy: number }[] {
  if (tool === 'expand' || tool === 'officeExpand') return []; // handled via blocks
  const out: { gx: number; gy: number }[] = [];
  const inbUsed = new Set([...inboundPositions(state), ...pickupPositions(state)].map((t) => `${t.gx},${t.gy}`));
  for (const t of state.warehouse.tiles) {
    if (tool === 'inbound') {
      if (t.zone === 'ramp' && !inbUsed.has(`${t.gx},${t.gy}`)) out.push(t);
    } else if (tool === 'desk') {
      // desk: empty office tile
      if (t.zone === 'office' && !deskAt(state, t.gx, t.gy)) out.push(t);
    } else {
      // shelf or table: empty storage tile
      if (t.zone === 'storage' && !shelfAt(state, t.gx, t.gy) && !tableAt(state, t.gx, t.gy)) out.push(t);
    }
  }
  return out;
}

// --- Color helpers ---------------------------------------------------------
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) * f));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) * f));
  const bl = Math.max(0, Math.min(255, (n & 255) * f));
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

export function IsometricWarehouse({ build }: { build?: BuildProps }) {
  const { state } = useGame();
  const stateRef = useRef(state);
  stateRef.current = state;
  const buildRef = useRef(build);
  buildRef.current = build;
  const viewRef = useRef<View>({ ox: 0, oy: 0, s: 1 });
  // Persistent camera (world-space center + scale). Unlike the old per-frame
  // auto-fit, the scale stays fixed after the initial fit, so building expansions
  // makes the map physically bigger; the player pans (right-drag) to navigate.
  const camRef = useRef<Camera>({ cx: 0, cy: 0, s: 1, init: false });
  const hoverRef = useRef<{ gx: number; gy: number } | null>(null);
  const recenter = () => {
    camRef.current.init = false; // next draw re-fits everything into view
  };

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
      draw(ctx, stateRef.current, animRef.current, cw, ch, camRef.current, viewRef.current, buildRef.current, hoverRef.current);
    };
    tickRef.current = tick;
    const loop = () => {
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    tick();

    // Pointer → grid tile (for build mode).
    const toTile = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = invIso(viewRef.current, ev.clientX - rect.left, ev.clientY - rect.top);
      return { gx: Math.floor(t.gx), gy: Math.floor(t.gy) };
    };
    // Right-button drag pans the camera (world-space center moves with the mouse).
    let panning = false;
    let panLastX = 0;
    let panLastY = 0;
    const onMove = (ev: PointerEvent) => {
      if (panning) {
        const cam = camRef.current;
        cam.cx -= (ev.clientX - panLastX) / cam.s;
        cam.cy -= (ev.clientY - panLastY) / cam.s;
        panLastX = ev.clientX;
        panLastY = ev.clientY;
        return;
      }
      if (!buildRef.current?.tool) {
        hoverRef.current = null;
        return;
      }
      hoverRef.current = toTile(ev);
    };
    const onDown = (ev: PointerEvent) => {
      if (ev.button === 2) {
        // Right button → start panning.
        panning = true;
        panLastX = ev.clientX;
        panLastY = ev.clientY;
        canvas.setPointerCapture(ev.pointerId);
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (ev.button !== 0) return; // only the left button places
      const b = buildRef.current;
      if (!b?.tool) return;
      const { gx, gy } = toTile(ev);
      if (b.tool === 'expand' || b.tool === 'officeExpand') {
        const blocks = b.tool === 'expand' ? expansionBlocks(stateRef.current) : officeExpansionBlocks(stateRef.current);
        const block = blocks.find((blk) => blk.some((c) => c.gx === gx && c.gy === gy));
        if (block) b.onExpand(block);
      } else {
        const ok = validBuildTiles(stateRef.current, b.tool).some((t) => t.gx === gx && t.gy === gy);
        if (ok) b.onPlaceTile(gx, gy);
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (panning && (ev.button === 2 || ev.button === -1)) {
        panning = false;
        try { canvas.releasePointerCapture(ev.pointerId); } catch {}
        canvas.style.cursor = '';
      }
    };
    const onContext = (ev: Event) => ev.preventDefault(); // no browser menu on right-click
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('contextmenu', onContext);
    const onLeave = () => (hoverRef.current = null);
    canvas.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('pointerleave', onLeave);
      tickRef.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    tickRef.current();
  });

  return (
    <div className="scene-wrap" ref={wrapRef} style={{ cursor: build?.tool ? 'pointer' : 'default' }}>
      <canvas ref={canvasRef} />
      <div className="scene-cam">
        <button className="btn small" onClick={recenter} title="Ansicht auf die ganze Anlage zentrieren">
          ⤢ Zentrieren
        </button>
        <span className="scene-cam-hint">Rechte Maustaste halten zum Verschieben</span>
      </div>
    </div>
  );
}

// --- Animation -------------------------------------------------------------
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
  const tables = state.warehouse.tables;
  const inbound = inboundPositions(state);
  const b = hallBounds(state);
  const aisleGy = (b.minGy + b.maxGy) / 2;
  const workers = state.employees.filter((e) => e.role === 'lager');
  const seen = new Set<string>();
  let prepIdx = 0;
  let putIdx = 0;
  let idleIdx = 0;

  workers.forEach((e) => {
    seen.add(e.id);
    let a = anim.workers[e.id];
    if (!a) {
      a = { gx: b.minGx + 1, gy: aisleGy, bob: Math.random() * 6, moving: false, carrying: false };
      anim.workers[e.id] = a;
    }
    let tgt: { gx: number; gy: number };
    let carrying = false;
    if (e.task?.kind === 'prep') {
      const t = tables[prepIdx % Math.max(1, tables.length)] ?? { gx: b.minGx + 2, gy: b.maxGy - 1 };
      tgt = { gx: t.gx + 0.1, gy: t.gy + 0.7 };
      carrying = true;
      prepIdx++;
    } else if (e.task?.kind === 'putaway') {
      const t = inbound[putIdx % Math.max(1, inbound.length)] ?? { gx: b.minGx, gy: b.maxGy };
      tgt = { gx: t.gx + 0.5, gy: t.gy - 0.4 };
      carrying = true;
      putIdx++;
    } else {
      tgt = { gx: b.minGx + 1.2 + (idleIdx % 3) * 1.0, gy: aisleGy + 0.2 };
      idleIdx++;
    }
    const arrived = moveToward(a, tgt.gx, tgt.gy, WALK_SPEED * dt);
    a.carrying = carrying && arrived;
    a.bob += dt * (a.moving ? 9 : 2.2);
  });
  for (const id of Object.keys(anim.workers)) if (!seen.has(id)) delete anim.workers[id];

  const phase = truckPhase(state);
  const target = phase === 'here' ? 1 : 0;
  const speed = 0.7 * dt;
  if (anim.truckP < target) anim.truckP = Math.min(target, anim.truckP + speed);
  else if (anim.truckP > target) anim.truckP = Math.max(target, anim.truckP - speed);
}

// --- Drawing ---------------------------------------------------------------
interface View {
  ox: number;
  oy: number;
  s: number;
}
/** Persistent camera: world-space center point + scale. */
interface Camera {
  cx: number;
  cy: number;
  s: number;
  init: boolean;
}
/** World-space (pre-offset) iso projection of a grid point at elevation 0. */
function worldXY(gx: number, gy: number): [number, number] {
  return [(gx - gy) * (TILE_W / 2), (gx + gy) * (TILE_H / 2)];
}
/** Bounds over ALL tiles (hall + ramp + office), used to fit the whole site. */
function allTileBounds(state: GameState) {
  const t = state.warehouse.tiles;
  const gxs = t.map((x) => x.gx);
  const gys = t.map((x) => x.gy);
  return { minGx: Math.min(...gxs), maxGx: Math.max(...gxs), minGy: Math.min(...gys), maxGy: Math.max(...gys) };
}
/** Fit the whole site into the viewport: returns the camera that centers it. */
function computeFit(state: GameState, cw: number, ch: number): { cx: number; cy: number; s: number } {
  const b = allTileBounds(state);
  const gxLo = b.minGx - 1;
  const gxHi = b.maxGx + 2;
  const gyLo = b.minGy - 1;
  const gyHi = b.maxGy + 4; // room for ramp + dock
  const corners: [number, number][] = [
    [gxLo, gyLo],
    [gxHi, gyLo],
    [gxHi, gyHi],
    [gxLo, gyHi],
  ];
  const xs = corners.map(([x, y]) => worldXY(x, y)[0]);
  const ys = corners.map(([x, y]) => worldXY(x, y)[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const contentW = maxX - minX;
  const contentH = maxY - minY + ELEV * 1.3;
  const s = Math.max(0.4, Math.min(1.4, Math.min((cw - 36) / contentW, (ch - 36) / contentH)));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 - ELEV * 0.5, s };
}
function iso(v: View, gx: number, gy: number, gz = 0): [number, number] {
  return [
    v.ox + (gx - gy) * (TILE_W / 2) * v.s,
    v.oy + (gx + gy) * (TILE_H / 2) * v.s - gz * ELEV * v.s,
  ];
}
/** Inverse of iso at elevation 0: screen → fractional grid coords. */
function invIso(v: View, sx: number, sy: number): { gx: number; gy: number } {
  const a = (sx - v.ox) / ((TILE_W / 2) * v.s); // gx - gy
  const b = (sy - v.oy) / ((TILE_H / 2) * v.s); // gx + gy
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
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
function tileQuad(ctx: CanvasRenderingContext2D, v: View, gx: number, gy: number, fill: string, stroke = false) {
  quad(ctx, [iso(v, gx, gy), iso(v, gx + 1, gy), iso(v, gx + 1, gy + 1), iso(v, gx, gy + 1)], fill, stroke);
}
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
  quad(ctx, [B, Cc, C0, B0], right);
  quad(ctx, [D, Cc, C0, D0], left);
  quad(ctx, [A, B, Cc, D], top);
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
function pallet(ctx: CanvasRenderingContext2D, v: View, gx: number, gy: number, size: number, col: string, urgency: 'ok' | 'warn' | 'crit') {
  const top = urgency === 'crit' ? shade(col, 1.0) : urgency === 'warn' ? shade(col, 1.05) : shade(col, 1.15);
  box(ctx, v, gx, gy, size, size, 0.42, col, { top, left: shade(col, 0.62), right: shade(col, 0.84) });
  if (urgency !== 'ok') {
    const [mx, my] = iso(v, gx + size / 2, gy + size / 2, 0.42);
    ctx.fillStyle = urgency === 'crit' ? '#ff5a5a' : '#ffcf4d';
    ctx.font = `${Math.round(9 * v.s + 2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', mx, my - 2 * v.s);
  }
}
/** A goods pallet drawn as a wooden base + a product-coloured crate (with an
 * urgency marker). Used at the Wareneingang and on the pickup ramp so both zones
 * clearly show real pallets. */
function crate(
  ctx: CanvasRenderingContext2D,
  v: View,
  gx: number,
  gy: number,
  size: number,
  col: string,
  urgency: 'ok' | 'warn' | 'crit',
) {
  // Wooden pallet base.
  box(ctx, v, gx, gy, size, size, 0.08, '#7a5a34', {
    top: '#8a6a40',
    left: '#5f4527',
    right: '#6e5030',
  });
  // Product crate on top.
  const top = urgency === 'crit' ? shade(col, 1.0) : urgency === 'warn' ? shade(col, 1.06) : shade(col, 1.16);
  box(ctx, v, gx + 0.05, gy + 0.05, size - 0.1, size - 0.1, 0.42, col, {
    top,
    left: shade(col, 0.6),
    right: shade(col, 0.82),
  });
  if (urgency !== 'ok') {
    const [mx, my] = iso(v, gx + size / 2, gy + size / 2, 0.5);
    ctx.fillStyle = urgency === 'crit' ? '#ff5a5a' : '#ffcf4d';
    ctx.font = `bold ${Math.round(10 * v.s + 2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', mx, my - 2 * v.s);
  }
}
function worker(ctx: CanvasRenderingContext2D, v: View, a: WorkerAnim, shirt: string, progress: number | null) {
  const [sx, sy] = iso(v, a.gx, a.gy, 0);
  const s = v.s;
  const bob = a.moving ? Math.abs(Math.sin(a.bob)) * 2.2 * s : Math.sin(a.bob) * 0.8 * s;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 9 * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();
  const baseY = sy - bob;
  ctx.fillStyle = shirt;
  roundRect(ctx, sx - 5 * s, baseY - 20 * s, 10 * s, 15 * s, 3 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, baseY - 24 * s, 4.6 * s, 0, Math.PI * 2);
  ctx.fillStyle = C.skin;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, baseY - 26 * s, 5 * s, Math.PI, 0);
  ctx.fillStyle = C.hat;
  ctx.fill();
  if (a.carrying) {
    ctx.fillStyle = '#c79a5b';
    roundRect(ctx, sx - 4 * s, baseY - 16 * s, 8 * s, 7 * s, 1.5 * s);
    ctx.fill();
  }
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
function officeDesk(ctx: CanvasRenderingContext2D, v: View, gx: number, gy: number, occupied: boolean) {
  // Chair behind the desk (toward the front of the tile).
  box(ctx, v, gx - 0.12, gy + 0.14, 0.24, 0.22, 0.16, '#4a5262', {
    top: '#5a6373',
    left: '#3c434f',
    right: '#4a5262',
  });
  box(ctx, v, gx - 0.12, gy + 0.3, 0.24, 0.05, 0.34, '#4a5262'); // chair back
  // Desk top.
  box(ctx, v, gx - 0.34, gy - 0.24, 0.68, 0.44, 0.24, C.desk, {
    top: shade(C.desk, 1.12),
    left: shade(C.desk, 0.68),
    right: shade(C.desk, 0.86),
  });
  // Monitor on the desk (screen glows when occupied).
  const screen = occupied ? C.screen : C.monitor;
  box(ctx, v, gx - 0.1, gy - 0.16, 0.2, 0.05, 0.2, screen, {
    top: shade(screen, 1.15),
    left: shade(screen, 0.7),
    right: shade(screen, 0.9),
  });
  box(ctx, v, gx - 0.03, gy - 0.14, 0.06, 0.03, 0.06, '#2a2f38'); // stand
}
function officePerson(ctx: CanvasRenderingContext2D, v: View, gx: number, gy: number, shirt: string) {
  const [sx, sy] = iso(v, gx, gy, 0);
  const s = v.s;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, sx - 5.5 * s, sy - 15 * s, 11 * s, 13 * s, 2.5 * s);
  ctx.fill();
  ctx.fillStyle = shirt;
  roundRect(ctx, sx - 4.5 * s, sy - 17 * s, 9 * s, 13 * s, 2.5 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, sy - 20 * s, 4 * s, 0, Math.PI * 2);
  ctx.fillStyle = C.skin;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, sy - 21 * s, 4.3 * s, Math.PI, 0);
  ctx.fillStyle = 'rgba(46,33,27,0.85)';
  ctx.fill();
}
function label(ctx: CanvasRenderingContext2D, v: View, gx: number, gy: number, text: string) {
  const [sx, sy] = iso(v, gx, gy, 0);
  ctx.font = `${Math.round(9 * v.s + 3)}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = C.label;
  ctx.fillText(text, sx, sy);
}

function draw(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  anim: Anim,
  cw: number,
  ch: number,
  cam: Camera,
  viewOut: View,
  build: BuildProps | undefined,
  hover: { gx: number; gy: number } | null,
) {
  if (cw === 0 || ch === 0) return;

  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, C.skyTop);
  g.addColorStop(1, C.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);

  // Fit once (or on Recenter); afterwards the scale stays fixed and the player
  // pans. Deriving ox/oy from the canvas size each frame keeps it resize-safe.
  if (!cam.init) {
    const f = computeFit(state, cw, ch);
    cam.cx = f.cx;
    cam.cy = f.cy;
    cam.s = f.s;
    cam.init = true;
  }
  const v: View = { ox: cw / 2 - cam.cx * cam.s, oy: ch / 2 - cam.cy * cam.s, s: cam.s };
  viewOut.ox = v.ox;
  viewOut.oy = v.oy;
  viewOut.s = v.s;

  const b = hallBounds(state);
  const ab = allTileBounds(state);
  const gxLo = ab.minGx - 1;
  const gxHi = ab.maxGx + 2;
  const gyLo = ab.minGy - 1;
  const gyHi = ab.maxGy + 4;

  // Grass under everything.
  quad(
    ctx,
    [iso(v, gxLo - 1, gyLo - 1), iso(v, gxHi + 1, gyLo - 1), iso(v, gxHi + 1, gyHi + 1), iso(v, gxLo - 1, gyHi + 1)],
    C.grass,
    false,
  );
  // Dock road out front.
  const dockGx = b.maxGx - 1.5;
  quad(
    ctx,
    [iso(v, dockGx, b.maxGy + 1), iso(v, dockGx + 1.5, b.maxGy + 1), iso(v, dockGx + 1.5, gyHi), iso(v, dockGx, gyHi)],
    C.road,
    false,
  );

  // Floor tiles (office tiles get the darker office floor).
  for (const t of state.warehouse.tiles) {
    const checker = (t.gx + t.gy) % 2 === 0;
    const fill =
      t.zone === 'ramp'
        ? checker ? C.rampFloor : C.rampFloorAlt
        : t.zone === 'office'
          ? checker ? C.officeFloor : shade(C.officeFloor, 0.92)
          : checker ? C.floor : C.floorAlt;
    tileQuad(ctx, v, t.gx, t.gy, fill, true);
  }

  // Zone labels.
  label(ctx, v, (b.minGx + b.maxGx) / 2 + 0.5, b.minGy + 0.4, 'LAGER');
  const inbPos = inboundPositions(state);
  const pickPos = pickupPositions(state);
  if (inbPos[0]) label(ctx, v, inbPos[0].gx + 0.5, inbPos[0].gy + 0.5, 'WARENEINGANG');
  if (pickPos[0]) label(ctx, v, pickPos[0].gx + 0.5, pickPos[0].gy + 0.5, 'RAMPE');

  // Office block: back/left walls + BÜRO label.
  const ob = officeBounds(state);
  if (ob) {
    box(ctx, v, ob.minGx, ob.minGy, ob.maxGx - ob.minGx + 1, 0.1, 0.8, C.officeWall, {
      top: shade(C.officeWall, 1.15),
      left: shade(C.officeWall, 0.8),
      right: shade(C.officeWall, 0.95),
    });
    box(ctx, v, ob.minGx, ob.minGy, 0.1, ob.maxGy - ob.minGy + 1, 0.8, C.officeWall, {
      top: shade(C.officeWall, 1.15),
      left: shade(C.officeWall, 0.7),
      right: shade(C.officeWall, 0.9),
    });
    label(ctx, v, (ob.minGx + ob.maxGx) / 2 + 0.5, ob.minGy + 0.35, 'BÜRO');
  }

  // Back walls along the hall's back-left edges.
  box(ctx, v, b.minGx, b.minGy, b.maxGx - b.minGx + 1, 0.12, 1.0, C.wallFace, {
    top: C.wallTop,
    left: shade(C.wallFace, 0.8),
    right: shade(C.wallFace, 0.95),
  });
  box(ctx, v, b.minGx, b.minGy, 0.12, b.maxGy - b.minGy + 1, 1.0, C.wallFace, {
    top: C.wallTop,
    left: shade(C.wallFace, 0.7),
    right: shade(C.wallFace, 0.9),
  });

  type Item = { depth: number; z: number; draw: () => void };
  const items: Item[] = [];

  // Shelves + their pallets (shelf stock distributed across slots).
  const shelfPals = chunkStock(state, 'shelf');
  const slotOffsets = [
    [0.16, 0.16],
    [0.52, 0.16],
    [0.16, 0.52],
    [0.52, 0.52],
  ];
  state.warehouse.shelves.forEach((sh, si) => {
    items.push({
      depth: sh.gx + sh.gy,
      z: 0,
      draw: () => {
        box(ctx, v, sh.gx + 0.12, sh.gy + 0.12, 0.76, 0.76, 0.14, C.rack);
        for (let slot = 0; slot < SHELF_SLOTS; slot++) {
          const pal = shelfPals[si * SHELF_SLOTS + slot];
          if (!pal) continue;
          const [ox, oy] = slotOffsets[slot];
          pallet(ctx, v, sh.gx + ox, sh.gy + oy, 0.3, PROD_HEX[pal.productId], pal.urgency);
        }
      },
    });
  });

  // Prep tables.
  state.warehouse.tables.forEach((t) => {
    items.push({ depth: t.gx + t.gy, z: 0, draw: () => box(ctx, v, t.gx + 0.1, t.gy + 0.1, 0.8, 0.8, 0.36, C.table) });
  });

  // Inbound pallets in the Wareneingang — product-coloured crates on pallets
  // (chunked stock across the inbound slots; overflow stacks as a Stau).
  const inbPals = chunkStock(state, 'inbound');
  inbPals.forEach((pal, k) => {
    const pos = inbPos[Math.min(k, inbPos.length - 1)];
    if (!pos) return;
    const overflow = k >= inbPos.length; // Stau — stacked beyond the last slot
    const off = overflow ? 0.12 * (k - inbPos.length + 1) : 0;
    const col = PROD_HEX[pal.productId] ?? C.inbound;
    items.push({
      depth: pos.gx + pos.gy + off,
      z: overflow ? 1 : 0,
      draw: () => crate(ctx, v, pos.gx + 0.18 + off, pos.gy + 0.18 - off, 0.6, col, pal.urgency),
    });
  });

  // Ready pallets on the pickup ramp — the finished orders waiting for the truck.
  const ready = state.palettes.filter((p) => p.status === 'ready');
  ready.slice(0, pickPos.length).forEach((p, k) => {
    const pos = pickPos[k];
    const col = PROD_HEX[p.productId] ?? '#8a8f98';
    items.push({ depth: pos.gx + pos.gy, z: 0, draw: () => crate(ctx, v, pos.gx + 0.18, pos.gy + 0.18, 0.6, col, 'ok') });
  });

  // Office desks (from state) + seated office staff at the first N desks.
  const officeStaff = state.employees.filter((e) => e.role !== 'lager');
  state.warehouse.desks.forEach((d, i) => {
    // desk centre inside the tile
    const dgx = d.gx + 0.5;
    const dgy = d.gy + 0.5;
    const staff = officeStaff[i];
    items.push({ depth: d.gx + d.gy, z: 0, draw: () => officeDesk(ctx, v, dgx, dgy, !!staff) });
    if (staff) {
      const shirt = OFFICE_SHIRT[staff.role] ?? '#8a8f98';
      items.push({ depth: dgx + dgy + 0.01, z: 1, draw: () => officePerson(ctx, v, dgx + 0.02, dgy + 0.28, shirt) });
    }
  });

  // Warehouse workers.
  state.employees
    .filter((e) => e.role === 'lager')
    .forEach((e, i) => {
      const a = anim.workers[e.id];
      if (!a) return;
      const shirt = i % 2 === 0 ? C.shirtA : C.shirtB;
      const progress = e.task ? 1 - e.task.remainingDays / e.task.totalDays : null;
      items.push({ depth: a.gx + a.gy, z: 1, draw: () => worker(ctx, v, a, shirt, progress) });
    });

  // Truck.
  const tp = anim.truckP;
  if (tp > 0.001) {
    const gy = b.maxGy + 0.3 + (1 - tp) * 4;
    const gx = dockGx + 0.1;
    items.push({
      depth: gx + gy + 6,
      z: 2,
      draw: () => {
        // A few loaded pallets on the open bed (colours from the waiting orders).
        const loadCols = ready.slice(0, 2).map((p) => PROD_HEX[p.productId] ?? C.inbound);
        loadCols.forEach((col, i) => {
          crate(ctx, v, gx + 0.15 + i * 0.5, gy + 0.2, 0.34, col, 'ok');
        });
        box(ctx, v, gx + 0.05, gy + 0.85, 1.1, 0.55, 0.5, C.truckCab);
        // Low side walls of the cargo bed (drawn after so pallets sit inside).
        box(ctx, v, gx, gy, 1.2, 0.06, 0.3, C.truckCargo, { top: shade(C.truckCargo, 1.05), left: shade(C.truckCargo, 0.7), right: shade(C.truckCargo, 0.85) });
        ctx.fillStyle = '#1b1f24';
        for (const wp of [[gx + 0.15, gy + 0.05], [gx + 1.05, gy + 0.05], [gx + 0.15, gy + 0.75], [gx + 1.05, gy + 0.75]]) {
          const [wx, wy] = iso(v, wp[0], wp[1], 0.05);
          ctx.beginPath();
          ctx.ellipse(wx, wy, 3.5 * v.s, 2 * v.s, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  }

  items.sort((a, b2) => a.depth - b2.depth || a.z - b2.z);
  items.forEach((it) => it.draw());

  // --- Build mode overlay ---
  if (build && build.tool) {
    const tool = build.tool;
    const blockTool = tool === 'expand' || tool === 'officeExpand';
    const blocksFor = () => (tool === 'expand' ? expansionBlocks(state) : officeExpansionBlocks(state));
    // Dim the whole hall.
    ctx.fillStyle = 'rgba(6,10,14,0.45)';
    ctx.fillRect(0, 0, cw, ch);
    if (blockTool) {
      for (const block of blocksFor()) {
        for (const t of block) tileQuad(ctx, v, t.gx, t.gy, C.buildOk, false);
        const gx = Math.min(...block.map((t) => t.gx));
        const gy = Math.min(...block.map((t) => t.gy));
        outlineTile(ctx, v, gx, gy, 2, C.buildOkEdge);
      }
    } else {
      for (const t of validBuildTiles(state, tool)) tileQuad(ctx, v, t.gx, t.gy, C.buildOk, false);
    }
    // Hover highlight.
    if (hover) {
      if (blockTool) {
        const block = blocksFor().find((blk) => blk.some((c) => c.gx === hover.gx && c.gy === hover.gy));
        if (block) {
          const gx = Math.min(...block.map((t) => t.gx));
          const gy = Math.min(...block.map((t) => t.gy));
          outlineTile(ctx, v, gx, gy, 2, C.buildHover, 2.5);
        }
      } else if (validBuildTiles(state, tool).some((t) => t.gx === hover.gx && t.gy === hover.gy)) {
        outlineTile(ctx, v, hover.gx, hover.gy, 1, C.buildHover, 2.5);
      }
    }
  }

  // HUD. Outside working hours (6–20) staff are on "Feierabend" and no task
  // progresses — surface that so a stalled Herrichtung at night isn't confusing.
  const hr = hourOf(state.totalDays);
  const feierabend = hr < WORK_START_HOUR || hr >= WORK_END_HOUR;
  const hud = `🏭 Regal ${shelfUsed(state)}/${shelfCapacity(state)}  ·  Wareneingang ${inboundUsed(state)}/${inboundCapacity(state)}  ·  Fertig ${ready.length}  ·  ${dayName(state.totalDays)} ${formatClock(state.totalDays)}${feierabend ? '  ·  😴 Feierabend' : ''}`;
  ctx.font = `600 12px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'left';
  const pad = 10;
  const w = ctx.measureText(hud).width + pad * 2;
  ctx.fillStyle = 'rgba(10,16,22,0.62)';
  roundRect(ctx, 10, 10, w, 26, 7);
  ctx.fill();
  ctx.fillStyle = '#e6edf3';
  ctx.fillText(hud, 10 + pad, 27);

  const phase = truckPhase(state);
  const note = phase === 'here' ? '🚚 Laster wartet…' : phase === 'leaving' ? '🚚 Laster fährt ab' : 'Abholung: täglich 18:00';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(230,237,243,0.85)';
  ctx.fillText(note, cw - 14, 27);
}

function outlineTile(ctx: CanvasRenderingContext2D, v: View, gx: number, gy: number, span: number, color: string, width = 1.5) {
  ctx.beginPath();
  const pts = [iso(v, gx, gy), iso(v, gx + span, gy), iso(v, gx + span, gy + span), iso(v, gx, gy + span)];
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
