"use client";

import { useSearchParams } from "next/navigation";

export function useQueryParams() {
  const params = useSearchParams();

  return {
    get: (key: string) => params.get(key),
    has: (key: string) => params.has(key),
    all: () => Object.fromEntries(params.entries()),
  };
}
