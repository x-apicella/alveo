import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><Image src="/alveo-logo.png" alt={compact ? "Alveo home" : ""} width={44} height={44} />{!compact && <span>alveo<span className="brand-dot">.</span></span>}</span>;
}
