// src/app/ClientProviders.tsx
"use client";

import { useEffect, useState } from "react";
import SwRegister from "./SwRegister";

export default function ClientProviders() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <SwRegister />;
}
