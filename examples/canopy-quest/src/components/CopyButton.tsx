import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copy-to-clipboard with a short confirmation, degrading quietly if blocked. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard permission denied — nothing to do but leave the text visible.
    }
  };

  return (
    <button type="button" className="btn btn-sm btn-ghost" onClick={copy} title="Copy">
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {label ?? (copied ? "Copied" : "Copy")}
    </button>
  );
}
