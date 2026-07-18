"use client";

import { useEffect, useId, useRef } from "react";
import type { DescriptionImprovement } from "@/lib/ai-description";

type DescriptionImprovementDialogProps = {
  original: string;
  improvement: DescriptionImprovement;
  onAccept: () => void;
  onClose: () => void;
};

export function DescriptionImprovementDialog({
  original,
  improvement,
  onAccept,
  onClose,
}: DescriptionImprovementDialogProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="ai-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="ai-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ai-dialog-header">
          <div>
            <p className="eyebrow">AI writing assistant</p>
            <h2 id={titleId}>Review suggested description</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="Close suggestion">×</button>
        </div>

        <div className="ai-comparison">
          <article>
            <span>Original</span>
            <p>{original}</p>
          </article>
          <article className="ai-suggestion-card">
            <span>Suggestion</span>
            <p>{improvement.suggestion}</p>
          </article>
        </div>

        <p className="ai-explanation">{improvement.explanation}</p>

        <div className="ai-dialog-actions">
          <button className="button secondary" type="button" onClick={onClose}>Keep original</button>
          {improvement.changed && (
            <button className="button primary" type="button" onClick={onAccept}>Use suggestion</button>
          )}
        </div>
      </section>
    </div>
  );
}
