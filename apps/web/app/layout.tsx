import type { Metadata } from 'next';
import './globals.css';
import { UserProvider } from '@/components/user-context';
import { Header } from '@/components/header';

export const metadata: Metadata = {
  title: 'Whizz · Entrevistas por skill',
  description: 'PoC do agente entrevistador da Whizz (modo texto)',
};

export default function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <UserProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
          {modal}
        </UserProvider>
      </body>
    </html>
  );
}
