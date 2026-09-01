"use client";

import { useState } from "react";
import { REASON_LABELS, REJECTION_REASONS, type RejectionReason } from "./lib";

type Props = {
  initialReason: RejectionReason | null;
  initialComment: string;
  busy: boolean;
  onConfirm: (reason: RejectionReason | null, comment: string | null) => Promise<boolean>;
  onClose: () => void;
};

export function RejectSheet({ initialReason, initialComment, busy, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState<RejectionReason | null>(initialReason);
  const [comment, setComment] = useState(initialComment);
  const [failed, setFailed] = useState(false);

  const submit = async (chosenReason: RejectionReason | null) => {
    setFailed(false);
    const trimmed = comment.trim();
    const saved = await onConfirm(chosenReason, trimmed === "" ? null : trimmed);
    if (!saved) setFailed(true);
  };

  return (
    <>
      <div className="rv-scrim" onClick={busy ? undefined : onClose} />
      <div className="rv-sheet" role="dialog" aria-modal="true" aria-label="Reject this shot">
        <h2 className="rv-serif">Why isn&rsquo;t it right?</h2>
        <p className="rv-sheethint">Optional — pick a reason, add a note, or just reject.</p>

        <div className="rv-chips">
          {REJECTION_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`rv-chip${reason === r ? " rv-chip-sel" : ""}`}
              aria-pressed={reason === r}
              disabled={busy}
              onClick={() => setReason((current) => (current === r ? null : r))}
            >
              {REASON_LABELS[r]}
            </button>
          ))}
        </div>

        <textarea
          className="rv-comment"
          placeholder="Anything else? (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={busy}
        />

        {failed && <p className="rv-sheeterr">Couldn&rsquo;t save that — give it another try.</p>}

        <button
          type="button"
          className="rv-btn rv-confirm"
          disabled={busy}
          onClick={() => void submit(reason)}
        >
          {busy ? "Saving…" : "Reject this shot"}
        </button>
        <div className="rv-sheetrow">
          <button type="button" className="rv-textbtn" disabled={busy} onClick={() => void submit(null)}>
            Skip reason &amp; reject
          </button>
          <button type="button" className="rv-textbtn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
