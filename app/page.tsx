"use client";

import { useEffect, useMemo, useState } from "react";
import { Rnd } from "react-rnd";

type Company = "star" | "service";
type OverlayMode = "none" | "header" | "stamp" | "both";

type StampBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PreviewPage = {
  src: string;
  width: number;
  height: number;
};

type PageOverlay = {
  page: number;
  mode: OverlayMode;
  stamp: StampBox;
};

const PDF_RENDER_SCALE = 2.5;
const STAR_STAMP_ASPECT = 386 / 627;
const SERVICE_STAMP_ASPECT = 410 / 627; // example, adjust after checking

const modeLabels: Record<OverlayMode, string> = {
  none: "No Overlay",
  header: "Header",
  stamp: "Stamp",
  both: "Header + Stamp",
};

export default function Home() {
  const [stampPreview, setStampPreview] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [company, setCompany] = useState<Company>("star");
  const [pageCount, setPageCount] = useState(0);
  const [pageOverlays, setPageOverlays] = useState<PageOverlay[]>([]);
  const [previews, setPreviews] = useState<PreviewPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [activePage, setActivePage] = useState(1);
  const [zoomPage, setZoomPage] = useState<number | null>(null);
const [zoomLevel, setZoomLevel] = useState(1);

  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const activeOverlay = pageOverlays.find((item) => item.page === activePage);

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
useEffect(() => {
  setStampPreview(
    company === "star"
      ? "/star-stamp-sign.png"
      : "/service-stamp-sign.png"
  );
}, [company]);

  async function handleLogin() {
    setLoginLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Login failed.");

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
    setSelectedPages([]);
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

      const images: PreviewPage[] = [];

      for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i);
        const renderViewport = page.getViewport({ scale: PDF_RENDER_SCALE });
const displayViewport = page.getViewport({ scale: 1 });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) continue;

        canvas.width = renderViewport.width;
canvas.height = renderViewport.height;

        await page.render({
          canvasContext: context as any,
          viewport: renderViewport,
          canvas: canvas as any,
        } as any).promise;

        images.push({
  src: canvas.toDataURL("image/jpeg", 0.95),
  width: displayViewport.width,
  height: displayViewport.height,
});
      }

      setPageCount(pdf.numPages);
      setPreviews(images);
      setActivePage(1);
      setSelectedPages([]);

