'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Voz no navegador (Web Speech API): reconhecimento e síntese. É o primeiro
// passo da PoC em voz; na etapa de produção isso é trocado por LiveKit Agents
// com STT/TTS de um provedor, mantendo a mesma API de entrevista.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type VoicePref = 'MALE' | 'FEMALE' | 'RANDOM';

const FEMALE_HINTS = /(maria|francisca|luciana|fernanda|female|feminina|vitoria|camila)/i;
const MALE_HINTS = /(daniel|antonio|ricardo|male|masculin|felipe|thiago)/i;

function pickVoice(pref: VoicePref): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('pt'));
  if (!voices.length) return undefined;
  const hinted =
    pref === 'FEMALE' ? voices.filter((v) => FEMALE_HINTS.test(v.name)) : pref === 'MALE' ? voices.filter((v) => MALE_HINTS.test(v.name)) : [];
  const pool = hinted.length ? hinted : voices;
  const br = pool.filter((v) => v.lang.toLowerCase() === 'pt-br');
  return (br.length ? br : pool)[0];
}

export function useVoice(pref: VoicePref, onTranscript: (text: string) => void) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const handler = useRef(onTranscript);
  handler.current = onTranscript;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition) && 'speechSynthesis' in window);
    window.speechSynthesis?.getVoices();
    return () => {
      rec.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const stopListening = useCallback(() => {
    rec.current?.stop();
    setListening(false);
  }, []);

  const listen = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    window.speechSynthesis.cancel();
    rec.current?.abort();
    const r = new Ctor();
    r.lang = 'pt-BR';
    r.interimResults = true;
    r.continuous = true;
    let finalText = '';
    let silenceTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      const text = finalText.trim();
      finalText = '';
      if (text) {
        r.stop();
        handler.current(text);
      }
    };
    r.onresult = (e) => {
      let interimText = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText = Array.from({ length: i + 1 }, (_, k) => e.results[k][0].transcript).join(' ');
        else interimText = res[0].transcript;
      }
      setInterim(interimText);
      // Considera o fim da fala após 1,8s de silêncio depois de um trecho final.
      clearTimeout(silenceTimer);
      if (finalText) silenceTimer = setTimeout(flush, 1800);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMicError('Permita o uso do microfone no navegador para conversar por voz.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setMicError(`Erro no microfone: ${e.error}`);
    };
    r.onend = () => {
      clearTimeout(silenceTimer);
      setListening(false);
      setInterim('');
    };
    rec.current = r;
    setMicError(null);
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!('speechSynthesis' in window)) return onEnd?.();
      rec.current?.abort();
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR';
      const v = pickVoice(pref);
      if (v) u.voice = v;
      u.onstart = () => setSpeaking(true);
      u.onend = () => {
        setSpeaking(false);
        onEnd?.();
      };
      u.onerror = () => {
        setSpeaking(false);
        onEnd?.();
      };
      window.speechSynthesis.speak(u);
    },
    [pref],
  );

  const cancelSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { supported, listening, speaking, interim, micError, listen, stopListening, speak, cancelSpeech };
}
