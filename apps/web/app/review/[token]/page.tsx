"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { useParams } from "next/navigation";
import {
  ApiError,
  fetchSession,
  putDecision,
  type Decision,
  type DecisionBody,
  type DecisionInfo,
  type PendingEntry,
  type SessionData,
} from "./lib";
import { ReviewCard } from "./ReviewCard";
import { RejectSheet } from "./RejectSheet";
import { css } from "./styles";

type HistoryItem = { entry: PendingEntry; decision: DecisionInfo };
type Origin = "queue" | number;
type RetryPayload = { entry: PendingEntry; body: DecisionBody; origin: Origin };

type State = {
  phase: "loading" | "ready" | "dead" | "loadError";
  deadCode: string | null;
  counts: { approved: number; rejected: number };
  queue: PendingEntry[];
  history: HistoryItem[];
  cursor: number | null;
  done: number;
  busy: Decision | null;
  retry: RetryPayload | null;
  notice: string | null;
  sheetOpen: boolean;
};

const initial: State = {
  phase: "loading",
  deadCode: null,
  counts: { approved: 0, rejected: 0 },
  queue: [],
  history: [],
  cursor: null,
  done: 0,
  busy: null,
  retry: null,
  notice: null,
  sheetOpen: false,
};

type Action =
  | { type: "LOADED"; data: SessionData }
  | { type: "DEAD"; code: string | null }
  | { type: "LOAD_FAILED" }
  | { type: "RELOAD" }
  | { type: "BUSY"; decision: Decision }
  | { type: "SAVED"; origin: Origin; entry: PendingEntry; body: DecisionBody }
  | { type: "SAVE_FAILED"; retry: RetryPayload | null }
  | { type: "REFRESHED"; data: SessionData | null; notice: string | null; advance: boolean; drop: string | null }
  | { type: "BACK" }
  | { type: "FORWARD" }
  | { type: "SHEET"; open: boolean }
  | { type: "CLEAR_NOTICE" };

const forwardCursor = (cursor: number | null, historyLength: number): number | null =>
  cursor === null ? null : cursor + 1 >= historyLength ? null : cursor + 1;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOADED":
      return {
        ...initial,
        phase: "ready",
        counts: { approved: action.data.counts.approved, rejected: action.data.counts.rejected },
        queue: action.data.pending,
        history: [...action.data.recentlyDecided].reverse().map((d) => ({
          entry: d,
          decision: {
            decision: d.decision.decision,
            reason: d.decision.reason,
            comment: d.decision.comment,
          },
        })),
      };
    case "DEAD":
      return { ...state, phase: "dead", deadCode: action.code, busy: null, sheetOpen: false };
    case "LOAD_FAILED":
      return { ...state, phase: "loadError" };
    case "RELOAD":
      return { ...initial };
    case "BUSY":
      return { ...state, busy: action.decision, retry: null };
    case "SAVED": {
      const info: DecisionInfo = {
        decision: action.body.decision,
        reason: action.body.decision === "REJECTED" ? action.body.reason : null,
        comment: action.body.comment,
      };
      if (action.origin === "queue") {
        return {
          ...state,
          busy: null,
          sheetOpen: false,
          retry: null,
          notice: null,
          queue: state.queue.filter((q) => q.candidateId !== action.entry.candidateId),
          history: [...state.history, { entry: action.entry, decision: info }],
          done: state.done + 1,
          counts:
            info.decision === "APPROVED"
              ? { ...state.counts, approved: state.counts.approved + 1 }
              : { ...state.counts, rejected: state.counts.rejected + 1 },
        };
      }
      const previous = state.history[action.origin]?.decision.decision;
      const counts =
        previous && previous !== info.decision
          ? info.decision === "APPROVED"
            ? { approved: state.counts.approved + 1, rejected: state.counts.rejected - 1 }
            : { approved: state.counts.approved - 1, rejected: state.counts.rejected + 1 }
          : state.counts;
      return {
        ...state,
        busy: null,
        sheetOpen: false,
        retry: null,
        notice: null,
        history: state.history.map((h, i) =>
          i === action.origin ? { ...h, decision: info } : h,
        ),
        counts,
        cursor: forwardCursor(state.cursor, state.history.length),
      };
    }
    case "SAVE_FAILED":
      return { ...state, busy: null, retry: action.retry };
    case "REFRESHED": {
      const pending = action.data ? action.data.pending : state.queue;
      return {
        ...state,
        busy: null,
        sheetOpen: false,
        queue: action.drop ? pending.filter((p) => p.candidateId !== action.drop) : pending,
        counts: action.data
          ? { approved: action.data.counts.approved, rejected: action.data.counts.rejected }
          : state.counts,
        notice: action.notice,
        cursor: action.advance ? forwardCursor(state.cursor, state.history.length) : state.cursor,
      };
    }
    case "BACK":
      return {
        ...state,
        retry: null,
        cursor:
          state.cursor === null
            ? state.history.length > 0
              ? state.history.length - 1
              : null
            : Math.max(0, state.cursor - 1),
      };
    case "FORWARD":
      return { ...state, retry: null, cursor: forwardCursor(state.cursor, state.history.length) };
    case "SHEET":
      return { ...state, sheetOpen: action.open };
    case "CLEAR_NOTICE":
      return { ...state, notice: null };
  }
}