setPageOverlays(
  images.map((preview, i) => {
const stampWidth =
  company === "service"
    ? preview.width * 0.186
    : preview.width * 0.20;

    const stampAspect =
      company === "service"
        ? SERVICE_STAMP_ASPECT
        : STAR_STAMP_ASPECT;

    const stampHeight = stampWidth * stampAspect;

    const defaultX = preview.width - stampWidth - 10;

    const defaultY =
      company === "service"
        ? preview.height - stampHeight - 45
        : preview.height - stampHeight - 30;

    return {
      page: i + 1,
      mode: "none",
      stamp: {
        x: defaultX,
        y: defaultY,
        width: stampWidth,
        height: stampHeight,
      },
    };
  }),
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
    setSelectedPages([]);

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

  function setPageStamp(page: number, stamp: StampBox) {
    setPageOverlays((prev) =>
      prev.map((item) => (item.page === page ? { ...item, stamp } : item)),
    );
  }

  function moveActiveStamp(dx: number, dy: number) {
    if (!activeOverlay) return;

    setPageStamp(activePage, {
      ...activeOverlay.stamp,
      x: activeOverlay.stamp.x + dx,
      y: activeOverlay.stamp.y + dy,
    });
  }

  function resetActiveStamp() {
    const preview = previews[activePage - 1];
    if (!preview) return;

    setPageStamp(activePage, {
      x: 0,
      y: 0,
      width: preview.width,
      height: preview.height,
    });
  }
function movePageStamp(page: number, dx: number, dy: number) {
  const overlay = pageOverlays.find((item) => item.page === page);
  if (!overlay) return;

  setPageStamp(page, {
    ...overlay.stamp,
    x: overlay.stamp.x + dx,
    y: overlay.stamp.y + dy,
  });
}

function closeZoomEditor() {
  setZoomPage(null);
  setZoomLevel(1);
}
  function toggleSelectedPage(page: number) {
    setSelectedPages((prev) =>
      prev.includes(page)
        ? prev.filter((item) => item !== page)
        : [...prev, page],
    );
  }

  function selectAllPages() {
    setSelectedPages(Array.from({ length: pageCount }, (_, i) => i + 1));
  }

  function clearSelectedPages() {
    setSelectedPages([]);
  }

  function applyActiveToSelected() {
    if (!activeOverlay) return;

    if (selectedPages.length === 0) {
      alert("Pehle pages select karo.");
      return;
    }

    setPageOverlays((prev) =>
      prev.map((item) =>
        selectedPages.includes(item.page)
          ? {
              ...item,
              mode: activeOverlay.mode,
              stamp: { ...activeOverlay.stamp },
            }
          : item,
      ),
    );
  }

  function applyModeToAll(mode: OverlayMode) {
    setPageOverlays((prev) => prev.map((item) => ({ ...item, mode })));
  }

 function convertStampToPdf(stamp: StampBox) {
  return stamp;
}

  async function handleSubmit() {
    if (!invoiceFile) {
      alert("Invoice PDF select karo.");
      return;
    }

    const activeOverlays = pageOverlays
      .filter((item) => item.mode !== "none")
      .map((item) => ({
        page: item.page,
        mode: item.mode,
        stamp: convertStampToPdf(item.stamp),
      }));

    if (activeOverlays.length === 0) {
      alert("Kam se kam ek page par overlay select karo.");
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
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between rounded-3xl bg-white p-5 shadow-sm">
          <div>
            <h1 className="text-2xl font-black">PDF Overlay Tool</h1>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Stamp full A4 layer hai. White background preview me transparent jaisa dikhega.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Logout
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <aside className="h-fit rounded-3xl bg-white p-5 shadow-sm">
            <label className="mb-2 block text-xs font-black">Invoice PDF</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => handleInvoiceChange(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-slate-300 p-3 text-xs"
            />

            <div className="mt-5">
              <label className="mb-2 block text-xs font-black">Company</label>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setCompany("star")}
                  className={`rounded-xl border p-3 text-xs font-black ${
                    company === "star"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  STAR ENGINEERING
                </button>

                <button
                  type="button"
                  onClick={() => setCompany("service")}
                  className={`rounded-xl border p-3 text-xs font-black ${
                    company === "service"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  SERVICE INDIA
                </button>
              </div>
            </div>

            {pageCount > 0 && activeOverlay && (
              <>

                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black">Bulk Overlay Mode</p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {(["none", "header", "stamp", "both"] as OverlayMode[]).map(
                      (mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => applyModeToAll(mode)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black hover:bg-slate-100"
                        >
                          {modeLabels[mode]}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="mt-5 rounded-2xl border border-slate-200 p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Pages</span>
                <b>{pageCount}</b>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-slate-500">Overlay Pages</span>
                <b>{activeCount}</b>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !invoiceFile || activeCount === 0}
              className="mt-5 w-full rounded-2xl bg-slate-900 py-4 text-xs font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Processing..." : "Confirm & Download PDF"}
            </button>
          </aside>

          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Page Preview</h2>
            <p className="mb-4 mt-1 text-xs font-semibold text-slate-500">
              Page pe click karo. Stamp layer ko drag karo ya left/right/up/down buttons use karo.
            </p>

            {previewLoading && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-500">
                PDF preview loading...
              </div>
            )}

            {!previewLoading && previews.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-500">
                PDF upload karne ke baad preview dikhega.
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {previews.map((preview, index) => {
                const page = index + 1;
                const overlay = pageOverlays.find((item) => item.page === page);
                const selectedMode = overlay?.mode ?? "none";
                const isSelected = selectedPages.includes(page);
                const isActive = activePage === page;
                const showStamp =
                  selectedMode === "stamp" || selectedMode === "both";

                return (
                  <div
                    key={page}
                    onClick={() => setActivePage(page)}
                    onDoubleClick={() => {
setActivePage(page);
setZoomLevel(1);
setZoomPage(page);
}}
                    className={`overflow-hidden rounded-2xl border bg-white transition ${
                      isActive
                        ? "border-slate-900 ring-2 ring-slate-200"
                        : selectedMode !== "none"
                          ? "border-emerald-500"
                          : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 p-3">
                      <label
                        className="flex items-center gap-2 text-xs font-black"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectedPage(page)}
                        />
                        Page {page}
                      </label>

                      <span className="text-[10px] font-black text-slate-500">
                        {modeLabels[selectedMode]}
                      </span>
                    </div>

                    <div className="p-3">
                      <div
                        className="relative mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white"
                     style={{
  width: preview.width * 0.15,
  height: preview.height * 0.15,
}}
                      >
                        <img
                          src={preview.src}
                          alt={`Page ${page}`}
                          className="absolute left-0 top-0 block"
                         width={preview.width * 0.45}
height={preview.height * 0.45}
                          draggable={false}
                        />

                        {showStamp && overlay && (
                          <Rnd
                            size={{
                         width: overlay.stamp.width * 0.45,
height: overlay.stamp.height * 0.45,
                            }}
                            position={{
                           x: overlay.stamp.x * 0.45,
y: overlay.stamp.y * 0.45,
                            }}
                          bounds="parent"
                            disableDragging={!isActive}
                            enableResizing={isActive}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setActivePage(page);
                            }}
                            onDragStop={(_, data) => {
                              setPageStamp(page, {
                                ...overlay.stamp,
                               x: data.x / 0.45,
y: data.y / 0.45,
                              });
                            }}
                            onResizeStop={(_, __, ref, ___, position) => {
                              setPageStamp(page, {
                                x: position.x,
                                y: position.y,
                                width: Number(ref.style.width.replace("px", "")) / 0.45,
height: Number(ref.style.height.replace("px", "")) / 0.45,
                              });
                            }}
                          className={`z-20 bg-transparent ${
                              isActive
                                ? "outline outline-2 outline-blue-500"
                                : ""
                            }`}
                          >
                            {stampPreview ? (
                              <img
                                src={stampPreview}
                                alt="Stamp Preview"
                                className="pointer-events-none h-full w-full select-none object-contain"
                                draggable={false}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-blue-500 bg-blue-50 text-[10px] font-black text-blue-700">
                                STAMP
                              </div>
                            )}
                          </Rnd>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 p-3">
                      <button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    setActivePage(page);
    setZoomPage(page);
  }}
  className="mb-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
>
  Edit Large
</button>
                      <select
                        value={selectedMode}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setPageMode(page, e.target.value as OverlayMode)
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-black outline-none"
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
      {zoomPage !== null && (() => {
  const preview = previews[zoomPage - 1];
  const overlay = pageOverlays.find((item) => item.page === zoomPage);

  if (!preview || !overlay) return null;

  const showStamp = overlay.mode === "stamp" || overlay.mode === "both";

  return (
<div className="fixed inset-0 z-50 overflow-auto bg-black/80 p-4">
     <div className="flex min-h-full flex-col rounded-3xl bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-black">Large Editor - Page {zoomPage}</h2>
            <p className="text-xs font-semibold text-slate-500">
              Stamp layer ko drag/resize karo. Arrow buttons se fine adjust karo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[1, 1.5, 2, 3].map((zoom) => (
              <button
                key={zoom}
                type="button"
                onClick={() => setZoomLevel(zoom)}
                className={`rounded-xl border px-3 py-2 text-xs font-black ${
                  zoomLevel === zoom
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {Math.round(zoom * 100)}%
              </button>
            ))}

            <button
              type="button"
              onClick={closeZoomEditor}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white"
            >
              Close
            </button>
          </div>
        </div>

   <div className="flex-1 overflow-auto">

        <div className="overflow-auto bg-slate-300 p-12">
            <div
              className="relative mx-auto overflow-hidden border border-slate-400 bg-white shadow-2xl"
            style={{
  width: preview.width * zoomLevel * 0.55,
  height: preview.height * zoomLevel * 0.55,
}}
            >
              <img
                src={preview.src}
                alt={`Page ${zoomPage}`}
                className="absolute left-0 top-0 block"
            width={preview.width * zoomLevel * 0.55}
height={preview.height * zoomLevel * 0.55}
                draggable={false}
              />

              {showStamp && (
                <Rnd
                  size={{
                 width: overlay.stamp.width * zoomLevel * 0.55,
height: overlay.stamp.height * zoomLevel * 0.55,
                  }}
                  position={{
                  x: overlay.stamp.x * zoomLevel * 0.55,
y: overlay.stamp.y * zoomLevel * 0.55,
                  }}
                  bounds="parent"
                  onDragStop={(_, data) => {
                    setPageStamp(zoomPage, {
                      ...overlay.stamp,
                     x: data.x / (zoomLevel * 0.55),
y: data.y / (zoomLevel * 0.55),
                    });
                  }}
                  onResizeStop={(_, __, ref, ___, position) => {
                    setPageStamp(zoomPage, {
x: position.x / (zoomLevel * 0.55),
y: position.y / (zoomLevel * 0.55),
width: Number(ref.style.width.replace("px", "")) / (zoomLevel * 0.55),
height: Number(ref.style.height.replace("px", "")) / (zoomLevel * 0.55),
                    });
                  }}
                  className="z-20 bg-transparent outline outline-2 outline-blue-500"
                >
                  {stampPreview ? (
                    <img
                      src={stampPreview}
                      alt="Stamp Preview"
                     className="pointer-events-none h-full w-full select-none object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-blue-500 bg-blue-50 text-xs font-black text-blue-700">
                      STAMP
                    </div>
                  )}
                </Rnd>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
})()}
    </main>
  );
}