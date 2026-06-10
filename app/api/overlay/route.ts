import { readFile } from "fs/promises";
import path from "path";
import {
  BlendMode,
  PDFArray,
  PDFDict,
  PDFDocument,
PDFEmbeddedPage,
PDFImage,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth";

type Company = "star" | "service";
type OverlayMode = "header" | "stamp" | "both";

type StampBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PageOverlay = {
  page: number;
  mode: OverlayMode;
  stamp?: StampBox;
};

type OverlayCacheItem = {
  pdf: PDFDocument;
  embeddedPage: PDFEmbeddedPage;
};
type StampImageCacheItem = {
  image: PDFImage;
};
function addLinkAnnotation(
  pdf: PDFDocument,
  page: ReturnType<PDFDocument["getPage"]>,
  rect: [number, number, number, number],
  uri: string,
) {
  const context = pdf.context;

  const linkAnnotation = context.register(
    context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Link"),
      Rect: context.obj(rect.map((value) => PDFNumber.of(value))),
      Border: context.obj([0, 0, 0]),
      A: context.obj({
        Type: PDFName.of("Action"),
        S: PDFName.of("URI"),
        URI: PDFString.of(uri),
      }),
    }),
  );

  const annots =
    page.node.lookupMaybe(PDFName.of("Annots"), PDFArray) ?? context.obj([]);

  annots.push(linkAnnotation);
  page.node.set(PDFName.of("Annots"), annots);
}

function getPdfStringValue(value: unknown) {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText();
  }

  return null;
}

function copyOverlayLinksToInvoicePage(
  sourcePdf: PDFDocument,
  targetPdf: PDFDocument,
  targetPage: ReturnType<PDFDocument["getPage"]>,
) {
  const sourcePage = sourcePdf.getPage(0);
  const sourceAnnots = sourcePage.node.lookupMaybe(PDFName.of("Annots"), PDFArray);

  if (!sourceAnnots) return;

  const sourceSize = sourcePage.getSize();
  const targetSize = targetPage.getSize();

  const scaleX = targetSize.width / sourceSize.width;
  const scaleY = targetSize.height / sourceSize.height;

  for (let i = 0; i < sourceAnnots.size(); i += 1) {
    const annot = sourceAnnots.lookup(i, PDFDict);
    const subtype = annot.lookupMaybe(PDFName.of("Subtype"), PDFName);

    if (subtype?.toString() !== "/Link") continue;

    const rectArray = annot.lookupMaybe(PDFName.of("Rect"), PDFArray);
    if (!rectArray || rectArray.size() !== 4) continue;

    const action = annot.lookupMaybe(PDFName.of("A"), PDFDict);
    if (!action) continue;

    const uriValue = action.lookup(PDFName.of("URI"));
    const uri = getPdfStringValue(uriValue);

    if (!uri) continue;

    const x1 = rectArray.lookup(0, PDFNumber).asNumber() * scaleX;
    const y1 = rectArray.lookup(1, PDFNumber).asNumber() * scaleY;
    const x2 = rectArray.lookup(2, PDFNumber).asNumber() * scaleX;
    const y2 = rectArray.lookup(3, PDFNumber).asNumber() * scaleY;

    addLinkAnnotation(targetPdf, targetPage, [x1, y1, x2, y2], uri);
  }
}

function isCompany(value: FormDataEntryValue | null): value is Company {
  return value === "star" || value === "service";
}

function isOverlayMode(value: unknown): value is OverlayMode {
  return value === "header" || value === "stamp" || value === "both";
}

function isValidStampBox(value: unknown): value is StampBox {
  if (typeof value !== "object" || value === null) return false;

  const stamp = value as Record<string, unknown>;

  return (
    typeof stamp.x === "number" &&
    Number.isFinite(stamp.x) &&
    typeof stamp.y === "number" &&
    Number.isFinite(stamp.y) &&
    typeof stamp.width === "number" &&
    Number.isFinite(stamp.width) &&
    stamp.width > 0 &&
    typeof stamp.height === "number" &&
    Number.isFinite(stamp.height) &&
    stamp.height > 0
  );
}

function parsePageOverlays(value: FormDataEntryValue | null): PageOverlay[] {
  if (typeof value !== "string") {
    throw new Error("Page overlays missing hai.");
  }

  const parsed = JSON.parse(value);

  if (!Array.isArray(parsed)) {
    throw new Error("Page overlays invalid hai.");
  }

  const pageOverlays: PageOverlay[] = parsed.map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !Number.isInteger(item.page) ||
      item.page < 1 ||
      !isOverlayMode(item.mode)
    ) {
      throw new Error("Page overlays invalid hai.");
    }

    return {
      page: item.page,
      mode: item.mode,
      stamp: isValidStampBox(item.stamp) ? item.stamp : undefined,
    };
  });

  if (pageOverlays.length === 0) {
    throw new Error("Kam se kam ek page overlay select karo.");
  }

  return pageOverlays;
}

