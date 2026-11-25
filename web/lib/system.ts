"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

export interface SystemInfo {
  ai_enabled: boolean; vision_model: string | null;
  languages: { enabled: boolean; options: Record<string, string> };
}
let cache: Promise<SystemInfo | null> | null = null;

/** Server capabilities (AI, listening languages). Fetched once per page load. */
export function useSystem() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    cache ??= api<SystemInfo>("/system").catch(() => null);
    cache.then(setInfo);
  }, []);
  return info;
}
