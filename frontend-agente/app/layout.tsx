import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Estado from '@/components/Estado';
import Nav from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agente de reportes ambientales',
  description: 'Reportes de calidad del aire de Bogotá con motor de reglas, trazabilidad y búsqueda vectorial de la norma',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="cabecera">
          <h1>Agente de reportes ambientales</h1>
          <Estado />
          <p className="sub">Bogotá · reportes ciudadanos ambientales (texto y voz) · calidad del aire (RMCAB, Res. 2254/2017) · prototipo académico</p>
        </header>
        <Nav />
        <main className="contenido">{children}</main>
      </body>
    </html>
  );
}
