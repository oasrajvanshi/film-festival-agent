// Reads the festival from a Google Sheet (shared "anyone with the link can view").
// Usher's own layout comes back as a festival; with ?tabs=1 every tab comes
// back as rows, so a sheet in the festival's own layout can go through the
// same matcher as uploaded files.
import { fetchSheetTables, sheetIdFrom, tablesToFestival } from '../../../src/data/sheet';
import { fetchWorkbook } from '../../../src/onboard/workbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const param = q.get('sheet') ?? process.env.FESTIVAL_SHEET_ID ?? '';
  if (!param) return Response.json({ configured: false });
  const id = sheetIdFrom(param);
  if (!id) return Response.json({ error: 'That doesn\'t look like a Google Sheets link.' }, { status: 400 });
  try {
    if (q.get('tabs') === '1') return Response.json({ configured: true, sheetId: id, tabs: await fetchWorkbook(id) });
    const tables = await fetchSheetTables(id);
    const r = tablesToFestival(tables);
    return Response.json({ configured: true, sheetId: id, ...r });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
