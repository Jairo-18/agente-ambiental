'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECCIONES = [
  { href: '/', texto: 'Calidad del aire' },
  { href: '/valor', texto: 'Evaluar un valor' },
  { href: '/norma', texto: 'Consultar la norma' },
  { href: '/asistente', texto: 'Agente (reportes)' },
  { href: '/reportes-ciudadanos', texto: 'Reportes ciudadanos' },
  { href: '/chat', texto: 'Chat' },
];

export default function Nav() {
  const ruta = usePathname();
  const activa = (href: string) => (href === '/' ? ruta === '/' || ruta.startsWith('/reportes/') : ruta.startsWith(href));
  return (
    <nav className="nav" aria-label="Secciones">
      {SECCIONES.map((s) => (
        <Link key={s.href} href={s.href} aria-current={activa(s.href) ? 'page' : undefined}>
          {s.texto}
        </Link>
      ))}
    </nav>
  );
}
