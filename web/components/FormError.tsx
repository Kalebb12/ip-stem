"use client";
import { useEffect, useRef } from "react";
/** Error summary that takes focus so screen-reader users hear what went wrong. */
export default function FormError({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (message) ref.current?.focus(); }, [message]);
  if (!message) return null;
  return (
    <div ref={ref} tabIndex={-1} className="notice error" role="alert" style={{ marginBottom: "1.25rem" }}>
      <p><strong>There was a problem: </strong>{message}</p>
    </div>
  );
}