export default function ReviewPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? decodeURIComponent(params.token) : "";
  const [state, dispatch] = useReducer(reducer, initial);

  const load = useCallback(async () => {
    try {
      const data = await fetchSession(token);
      dispatch({ type: "LOADED", data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        dispatch({ type: "DEAD", code: err.code });
      } else {
        dispatch({ type: "LOAD_FAILED" });
      }
    }
  }, [token]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  useEffect(() => {
    if (!state.notice) return;
    const timer = setTimeout(() => dispatch({ type: "CLEAR_NOTICE" }), 6000);
    return () => clearTimeout(timer);
  }, [state.notice]);

  const decide = useCallback(
    async (entry: PendingEntry, body: DecisionBody, origin: Origin): Promise<boolean> => {
      dispatch({ type: "BUSY", decision: body.decision });
      try {
        await putDecision(token, entry.candidateId, body);
        dispatch({ type: "SAVED", origin, entry, body });
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          dispatch({ type: "DEAD", code: err.code });
          return true;
        }
        if (err instanceof ApiError && err.status === 409) {
          const notice =
            origin === "queue"
              ? "This one was withdrawn — on to the next."
              : "This one was withdrawn, so the decision can’t be changed.";
          let data: SessionData | null = null;
          try {
            data = await fetchSession(token);
          } catch (refreshErr) {
            if (refreshErr instanceof ApiError && refreshErr.status === 401) {
              dispatch({ type: "DEAD", code: refreshErr.code });
              return true;
            }
          }
          dispatch({
            type: "REFRESHED",
            data,
            notice,
            advance: origin !== "queue",
            drop: entry.candidateId,
          });
          return true;
        }
        dispatch({
          type: "SAVE_FAILED",
          retry: body.decision === "APPROVED" ? { entry, body, origin } : null,
        });
        return false;
      }
    },
    [token],
  );

  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const data = await fetchSession(token);
      const notice =
        data.pending.length === 0 ? "Checked just now — still nothing new." : null;
      dispatch({ type: "REFRESHED", data, notice, advance: false, drop: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        dispatch({ type: "DEAD", code: err.code });
      }
    } finally {
      setChecking(false);
    }
  }, [token]);

  if (state.phase === "loading" || token === "") {
    return (
      <Shell>
        <div className="rv-center">
          <p className="rv-loading">Getting your shots ready…</p>
        </div>
      </Shell>
    );
  }

  if (state.phase === "dead") {
    return (
      <Shell>
        <DeadLink code={state.deadCode} />
      </Shell>
    );
  }

  if (state.phase === "loadError") {
    return (
      <Shell>
        <div className="rv-center">
          <h1 className="rv-serif">Couldn&rsquo;t load your shots</h1>
          <p>Something got in the way — probably the connection.</p>
          <button
            type="button"
            className="rv-pill"
            onClick={() => {
              dispatch({ type: "RELOAD" });
              void load();
            }}
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  const viewing =
    state.cursor !== null
      ? state.history[state.cursor]
        ? {
            entry: state.history[state.cursor].entry,
            decision: state.history[state.cursor].decision as DecisionInfo | null,
            origin: state.cursor as Origin,
          }
        : null
      : state.queue.length > 0
        ? { entry: state.queue[0], decision: null, origin: "queue" as Origin }
        : null;

  const canGoBack =
    state.cursor === null ? state.history.length > 0 : state.cursor > 0;

  if (!viewing) {
    return (
      <Shell>
        <div className="rv-center">
          <div className="rv-donemark" aria-hidden="true">
            ✓
          </div>
          <h1 className="rv-serif">All caught up</h1>
          <p className="rv-counts">
            {state.counts.approved} approved · {state.counts.rejected} rejected
          </p>
          <p>No pending shots right now.</p>
          <p>
            Every tap was saved on the spot — there&rsquo;s nothing to submit. New shots may
            appear here later, so hold on to this link.
          </p>
          {state.notice && <div className="rv-notice">{state.notice}</div>}
          {state.history.length > 0 && (
            <button type="button" className="rv-pill" onClick={() => dispatch({ type: "BACK" })}>
              Look back at your decisions
            </button>
          )}
          <button
            type="button"
            className="rv-textbtn"
            disabled={checking}
            onClick={() => void refresh()}
          >
            {checking ? "Checking…" : "Check for new shots"}
          </button>
        </div>
      </Shell>
    );
  }

  const { entry, decision, origin } = viewing;
  const busy = state.busy !== null;

  return (
    <Shell>
      <header className="rv-top">
        <button
          type="button"
          className="rv-navbtn"
          disabled={!canGoBack || busy}
          onClick={() => dispatch({ type: "BACK" })}
        >
          ‹ Back
        </button>
        {origin === "queue" ? (
          <span className="rv-progress">
            {state.done + 1} / {state.done + state.queue.length}
          </span>
        ) : (
          <button
            type="button"
            className="rv-navbtn"
            disabled={busy}
            onClick={() => dispatch({ type: "FORWARD" })}
          >
            Next ›
          </button>
        )}
      </header>

      {state.notice && <div className="rv-notice">{state.notice}</div>}

      <ReviewCard key={`${entry.candidateId}-${origin}`} entry={entry} decision={decision} />

      {state.retry && (
        <div className="rv-error" role="alert">
          <span>Couldn&rsquo;t save that — check your connection.</span>
          <button
            type="button"
            onClick={() => {
              const retry = state.retry;
              if (retry) void decide(retry.entry, retry.body, retry.origin);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {decision === null ? (
        <div className="rv-actions">
          <button
            type="button"
            className="rv-btn rv-rejectbtn"
            disabled={busy}
            onClick={() => dispatch({ type: "SHEET", open: true })}
          >
            Reject
          </button>
          <button
            type="button"
            className="rv-btn rv-approve"
            disabled={busy}
            onClick={() =>
              void decide(entry, { decision: "APPROVED", reason: null, comment: null }, origin)
            }
          >
            {state.busy === "APPROVED" ? "Saving…" : "Approve"}
          </button>
        </div>
      ) : (
        <div className="rv-actions" style={{ flexWrap: "wrap" }}>
          <span className="rv-saved">
            Saved: {decision.decision === "APPROVED" ? "Approved ✓" : "Rejected ✓"}
          </span>
          {decision.decision === "APPROVED" ? (
            <button
              type="button"
              className="rv-btn rv-rejectbtn"
              disabled={busy}
              onClick={() => dispatch({ type: "SHEET", open: true })}
            >
              {state.busy === "REJECTED" ? "Saving…" : "Change to reject…"}
            </button>
          ) : (
            <button
              type="button"
              className="rv-btn rv-approve"
              disabled={busy}
              onClick={() =>
                void decide(entry, { decision: "APPROVED", reason: null, comment: null }, origin)
              }
            >
              {state.busy === "APPROVED" ? "Saving…" : "Change to approve"}
            </button>
          )}
          <button
            type="button"
            className="rv-textbtn rv-keep"
            disabled={busy}
            onClick={() => dispatch({ type: "FORWARD" })}
          >
            Keep decision ›
          </button>
        </div>
      )}

      {state.sheetOpen && (
        <RejectSheet
          initialReason={decision?.decision === "REJECTED" ? decision.reason : null}
          initialComment={decision?.decision === "REJECTED" ? (decision.comment ?? "") : ""}
          busy={state.busy === "REJECTED"}
          onConfirm={(reason, comment) =>
            decide(entry, { decision: "REJECTED", reason, comment }, origin)
          }
          onClose={() => dispatch({ type: "SHEET", open: false })}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rv-root">
      <style>{css}</style>
      <div className="rv-frame">{children}</div>
    </div>
  );
}

function DeadLink({ code }: { code: string | null }) {
  const expired = code === "TOKEN_EXPIRED";
  return (
    <div className="rv-center">
      <h1 className="rv-serif">
        {expired ? "This link has expired" : "This review link is no longer valid"}
      </h1>
      <p>
        {expired
          ? "Review links only last thirty days."
          : "It may have been replaced by a newer one."}{" "}
        Ask Maya to send you a fresh one — everything you already reviewed is safely saved.
      </p>
    </div>
  );
}
