import { PDFDocument } from "pdf-lib";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth";

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

    const invoiceBytes = await invoice.arrayBuffer();
    const invoicePdf = await PDFDocument.load(invoiceBytes);

    return NextResponse.json({
      pageCount: invoicePdf.getPageCount(),
    });
  } catch {
    return NextResponse.json(
      { message: "PDF page count read nahi ho paya." },
      { status: 500 },
    );
  }
}