function getOverlayFileName(company: Company, type: "header" | "stamp") {
  return `${company}-${type}.pdf`;
}

function drawFullPageOverlay(
  page: ReturnType<PDFDocument["getPage"]>,
  embeddedPage: PDFEmbeddedPage,
) {
  const { width, height } = page.getSize();

  page.drawPage(embeddedPage, {
    x: 0,
    y: 0,
    width,
    height,
  });
}

function drawStampOverlay(
  page: ReturnType<PDFDocument["getPage"]>,
  stampImage: PDFImage,
  stamp: StampBox,
) {
  const { height } = page.getSize();

  page.drawImage(stampImage, {
    x: stamp.x,
    y: height - stamp.y - stamp.height,
    width: stamp.width,
    height: stamp.height,
    blendMode: BlendMode.Multiply,
  });
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName())?.value;

    if (!verifySessionToken(token)) {
      return NextResponse.json(
        { message: "Unauthorized access." },
        { status: 401 },
      );
    }

    const formData = await request.formData();

    const invoice = formData.get("invoice");
    const companyRaw = formData.get("company");
    const pageOverlaysRaw = formData.get("pageOverlays");

    if (!(invoice instanceof File)) {
      return NextResponse.json(
        { message: "Invoice PDF missing hai." },
        { status: 400 },
      );
    }

    if (invoice.type !== "application/pdf") {
      return NextResponse.json(
        { message: "Sirf PDF file allowed hai." },
        { status: 400 },
      );
    }

    if (!isCompany(companyRaw)) {
      return NextResponse.json(
        { message: "Company invalid hai." },
        { status: 400 },
      );
    }

    let pageOverlays: PageOverlay[];

    try {
      pageOverlays = parsePageOverlays(pageOverlaysRaw);
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "Page overlays invalid hai.",
        },
        { status: 400 },
      );
    }

    const invoiceBytes = await invoice.arrayBuffer();
    const invoicePdf = await PDFDocument.load(invoiceBytes);
    const totalPages = invoicePdf.getPageCount();

    const validPageOverlays = pageOverlays.filter(
      (item) => item.page >= 1 && item.page <= totalPages,
    );

    if (validPageOverlays.length === 0) {
      return NextResponse.json(
        { message: "Selected page PDF ke andar nahi hai." },
        { status: 400 },
      );
    }

const overlayCache = new Map<"header", OverlayCacheItem>();
let stampImageCache: StampImageCacheItem | null = null;

   async function getOverlay(type: "header"): Promise<OverlayCacheItem> {
      const cached = overlayCache.get(type);
      if (cached) return cached;

      const overlayPath = path.join(
        process.cwd(),
        "private",
        "headers",
        getOverlayFileName(companyRaw as Company, type),
      );

      const overlayBytes = await readFile(overlayPath);
      const overlayPdf = await PDFDocument.load(overlayBytes);
      const [embeddedPage] = await invoicePdf.embedPdf(overlayPdf, [0]);

      const overlay: OverlayCacheItem = {
        pdf: overlayPdf,
        embeddedPage,
      };

      overlayCache.set(type, overlay);
      return overlay;
    }
async function getStampImage(): Promise<StampImageCacheItem> {
  if (stampImageCache) return stampImageCache;

const stampPath = path.join(
  process.cwd(),
  "public",
  companyRaw === "star"
    ? "star-stamp-sign.png"
    : "service-stamp-sign.png",
);
  const stampBytes = await readFile(stampPath);
  const image = await invoicePdf.embedPng(stampBytes);

  stampImageCache = { image };
  return stampImageCache;
}
    for (const item of validPageOverlays) {
      const page = invoicePdf.getPage(item.page - 1);
      const { width, height } = page.getSize();

      if (item.mode === "header" || item.mode === "both") {
        const header = await getOverlay("header");
        drawFullPageOverlay(page, header.embeddedPage);
        copyOverlayLinksToInvoicePage(header.pdf, invoicePdf, page);
      }

      if (item.mode === "stamp" || item.mode === "both") {
       const stamp = await getStampImage();

drawStampOverlay(page, stamp.image, item.stamp ?? {
  x: 0,
  y: 0,
  width,
  height,
});
      }
    }

    const finalPdfBytes = await invoicePdf.save();

    const finalPdfBuffer = finalPdfBytes.buffer.slice(
      finalPdfBytes.byteOffset,
      finalPdfBytes.byteOffset + finalPdfBytes.byteLength,
    ) as ArrayBuffer;

    return new Response(finalPdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.name}"`,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "PDF overlay process failed." },
      { status: 500 },
    );
  }
}