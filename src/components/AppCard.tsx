// src/components/AppCard.tsx
import type { ReactNode, CSSProperties } from "react";

type AppCardProps = {
  children: ReactNode;
  /** título opcional (estilo do login) */
  title?: string;
  /** descrição opcional (estilo do login) */
  subtitle?: string;
  /** ícone (emoji) opcional */
  icon?: string;
  /** largura máxima do card (padrão 460 igual ao login) */
  maxWidth?: number;
  /** esconder o container centralizado (usar só o card) */
  noCenter?: boolean;
  /** estilo adicional no card */
  style?: CSSProperties;
};

export default function AppCard({
  children,
  title,
  subtitle,
  icon,
  maxWidth = 460,
  noCenter = false,
  style,
}: AppCardProps) {
  const pageStyle: CSSProperties = noCenter
    ? {}
    : {
        minHeight: "100vh",
        padding: 18,
        display: "grid",
        placeItems: "start center",
      };

  const containerStyle: CSSProperties = noCenter
    ? {}
    : {
        width: "100%",
        maxWidth,
        display: "grid",
        gap: 12,
      };

  const cardStyle: CSSProperties = {
    background: "#fff",
    border: "1px solid #e6e8eb",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
    ...style,
  };

  const brandRow: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  };

  const logoStyle: CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: "#e9fff0",
    display: "grid",
    placeItems: "center",
    border: "1px solid #cfe9d7",
    fontSize: 22,
    flex: "0 0 auto",
  };

  const titleStyle: CSSProperties = {
    fontSize: 20,
    fontWeight: 950,
    color: "#111",
    lineHeight: 1.1,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: 13,
    color: "#4b5563",
    marginTop: 4,
    lineHeight: 1.25,
  };

  return (
    <main style={pageStyle}>
      {/* garante o fundo do app no mesmo padrão do login */}
      <style>{`
        body { background:#f6f7f9; color:#111; }
      `}</style>

      <div style={containerStyle}>
        <div style={cardStyle}>
          {(title || subtitle) && (
            <div style={brandRow}>
              {icon ? (
                <div style={logoStyle} aria-hidden>
                  {icon}
                </div>
              ) : null}

              <div style={{ lineHeight: 1.1 }}>
                {title ? <div style={titleStyle}>{title}</div> : null}
                {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
              </div>
            </div>
          )}

          {children}
        </div>
      </div>
    </main>
  );
}