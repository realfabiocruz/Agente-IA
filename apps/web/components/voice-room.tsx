'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { api } from '@/lib/api';
import { InterviewerAvatar, type AvatarSample } from './interviewer-avatar';

type Phase = 'connecting' | 'live' | 'error';

// "Aleatória" usa a mesma regra do worker de voz (paridade do 1º caractere do id), para o rosto combinar com a voz.
/**
 * Sala de voz da entrevista (LiveKit). O navegador só publica o microfone e
 * toca o áudio do agente; a conversa em si acontece no worker de voz, que usa a
 * mesma API do modo texto. A transcrição aparece na tela pelo estado da entrevista.
 */
export function VoiceRoom({
  interviewId,
  onNeedRefresh,
  voicePref,
}: {
  interviewId: string;
  onNeedRefresh: () => void;
  voicePref?: 'MALE' | 'FEMALE' | 'RANDOM' | null;
}) {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [speakerActive, setSpeakerActive] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>('connecting');
  phaseRef.current = phase;
  const lastUserSpeech = useRef(0);
  const lastAgentSpeech = useRef(0);
  const refresh = useRef(onNeedRefresh);
  refresh.current = onNeedRefresh;

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true });
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) audioRef.current?.appendChild(track.attach());
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) =>
      setSpeakerActive(speakers.some((s) => s.identity !== room.localParticipant.identity)),
    );
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) setPhase('error');
      refresh.current();
    });

    (async () => {
      try {
        const { url, token } = await api<{ url: string; token: string }>(`/interviews/${interviewId}/voice-token`, { method: 'POST' });
        await room.connect(url, token);
        await room.localParticipant.setMicrophoneEnabled(true);
        await room.startAudio();
        if (!cancelled) setPhase('live');
      } catch (e) {
        if (!cancelled) {
          setPhase('error');
          setError(
            (e as Error).name === 'NotAllowedError' ? 'Permita o uso do microfone no navegador para conversar por voz.' : (e as Error).message,
          );
        }
      }
    })();

    // A transcrição vem do backend: atualiza a tela enquanto a sala estiver aberta.
    const poll = setInterval(() => refresh.current(), 2500);
    return () => {
      cancelled = true;
      clearInterval(poll);
      room.disconnect();
    };
  }, [interviewId]);

  // Amostra para o avatar: volume da IA (boca) e o momento da conversa (falando, ouvindo, pensando).
  const sample = (): AvatarSample => {
    const room = roomRef.current;
    if (!room || phaseRef.current !== 'live') return { mode: 'connecting', level: 0 };
    const now = performance.now();
    let agentLevel = 0;
    room.remoteParticipants.forEach((p) => (agentLevel = Math.max(agentLevel, p.audioLevel)));
    if (agentLevel > 0.01) lastAgentSpeech.current = now;
    if (room.localParticipant.audioLevel > 0.02) lastUserSpeech.current = now;
    if (now - lastAgentSpeech.current < 400) return { mode: 'speaking', level: agentLevel };
    if (now - lastUserSpeech.current < 1200) return { mode: 'listening', level: 0 };
    // A pessoa falou há pouco e a IA ainda não respondeu: está processando a resposta.
    if (lastUserSpeech.current > lastAgentSpeech.current && now - lastUserSpeech.current < 12000) return { mode: 'thinking', level: 0 };
    return { mode: 'idle', level: 0 };
  };

  const toggleMic = async () => {
    const next = !micOn;
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm">
      <div ref={audioRef} className="hidden" />
      <InterviewerAvatar sample={sample} tone={voicePref === 'FEMALE' || voicePref === 'MALE' ? voicePref : interviewId.charCodeAt(0) % 2 ? 'MALE' : 'FEMALE'} />
      {phase === 'error' ? (
        <p className="text-red-700">{error ?? 'A conexão de voz caiu. Pause e retome a entrevista para reconectar, ou responda por escrito.'}</p>
      ) : (
        <p className="text-gray-700" aria-live="polite">
          {phase === 'connecting' ? 'Conectando à sala de voz…' : speakerActive ? 'O agente está falando…' : micOn ? 'Ouvindo você…' : 'Microfone desligado'}
        </p>
      )}
      {phase === 'live' ? (
        <button onClick={toggleMic} className={`rounded-full px-4 py-2 font-medium text-white ${micOn ? 'bg-brand-600' : 'bg-gray-500'}`}>
          {micOn ? 'Desligar microfone' : 'Ligar microfone'}
        </button>
      ) : null}
    </div>
  );
}
