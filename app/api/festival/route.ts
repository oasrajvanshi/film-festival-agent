// Reads the festival from a Google Sheet (shared "anyone with the link can view").
import { fetchSheetTables, sheetIdFrom, tablesToFestival } from '../../../src/data/sheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get('sheet') ?? process.env.FESTIVAL_SHEET_ID ?? '';
  if (!param) return Response.json({ configured: false });
  const id = sheetIdFrom(param);
  if (!id) return Response.json({ error: 'That doesn\'t look like a Google Sheets link.' }, { status: 400 });
  try {
    const tables = await fetchSheetTables(id);
    const r = tablesToFestival(tables);
    return Response.json({ configured: true, sheetId: id, ...r });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
