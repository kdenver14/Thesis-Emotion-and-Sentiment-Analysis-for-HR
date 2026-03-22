"use client";

import { useRef, useEffect } from "react";

const RESOLUTION = 4;
const TIME_SPEED = 0.0004;
const CONTOUR_LEVELS = 12;
const CURSOR_RADIUS = 180;
const CURSOR_DEPTH = 0.35;

// Simplex-inspired 2D noise using layered sine waves (no dependency needed)
function noise2D(x: number, y: number): number {
  const n1 = Math.sin(x * 0.8 + y * 0.6) * 0.5;
  const n2 = Math.sin(x * 1.3 - y * 0.9 + 2.1) * 0.3;
  const n3 = Math.sin(x * 0.4 + y * 1.7 + 4.3) * 0.15;
  const n4 = Math.sin(x * 2.1 + y * 0.3 - 1.7) * 0.1;
  const n5 = Math.sin(x * 0.7 - y * 2.3 + 3.2) * 0.08;
  return n1 + n2 + n3 + n4 + n5;
}

function fbm(x: number, y: number, t: number): number {
  let value = 0;
  value += noise2D(x * 0.015 + t, y * 0.015 + t * 0.7) * 1.0;
  value += noise2D(x * 0.03 + t * 0.5, y * 0.03 - t * 0.3) * 0.5;
  value += noise2D(x * 0.06 - t * 0.3, y * 0.06 + t * 0.4) * 0.25;
  return value;
}

interface Point {
  x: number;
  y: number;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Marching squares: find contour segments for a given threshold
function marchContours(
  field: Float64Array,
  cols: number,
  rows: number,
  threshold: number,
  cellSize: number,
): Point[][] {
  const segments: Point[][] = [];

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const tl = field[j * cols + i]!;
      const tr = field[j * cols + i + 1]!;
      const br = field[(j + 1) * cols + i + 1]!;
      const bl = field[(j + 1) * cols + i]!;

      const code =
        (tl >= threshold ? 8 : 0) |
        (tr >= threshold ? 4 : 0) |
        (br >= threshold ? 2 : 0) |
        (bl >= threshold ? 1 : 0);

      if (code === 0 || code === 15) continue;

      const x = i * cellSize;
      const y = j * cellSize;

      const top: Point = lerpPoint(
        { x, y },
        { x: x + cellSize, y },
        (threshold - tl) / (tr - tl || 1),
      );
      const right: Point = lerpPoint(
        { x: x + cellSize, y },
        { x: x + cellSize, y: y + cellSize },
        (threshold - tr) / (br - tr || 1),
      );
      const bottom: Point = lerpPoint(
        { x, y: y + cellSize },
        { x: x + cellSize, y: y + cellSize },
        (threshold - bl) / (br - bl || 1),
      );
      const left: Point = lerpPoint(
        { x, y },
        { x, y: y + cellSize },
        (threshold - tl) / (bl - tl || 1),
      );

      const addSeg = (a: Point, b: Point) => segments.push([a, b]);

      switch (code) {
        case 1: addSeg(left, bottom); break;
        case 2: addSeg(bottom, right); break;
        case 3: addSeg(left, right); break;
        case 4: addSeg(top, right); break;
        case 5: addSeg(top, right); addSeg(left, bottom); break;
        case 6: addSeg(top, bottom); break;
        case 7: addSeg(top, left); break;
        case 8: addSeg(top, left); break;
        case 9: addSeg(top, bottom); break;
        case 10: addSeg(top, left); addSeg(bottom, right); break;
        case 11: addSeg(top, right); break;
        case 12: addSeg(left, right); break;
        case 13: addSeg(bottom, right); break;
        case 14: addSeg(left, bottom); break;
      }
    }
  }

  return segments;
}

