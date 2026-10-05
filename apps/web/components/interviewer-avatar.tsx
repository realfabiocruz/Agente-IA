'use client';

import { useEffect, useRef, useState } from 'react';

export type AvatarMode = 'connecting' | 'speaking' | 'listening' | 'thinking' | 'idle';
export type AvatarSample = { mode: AvatarMode; level: number };

const LABEL: Record<AvatarMode, string> = {
  connecting: 'Conectando…',
  speaking: 'Falando',
  listening: 'Ouvindo você',
  thinking: 'Pensando…',
  idle: 'Aguardando',
};

/**
 * Avatar animado desenhado em SVG (sem custo por minuto): a boca acompanha o volume da voz da IA,
 * as sobrancelhas e o brilho dos olhos mudam entre falando, ouvindo e pensando. Não é vídeo realista.
 * A animação roda direto no DOM (requestAnimationFrame) para não re-renderizar a tela a cada quadro.
 */
export function InterviewerAvatar({ sample, tone = 'neutral' }: { sample: () => AvatarSample; tone?: 'FEMALE' | 'MALE' | 'neutral' }) {
  const mouth = useRef<SVGEllipseElement>(null);
  const brows = useRef<SVGGElement>(null);
  const head = useRef<SVGGElement>(null);
  const [mode, setMode] = useState<AvatarMode>('connecting');
  const sampleRef = useRef(sample);
  sampleRef.current = sample;

  useEffect(() => {
    let raf = 0;
    let open = 0;
    let lastMode: AvatarMode = 'connecting';
    const t0 = performance.now();
    const tick = (now: number) => {
      const s = sampleRef.current();
      if (s.mode !== lastMode) {
        lastMode = s.mode;
        setMode(s.mode);
      }
      const target = s.mode === 'speaking' ? Math.min(1, s.level * 4) : 0;
      open += (target - open) * 0.35;
      const t = (now - t0) / 1000;
      mouth.current?.setAttribute('ry', String(2.5 + open * 15));
      mouth.current?.setAttribute('rx', String(19 - open * 3));
      const lift = s.mode === 'thinking' ? -5 : s.mode === 'listening' ? -2 : 0;
      brows.current?.setAttribute('transform', `translate(0 ${lift})`);
      const sway = s.mode === 'speaking' ? Math.sin(t * 3) * 1.2 : s.mode === 'listening' ? Math.sin(t * 1.2) * 1.6 : Math.sin(t * 0.8) * 0.6;
      head.current?.setAttribute('transform', `rotate(${sway.toFixed(2)} 100 110)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hair = tone === 'FEMALE' ? '#5b3a29' : tone === 'MALE' ? '#2f2a26' : '#4a4a58';
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`Entrevistador virtual: ${LABEL[mode]}`}>
      <svg viewBox="0 0 200 200" className="h-40 w-40 rounded-full bg-brand-50 ring-4 ring-brand-100">
        <g ref={head}>
          {tone === 'FEMALE' ? <path d="M48 112c-8-62 36-84 52-84s60 22 52 84c-4-30-18-52-52-52S52 82 48 112z" fill={hair} /> : null}
          {tone === 'FEMALE' ? <rect x="44" y="100" width="18" height="70" rx="9" fill={hair} /> : null}
          {tone === 'FEMALE' ? <rect x="138" y="100" width="18" height="70" rx="9" fill={hair} /> : null}
          <ellipse cx="100" cy="112" rx="46" ry="54" fill="#f1c7a5" />
          {tone !== 'FEMALE' ? <path d="M54 100c-4-46 28-62 46-62s50 16 46 62c-6-22-22-34-46-34s-40 12-46 34z" fill={hair} /> : null}
          <g ref={brows} stroke="#3a2c24" strokeWidth="4" strokeLinecap="round" fill="none">
            <path d="M68 90q12-7 24 0" />
            <path d="M108 90q12-7 24 0" />
          </g>
          <g className="avatar-blink" style={{ transformOrigin: '100px 108px' }}>
            <ellipse cx="80" cy="108" rx="7" ry="8" fill="#fff" />
            <ellipse cx="120" cy="108" rx="7" ry="8" fill="#fff" />
            <circle cx="80" cy="109" r="4" fill="#2b2118" />
            <circle cx="120" cy="109" r="4" fill="#2b2118" />
          </g>
          <path d="M100 116v16" stroke="#d9a982" strokeWidth="3" strokeLinecap="round" />
          <ellipse ref={mouth} cx="100" cy="148" rx="19" ry="2.5" fill="#8a3b3b" />
        </g>
      </svg>
      <span className="text-xs text-gray-600" aria-live="polite">{LABEL[mode]}</span>
      <style>{`
        .avatar-blink { animation: avatar-blink 4.5s infinite; }
        @keyframes avatar-blink { 0%, 94%, 100% { transform: scaleY(1); } 97% { transform: scaleY(0.08); } }
        @media (prefers-reduced-motion: reduce) { .avatar-blink { animation: none; } }
      `}</style>
    </div>
  );
}
