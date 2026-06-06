"use client";

import { useEffect, useMemo, useState } from "react";

type Company = "star" | "service";
type OverlayMode = "none" | "header" | "stamp" | "both";

type PageOverlay = {
  page: number;
  mode: OverlayMode;
};

const modeLabels: Record<OverlayMode, string> = {
  none: "No Overlay",
  header: "Header",
  stamp: "Stamp",
  both: "Header + Stamp",
};

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [company, setCompany] = useState<Company>("star");
  const [pageCount, setPageCount] = useState(0);
  const [pageOverlays, setPageOverlays] = useState<PageOverlay[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const activeCount = useMemo(
    () => pageOverlays.filter((item) => item.mode !== "none").length,
    [pageOverlays],
  );

  useEffect(() => {
    async function checkAuth() {
      const response = await fetch("/api/auth/me");
      const data = await response.json();
      setAuthenticated(Boolean(data.authenticated));
      setCheckingAuth(false);
    }

    checkAuth();
  }, []);

  async function handleLogin() {
    setLoginLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed.");
      }

      setAuthenticated(true);
      setPassword("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setInvoiceFile(null);
    setPageCount(0);
    setPageOverlays([]);
    setPreviews([]);
  }

async function renderPdfPreviews(file: File) {
  setPreviewLoading(true);

  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.mjs",
      import.meta.url,
    ).toString();

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    const images: string[] = [];

    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.45 });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) continue;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context as any,
        viewport,
        canvas: canvas as any,
      } as any).promise;

      images.push(canvas.toDataURL("image/jpeg", 0.8));
    }

    setPageCount(pdf.numPages);
    setPreviews(images);

    setPageOverlays(
      Array.from({ length: pdf.numPages }, (_, i) => ({
        page: i + 1,
        mode: "none",
      })),
    );
  } catch (error) {
    console.error(error);
    alert("PDF preview generate nahi ho paya.");
  } finally {
    setPreviewLoading(false);
  }
}

  async function handleInvoiceChange(file: File | null) {
    setInvoiceFile(file);
    setPageCount(0);
    setPageOverlays([]);
    setPreviews([]);

    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("Sirf PDF file select karo.");
      return;
    }

    await renderPdfPreviews(file);
  }

  function setPageMode(page: number, mode: OverlayMode) {
    setPageOverlays((prev) =>
      prev.map((item) => (item.page === page ? { ...item, mode } : item)),
    );
  }

  function applyModeToAll(mode: OverlayMode) {
    setPageOverlays((prev) => prev.map((item) => ({ ...item, mode })));
  }

  async function handleSubmit() {
    if (!invoiceFile) {
      alert("Invoice PDF select karo.");
      return;
    }

    const activeOverlays = pageOverlays.filter((item) => item.mode !== "none");

    if (activeOverlays.length === 0) {
      alert("Kam se kam ek page par Header, Stamp ya Header + Stamp select karo.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("invoice", invoiceFile);
      formData.append("company", company);
      formData.append("pageOverlays", JSON.stringify(activeOverlays));

      const response = await fetch("/api/overlay", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "PDF processing failed.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = invoiceFile.name;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-semibold text-slate-500">Checking security...</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-slate-900">Secure Login</h1>
          <p className="mt-2 text-sm text-slate-500">
            PDF Overlay Tool access karne ke liye login karo.
          </p>

          <div className="mt-6 space-y-4">
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Mobile number ya email"
              className="w-full rounded-xl border border-slate-300 p-4 text-sm outline-none focus:border-slate-900"
            />

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              className="w-full rounded-xl border border-slate-300 p-4 text-sm outline-none focus:border-slate-900"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
            />

            <button
              type="button"
              onClick={handleLogin}
              disabled={loginLoading}
              className="w-full rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {loginLoading ? "Logging in..." : "Login"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 rounded-3xl bg-white p-6 shadow-sm md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold">PDF Overlay Tool</h1>
            <p className="mt-2 text-sm text-slate-500">
              PDF preview ke saath page-wise Header, Stamp ya Header + Stamp select karo.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Logout
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="h-fit rounded-3xl bg-white p-6 shadow-sm">
            <div>
              <label className="mb-2 block text-sm font-semibold">Invoice PDF</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => handleInvoiceChange(e.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-slate-300 p-4 text-sm"
              />
            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-semibold">Company</label>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => setCompany("star")}
                  className={`rounded-xl border p-4 text-sm font-bold transition ${
                    company === "star"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  STAR ENGINEERING
                </button>

                <button
                  type="button"
                  onClick={() => setCompany("service")}
                  className={`rounded-xl border p-4 text-sm font-bold transition ${
                    company === "service"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  SERVICE INDIA
                </button>
              </div>
            </div>

            {pageCount > 0 && (
              <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-bold">Bulk Apply</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(["none", "header", "stamp", "both"] as OverlayMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => applyModeToAll(mode)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      {modeLabels[mode]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-slate-200 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Pages</span>
                <b>{pageCount}</b>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-slate-500">Selected</span>
                <b>{activeCount}</b>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !invoiceFile || activeCount === 0}
              className="mt-6 w-full rounded-2xl bg-slate-900 py-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Processing PDF..." : "Confirm & Download PDF"}
            </button>
          </aside>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Page Preview</h2>
                <p className="text-sm text-slate-500">
                  Har page par dropdown se overlay choose karo.
                </p>
              </div>
            </div>

            {previewLoading && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-semibold text-slate-500">
                PDF preview loading...
              </div>
            )}

            {!previewLoading && previews.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-semibold text-slate-500">
                PDF upload karne ke baad yahan page previews dikhenge.
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {previews.map((src, index) => {
                const page = index + 1;
                const selectedMode =
                  pageOverlays.find((item) => item.page === page)?.mode ?? "none";

                return (
                  <div
                    key={page}
                    className={`overflow-hidden rounded-2xl border bg-slate-50 transition ${
                      selectedMode !== "none"
                        ? "border-emerald-500 ring-2 ring-emerald-100"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="relative bg-white p-3">
                      {selectedMode !== "none" && (
                        <div className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">
                          ✓
                        </div>
                      )}

                      <img
                        src={src}
                        alt={`Page ${page}`}
                        className="mx-auto max-h-[360px] rounded-lg border border-slate-200 bg-white object-contain"
                      />
                    </div>

                    <div className="border-t border-slate-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <b>Page {page}</b>
                        <span className="text-xs font-bold text-slate-500">
                          {modeLabels[selectedMode]}
                        </span>
                      </div>

                      <select
                        value={selectedMode}
                        onChange={(e) =>
                          setPageMode(page, e.target.value as OverlayMode)
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-semibold outline-none focus:border-slate-900"
                      >
                        <option value="none">No Overlay</option>
                        <option value="header">Header Only</option>
                        <option value="stamp">Stamp Only</option>
                        <option value="both">Header + Stamp</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}