// Chain segments into polylines for smoother rendering
function chainSegments(segments: Point[][]): Point[][] {
  if (segments.length === 0) return [];

  const EPSILON = 0.5;
  const used = new Uint8Array(segments.length);
  const chains: Point[][] = [];

  const near = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;

    const chain: Point[] = [segments[i]![0]!, segments[i]![1]!];
    let extended = true;

    while (extended) {
      extended = false;
      const head = chain[0]!;
      const tail = chain[chain.length - 1]!;

      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const seg = segments[j]!;
        if (near(seg[0]!, tail)) {
          chain.push(seg[1]!);
          used[j] = 1;
          extended = true;
        } else if (near(seg[1]!, tail)) {
          chain.push(seg[0]!);
          used[j] = 1;
          extended = true;
        } else if (near(seg[1]!, head)) {
          chain.unshift(seg[0]!);
          used[j] = 1;
          extended = true;
        } else if (near(seg[0]!, head)) {
          chain.unshift(seg[1]!);
          used[j] = 1;
          extended = true;
        }
      }
    }

    chains.push(chain);
  }

  return chains;
}

export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -1000, y: -1000 });
  const smoothMouse = useRef({ x: -1000, y: -1000 });
  const animationId = useRef<number>(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let field = new Float64Array(0);

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / RESOLUTION) + 1;
      rows = Math.ceil(height / RESOLUTION) + 1;
      field = new Float64Array(cols * rows);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleMouseLeave = () => {
      mouse.current = { x: -1000, y: -1000 };
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const t = (Date.now() - startTime.current) * TIME_SPEED;

      // Smooth cursor
      smoothMouse.current.x += (mouse.current.x - smoothMouse.current.x) * 0.06;
      smoothMouse.current.y += (mouse.current.y - smoothMouse.current.y) * 0.06;
      const mx = smoothMouse.current.x;
      const my = smoothMouse.current.y;

      // Compute scalar field
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const px = i * RESOLUTION;
          const py = j * RESOLUTION;

          let value = fbm(px, py, t);

          // Cursor depression
          const dx = px - mx;
          const dy = py - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CURSOR_RADIUS) {
            const influence = 1 - dist / CURSOR_RADIUS;
            const smooth = influence * influence * (3 - 2 * influence); // smoothstep
            value -= smooth * CURSOR_DEPTH;
          }

          field[j * cols + i] = value;
        }
      }

      // Find field range for evenly spaced contours
      let min = Infinity;
      let max = -Infinity;
      for (let k = 0; k < field.length; k++) {
        const v = field[k]!;
        if (v < min) min = v;
        if (v > max) max = v;
      }

      // Draw contour lines
      for (let level = 1; level < CONTOUR_LEVELS; level++) {
        const threshold = min + (max - min) * (level / CONTOUR_LEVELS);
        const segments = marchContours(field, cols, rows, threshold, RESOLUTION);
        const chains = chainSegments(segments);

        // Opacity varies by level — stronger in the middle
        const normalizedLevel = level / CONTOUR_LEVELS;
        const opacity = 0.06 + Math.sin(normalizedLevel * Math.PI) * 0.12;

        ctx.strokeStyle = `rgba(156, 163, 175, ${opacity})`;
        ctx.lineWidth = normalizedLevel > 0.4 && normalizedLevel < 0.7 ? 1.2 : 0.7;

        for (const chain of chains) {
          if (chain.length < 2) continue;

          ctx.beginPath();
          ctx.moveTo(chain[0]!.x, chain[0]!.y);

          // Smooth the polyline with quadratic curves
          for (let k = 1; k < chain.length - 1; k++) {
            const curr = chain[k]!;
            const next = chain[k + 1]!;
            const cpx = (curr.x + next.x) / 2;
            const cpy = (curr.y + next.y) / 2;
            ctx.quadraticCurveTo(curr.x, curr.y, cpx, cpy);
          }

          const last = chain[chain.length - 1]!;
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }
      }

      animationId.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    animationId.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationId.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
