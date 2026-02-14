import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegister from "./SwRegister";
import InstallPwaButton from "@/components/InstallPwaButton";

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
    <html lang="pt-BR">
      <body>
        <SwRegister />
        {children}

        {/* ✅ botão sempre disponível em qualquer rota, inclusive /login */}
        <InstallPwaButton />
      </body>
    </html>
  );
}
