import type { Metadata } from "next";
import BarraDaConta from "./conta/BarraDaConta";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diabetes do Aloncinho",
  description: "Calculadora de carboidratos e estimativa matemática de bolus.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

// A barra da conta mostra quem está logado, o que muda a cada pedido. Sem isto
// o Next pré-renderiza a página no build e congela o estado de "deslogado" no
// HTML. Não se perde nada: a página em si é montada no navegador.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {/* Fica fora de page.tsx porque a sessão só existe no servidor, e a
            página é um componente de cliente. */}
        <div className="mx-auto max-w-4xl px-4 pt-6">
          <BarraDaConta />
        </div>

        {children}
      </body>
    </html>
  );
}
