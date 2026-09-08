import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return NextResponse.json({ outboundIp: data.ip });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
