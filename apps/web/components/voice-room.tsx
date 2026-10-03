'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { api } from '@/lib/api';

type Phase = 'connecting' | 'live' | 'error';

/**
 * Sala de voz da entrevista (LiveKit). O navegador só publica o microfone e
 * toca o áudio do agente; a conversa em si acontece no worker de voz, que usa a
 * mesma API do modo texto. A transcrição aparece na tela pelo estado da entrevista.
 */
export function VoiceRoom({ interviewId, onNeedRefresh }: { interviewId: string; onNeedRefresh: () => void }) {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [speakerActive, setSpeakerActive] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
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

  const toggleMic = async () => {
    const next = !micOn;
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm">
      <div ref={audioRef} className="hidden" />
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
