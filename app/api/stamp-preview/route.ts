import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

type Company = "star" | "service";

function isCompany(value: string | null): value is Company {
  return value === "star" || value === "service";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const company = url.searchParams.get("company");

    if (!isCompany(company)) {
      return NextResponse.json(
        { message: "Company invalid hai." },
        { status: 400 },
      );
    }

    const stampPath = path.join(
      process.cwd(),
      "private",
      "headers",
      `${company}-stamp.pdf`,
    );

    const stampBytes = await readFile(stampPath);

    return new Response(stampBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "Stamp preview load nahi hua." },
      { status: 500 },
    );
  }
}