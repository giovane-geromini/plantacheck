"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";

export default function BottomNavGate() {
  const pathname = usePathname() || "/";

  const hideOn =
    pathname.startsWith("/login") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth");

  if (hideOn) return null;
  return <BottomNav />;
}