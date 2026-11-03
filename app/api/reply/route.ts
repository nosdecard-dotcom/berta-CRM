import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({ error: "En preparación" }, { status: 501 }); }
