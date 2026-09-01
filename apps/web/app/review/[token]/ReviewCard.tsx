"use client";

import { useState } from "react";
import {
  assetUrl,
  contextLine,
  REASON_LABELS,
  type DecisionInfo,
  type PendingEntry,
} from "./lib";

export function ReviewCard({
  entry,
  decision,
}: {
  entry: PendingEntry;
  decision: DecisionInfo | null;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [comparing, setComparing] = useState(false);

  const showingPackshot = comparing && entry.packshotUrl !== null;
  const name = entry.productName ?? entry.sku;

  return (
    <div className="rv-card">
      <div
        className={`rv-imagewrap${zoomed ? " rv-zoomed" : ""}${showingPackshot ? " rv-packshot" : ""}`}
        onClick={() => setZoomed((z) => !z)}
        role="button"
        aria-label={zoomed ? "Zoom out" : "Zoom in"}
      >
        {showingPackshot ? (
          <img src={entry.packshotUrl ?? undefined} alt={`Original packshot for ${name}`} />
        ) : (
          <img src={assetUrl(entry.assetPublicId)} alt={name} />
        )}
        {showingPackshot && <span className="rv-tag">Original packshot</span>}
      </div>

      {entry.packshotUrl && (
        <div className="rv-pillrow">
          <button
            type="button"
            className={`rv-pill${showingPackshot ? " rv-pill-on" : ""}`}
            onClick={() => setComparing((c) => !c)}
          >
            {showingPackshot ? "Back to the shot" : "Compare with original"}
          </button>
        </div>
      )}

      <div className="rv-meta">
        <p className="rv-sku">{entry.sku}</p>
        <h1 className="rv-name rv-serif">{name}</h1>
        <p className="rv-idea rv-serif">&ldquo;{entry.shotIdea}&rdquo;</p>
        <p className="rv-context">{contextLine(entry)}</p>
      </div>

      {decision && (
        <div
          className={`rv-decided ${decision.decision === "APPROVED" ? "rv-decided-yes" : "rv-decided-no"}`}
        >
          {decision.decision === "APPROVED"
            ? "You approved this one."
            : `You rejected this one${decision.reason ? ` — ${REASON_LABELS[decision.reason]}` : ""}.`}
          {decision.comment && (
            <span className="rv-decided-note">&ldquo;{decision.comment}&rdquo;</span>
          )}
        </div>
      )}
    </div>
  );
}
