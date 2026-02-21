// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

import ClientProviders from "./ClientProviders";
import SwRegister from "./SwRegister";
import InstallPwaButton from "@/components/InstallPwaButton";
import BottomNavGate from "@/components/BottomNavGate";

export const metadata: Metadata = {
  title: "PlantaCheck",
  description: "Controle inteligente das suas plantas",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2E7D32",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning style={{ paddingBottom: 120 }}>
        {/* Providers globais (auth, theme, etc) */}
        <ClientProviders />

        {/* Service Worker / PWA */}
        <SwRegister />

        {/* Conteúdo da página */}
        {children}

        {/* Botão de instalação PWA (sempre disponível) */}
        <InstallPwaButton />

        {/* Navegação inferior (somente quando aplicável) */}
        <BottomNavGate />
      </body>
    </html>
  );
}