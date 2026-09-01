export const css = `
:root { color-scheme: light; }
body { margin: 0; background: #faf7f2; }

.rv-root {
  min-height: 100vh;
  min-height: 100dvh;
  background: #faf7f2;
  color: #26221c;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  display: flex;
  justify-content: center;
  -webkit-font-smoothing: antialiased;
}
.rv-frame {
  width: 100%;
  max-width: 520px;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.rv-serif { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; }

.rv-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 18px;
  min-height: 60px;
}
.rv-navbtn {
  appearance: none;
  border: none;
  background: none;
  color: #26221c;
  font: inherit;
  font-size: 16px;
  min-height: 48px;
  padding: 0 8px;
  margin: 0 -8px;
  border-radius: 12px;
  cursor: pointer;
}
.rv-navbtn:disabled { opacity: 0.35; cursor: default; }
.rv-progress {
  font-size: 14px;
  color: #8a8177;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
}

.rv-notice {
  margin: 0 18px 12px;
  padding: 12px 16px;
  border-radius: 14px;
  background: #f1e9db;
  color: #5c5344;
  font-size: 14px;
  line-height: 1.45;
}
.rv-error {
  margin: 12px 18px 0;
  padding: 12px 16px;
  border-radius: 14px;
  background: #f6e9e2;
  color: #8c4326;
  font-size: 14px;
  line-height: 1.4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rv-error button {
  appearance: none;
  border: none;
  background: #8c4326;
  color: #fdf9f4;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 0 16px;
  min-height: 48px;
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.rv-card { display: flex; flex-direction: column; flex: 1; padding: 0 18px; }
.rv-imagewrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 20px;
  background: #eee7db;
  overflow: hidden;
  cursor: zoom-in;
}
.rv-imagewrap img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rv-imagewrap.rv-packshot img { object-fit: contain; background: #ffffff; }
.rv-imagewrap.rv-zoomed {
  overflow: auto;
  cursor: zoom-out;
  -webkit-overflow-scrolling: touch;
}
.rv-imagewrap.rv-zoomed img {
  width: 200%;
  height: auto;
  max-width: none;
  object-fit: unset;
}
.rv-tag {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(38, 34, 28, 0.72);
  color: #faf7f2;
  font-size: 12px;
  letter-spacing: 0.06em;
  padding: 6px 12px;
  border-radius: 999px;
  pointer-events: none;
}

.rv-pillrow { display: flex; justify-content: center; margin-top: 12px; }
.rv-pill {
  min-height: 48px;
  padding: 0 20px;
  border-radius: 999px;
  border: 1.5px solid #ddd3c4;
  background: #fffdf9;
  color: #26221c;
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}
.rv-pill-on { background: #26221c; border-color: #26221c; color: #faf7f2; }

.rv-meta { padding: 18px 2px 8px; }
.rv-sku {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8a8177;
}
.rv-name { margin: 4px 0 0; font-size: 26px; font-weight: 500; line-height: 1.15; }
.rv-idea { margin: 12px 0 0; font-style: italic; font-size: 17px; line-height: 1.5; color: #45403a; }
.rv-context { margin: 10px 0 0; font-size: 13px; color: #8a8177; }

.rv-decided {
  margin-top: 16px;
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.45;
}
.rv-decided-yes { background: #e8eee6; color: #33523d; }
.rv-decided-no { background: #f6e9e2; color: #8c4326; }
.rv-decided-note { display: block; font-style: italic; opacity: 0.85; margin-top: 2px; }

.rv-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 12px;
  padding: 16px 18px calc(16px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, #faf7f2 75%, rgba(250, 247, 242, 0));
}
.rv-btn {
  appearance: none;
  border: none;
  min-height: 58px;
  border-radius: 18px;
  font: inherit;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.06s ease;
}
.rv-btn:active { transform: scale(0.98); }
.rv-btn:disabled { opacity: 0.55; cursor: default; transform: none; }
.rv-approve { flex: 1.4; background: #33523d; color: #fbf8f3; }
.rv-rejectbtn { flex: 1; background: #fffdf9; border: 1.5px solid #e0cfc2; color: #8c4326; }

.rv-scrim {
  position: fixed;
  inset: 0;
  background: rgba(31, 27, 22, 0.45);
  z-index: 40;
  animation: rv-fade 0.18s ease;
}
.rv-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0 auto;
  max-width: 520px;
  background: #fffdf9;
  border-radius: 24px 24px 0 0;
  padding: 22px 20px calc(18px + env(safe-area-inset-bottom));
  z-index: 41;
  animation: rv-rise 0.22s ease-out;
  box-shadow: 0 -12px 40px rgba(38, 34, 28, 0.12);
}
.rv-sheet h2 { margin: 0; font-size: 21px; font-weight: 500; }
.rv-sheethint { margin: 6px 0 16px; font-size: 14px; color: #8a8177; }
.rv-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.rv-chip {
  min-height: 48px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1.5px solid #ddd3c4;
  background: #fffdf9;
  color: #26221c;
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}
.rv-chip-sel { background: #8c4326; border-color: #8c4326; color: #fdf9f4; }
.rv-comment {
  width: 100%;
  box-sizing: border-box;
  min-height: 76px;
  border: 1.5px solid #ddd3c4;
  border-radius: 14px;
  padding: 12px 14px;
  font: inherit;
  font-size: 15px;
  background: #fffdf9;
  color: #26221c;
  resize: vertical;
}
.rv-comment:focus { outline: 2px solid rgba(51, 82, 61, 0.25); border-color: #b9ac99; }
.rv-sheeterr { margin: 10px 0 0; font-size: 14px; color: #8c4326; }
.rv-confirm { width: 100%; margin-top: 16px; background: #8c4326; color: #fdf9f4; }
.rv-sheetrow { display: flex; justify-content: space-between; margin-top: 6px; }
.rv-textbtn {
  appearance: none;
  border: none;
  background: none;
  font: inherit;
  font-size: 15px;
  color: #5c5344;
  min-height: 48px;
  padding: 0 10px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: #c9beae;
  border-radius: 12px;
}

.rv-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 28px calc(32px + env(safe-area-inset-bottom));
}
.rv-center h1 { margin: 14px 0 4px; font-size: 30px; font-weight: 500; line-height: 1.15; }
.rv-center p { margin: 5px 0; font-size: 15px; line-height: 1.55; color: #5c5344; max-width: 36ch; }
.rv-center p.rv-counts { font-size: 17px; color: #26221c; }
.rv-donemark {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #33523d;
  color: #fbf8f3;
  font-size: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rv-center .rv-pill { margin-top: 22px; }
.rv-center .rv-textbtn { margin-top: 8px; }
.rv-loading { color: #8a8177; font-size: 15px; animation: rv-pulse 1.4s ease-in-out infinite; }

@keyframes rv-fade { from { opacity: 0; } }
@keyframes rv-rise { from { transform: translateY(24px); opacity: 0.6; } }
@keyframes rv-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }

@media (min-width: 560px) {
  .rv-root { background: #f2ece2; }
  .rv-frame { background: #faf7f2; box-shadow: 0 0 0 1px #e7dfd2; }
}
`;
