"use client";
import { useEffect } from "react";

/** Registers /sw.js in production so photos, models and narration audio work offline on stage. */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
