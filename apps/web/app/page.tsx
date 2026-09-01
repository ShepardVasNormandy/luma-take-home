"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "./lib/api";
import { shortDate } from "./lib/status";
import { Shell } from "./lib/Shell";
import type { ImportRecord } from "./lib/types";

export default function ImportsPage() {
  const router = useRouter();
  const [imports, setImports] = useState<ImportRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ imports: ImportRecord[] }>("/imports");
      setImports(
        [...data.imports].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api<{ existing: boolean; import: ImportRecord }>("/imports", {
        method: "POST",
        formData,
      });
      router.push(res.existing ? `/imports/${res.import.id}?dup=1` : `/imports/${res.import.id}`);
    } catch (err) {
      setUploadError(errorMessage(err));
      setUploading(false);
    }
  }

  return (
    <Shell>
      <div className="page-head">
        <h1>Imports</h1>
        <p className="page-meta">Each customer CSV handoff, staged for reconciliation.</p>
      </div>

      <div
        className={`dropzone${dragging ? " dragging" : ""}`}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
      >
        {uploading ? (
          "Uploading…"
        ) : (
          <>
            <strong>Upload a catalog CSV</strong>
            <div className="small" style={{ marginTop: 4 }}>
              Drop the file here or click to browse. Staging spends nothing.
            </div>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
      {uploadError ? (
        <p className="error-text" style={{ marginTop: 10 }}>
          Upload failed: {uploadError}
        </p>
      ) : null}

      <div className="section">
        {loadError ? (
          <p className="error-text">Could not load imports: {loadError}</p>
        ) : imports === null ? (
          <p className="muted">Loading…</p>
        ) : imports.length === 0 ? (
          <div className="card card-pad muted">No imports yet — upload the first catalog CSV above.</div>
        ) : (
          <div className="card table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Uploaded</th>
                  <th>Rows</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id}>
                    <td>
                      <Link href={`/imports/${imp.id}`}>{imp.originalFilename}</Link>
                    </td>
                    <td className="muted">{shortDate(imp.createdAt)}</td>
                    <td className="muted">{imp.rowCount}</td>
                    <td>
                      {imp.confirmedAt ? (
                        <span className="chip chip-green">Confirmed</span>
                      ) : (
                        <span className="chip chip-amber">Staged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
