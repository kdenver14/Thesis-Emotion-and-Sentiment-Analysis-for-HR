"use client";

import { useRef, useEffect } from "react";

const PARTICLE_COUNT = 600;
const REPEL_RADIUS = 130;
const REPEL_FORCE = 7;
const RETURN_SPEED = 0.015;
const PARTICLE_SIZE = 3;
const DRIFT_RADIUS = 40;

interface Particle {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  phaseX: number;
  phaseY: number;
  speedX: number;
  speedY: number;
  radius: number;
}

export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -1000, y: -1000 });
  const particles = useRef<Particle[]>([]);
  const animationId = useRef<number>(0);
  const initialized = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const initParticles = () => {
      particles.current = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        particles.current.push({
          homeX: x,
          homeY: y,
          x,
          y,
          phaseX: Math.random() * Math.PI * 2,
          phaseY: Math.random() * Math.PI * 2,
          speedX: 0.3 + Math.random() * 0.7,
          speedY: 0.3 + Math.random() * 0.7,
          radius: (0.5 + Math.random() * 0.5) * DRIFT_RADIUS,
        });
      }
      initialized.current = true;
    };

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

      if (!initialized.current) {
        initParticles();
      }
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

      const mx = mouse.current.x;
      const my = mouse.current.y;

      for (const p of particles.current) {
        // Continuous drifting motion
        p.phaseX += p.speedX * 0.02;
        p.phaseY += p.speedY * 0.02;

        const targetX = p.homeX + Math.sin(p.phaseX) * p.radius;
        const targetY = p.homeY + Math.cos(p.phaseY) * p.radius;

        // Repel from cursor
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < REPEL_RADIUS && dist > 0) {
          const force = (1 - dist / REPEL_RADIUS) * REPEL_FORCE;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }

        // Lerp toward drifting target
        p.x += (targetX - p.x) * RETURN_SPEED;
        p.y += (targetY - p.y) * RETURN_SPEED;

        ctx.fillStyle = "rgba(120, 130, 145, 0.6)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, PARTICLE_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
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
