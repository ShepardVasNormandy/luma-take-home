"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, errorMessage } from "../../lib/api";
import { shortDate } from "../../lib/status";
import { Shell } from "../../lib/Shell";
import type { ImportDetail } from "../../lib/types";
import { StagedView } from "./StagedView";
import { ConfirmedView } from "./ConfirmedView";

export default function ImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dupNote, setDupNote] = useState(false);

  useEffect(() => {
    setDupNote(new URLSearchParams(window.location.search).has("dup"));
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api<ImportDetail>(`/imports/${id}`);
      setDetail(data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Shell>
      <Link href="/" className="backlink">
        ← Imports
      </Link>

      {error ? (
        <p className="error-text" style={{ marginTop: 16 }}>
          {error}
        </p>
      ) : detail === null ? (
        <p className="muted" style={{ marginTop: 16 }}>
          Loading…
        </p>
      ) : (
        <>
          <div className="page-head">
            <h1>{detail.import.originalFilename}</h1>
            <div className="page-meta">
              <span>Uploaded {shortDate(detail.import.createdAt)}</span>
              <span>·</span>
              <span>{detail.import.rowCount} rows</span>
              {detail.import.confirmedAt ? (
                <span className="chip chip-green">Confirmed {shortDate(detail.import.confirmedAt)}</span>
              ) : (
                <span className="chip chip-amber">Staged — nothing generated yet</span>
              )}
            </div>
          </div>

          {dupNote ? (
            <div className="note" style={{ marginBottom: 18 }}>
              This exact file was already imported — you are looking at the existing import.{" "}
              <button className="btn btn-small" style={{ marginLeft: 8 }} onClick={() => setDupNote(false)}>
                Dismiss
              </button>
            </div>
          ) : null}

          {detail.import.confirmedAt ? (
            <ConfirmedView detail={detail} reloadRows={load} />
          ) : (
            <StagedView detail={detail} reload={load} />
          )}
        </>
      )}
    </Shell>
  );
}
