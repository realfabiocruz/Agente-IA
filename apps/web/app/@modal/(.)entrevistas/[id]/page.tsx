import { InterviewScreen } from '@/components/interview-screen';

/**
 * Rota interceptada: navegando de dentro da plataforma, a entrevista abre em tela
 * cheia sobreposta. Recarregar ou abrir o link do convite cai em /entrevistas/[id].
 */
export default async function InterviewOverlay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InterviewScreen id={id} overlay />;
}
