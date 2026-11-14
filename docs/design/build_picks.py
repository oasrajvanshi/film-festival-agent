"""Build the picks board: thumbnails of every generated asset plus picks.html.

    python3 build_picks.py

Reads the images under docs/design (assets/, explore/, round3/, round4/,
round5/), writes web-sized copies to board/, and writes picks.html with the
asset list embedded. Approvals themselves live in the artifact's database,
never in this file.
"""

import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE / "board"

# Type pairings, rendered live on the board (all SIL Open Font License, all on
# Google Fonts). d = display face, t = text face, m = utility face for times
# and places; dv / tv are font-variation-settings, wm scales the wordmark.
TYPE = [
    dict(id="f1", code="F1", name="Imbue + Geist", why="Condensed Didone. Fashion-film classic, tall and quiet.",
         d="'Imbue', 'Bodoni Moda', serif", dv="'opsz' 100", dw=500, wm=1.3,
         t="'Geist', system-ui, sans-serif", m="'Courier Prime', 'Courier New', monospace", fonts="Imbue, Geist, Courier Prime"),
    dict(id="f2", code="F2", name="Instrument Serif + Instrument Sans", why="Narrow serif with a soft italic. Calm and literary.",
         d="'Instrument Serif', Georgia, serif", dw=400, wm=1.2, italic2=True,
         t="'Instrument Sans', system-ui, sans-serif", m="'Courier Prime', 'Courier New', monospace", fonts="Instrument Serif, Instrument Sans, Courier Prime"),
    dict(id="f3", code="F3", name="Gloock + Schibsted Grotesk", why="High contrast with odd, sharp details. A cinematheque poster.",
         d="'Gloock', Georgia, serif", dw=400, wm=1.0,
         t="'Schibsted Grotesk', system-ui, sans-serif", m="'DM Mono', monospace", fonts="Gloock, Schibsted Grotesk, DM Mono"),
    dict(id="f4", code="F4", name="Fraunces Soft + Bricolage", why="Soft, slightly wonky 1970s serif. Warm like a matinee.",
         d="'Fraunces', Georgia, serif", dv="'opsz' 144, 'SOFT' 100, 'WONK' 1", dw=560, wm=1.0,
         t="'Bricolage Grotesque', system-ui, sans-serif", tv="'opsz' 14", m="'Courier Prime', 'Courier New', monospace", fonts="Fraunces, Bricolage Grotesque, Courier Prime"),
    dict(id="f5", code="F5", name="Bodoni Moda + Inter Tight", why="Classic Didone with razor hairlines and an italic. Gala night.",
         d="'Bodoni Moda', 'Didot', serif", dv="'opsz' 96", dw=500, wm=1.0, italic2=True,
         t="'Inter Tight', system-ui, sans-serif", m="'Geist Mono', monospace", fonts="Bodoni Moda, Inter Tight, Geist Mono"),
    dict(id="f6", code="F6", name="Brygada 1918 + Familjen Grotesk", why="A Polish book face from 1918, revived. Old Europe, clean cut.",
         d="'Brygada 1918', Georgia, serif", dw=600, wm=1.0,
         t="'Familjen Grotesk', system-ui, sans-serif", m="'Courier Prime', 'Courier New', monospace", fonts="Brygada 1918, Familjen Grotesk, Courier Prime"),
    dict(id="f7", code="F7", name="Big Shoulders + Instrument Sans", why="Condensed marquee gothic, like the sign over a theatre door.",
         d="'Big Shoulders Display', 'Impact', sans-serif", dw=800, wm=1.45, upper=True,
         t="'Instrument Sans', system-ui, sans-serif", m="'DM Mono', monospace", fonts="Big Shoulders Display, Instrument Sans, DM Mono"),
    dict(id="f8", code="F8", name="Libre Caslon Condensed + Hanken", why="Narrow Caslon. An old programme booklet, trimmed tight.",
         d="'Libre Caslon Condensed', Georgia, serif", dw=500, wm=1.3,
         t="'Hanken Grotesk', system-ui, sans-serif", m="'Courier Prime', 'Courier New', monospace", fonts="Libre Caslon Condensed, Hanken Grotesk, Courier Prime"),
    dict(id="f9", code="F9", name="Bricolage Grotesque", why="A grotesk with ink traps, squeezed. Modern, a little strange.",
         d="'Bricolage Grotesque', system-ui, sans-serif", dv="'opsz' 96, 'wdth' 75", dw=700, wm=1.15,
         t="'Bricolage Grotesque', system-ui, sans-serif", tv="'opsz' 14", m="'Courier Prime', 'Courier New', monospace", fonts="Bricolage Grotesque, Courier Prime"),
    dict(id="f10", code="F10", name="Newsreader Display + Geist", why="Editorial serif with a light italic. Film review in a broadsheet.",
         d="'Newsreader', Georgia, serif", dv="'opsz' 72", dw=400, wm=1.05, italic2=True,
         t="'Geist', system-ui, sans-serif", m="'Geist Mono', monospace", fonts="Newsreader, Geist, Geist Mono"),
    dict(id="f11", code="F11", name="Young Serif + Geist", why="Heavy old-style serif. Warm, bookish, a little retro.",
         d="'Young Serif', Georgia, serif", dw=400, wm=0.95,
         t="'Geist', system-ui, sans-serif", m="'Geist Mono', monospace", fonts="Young Serif, Geist, Geist Mono"),
    dict(id="f12", code="F12", name="Archivo Expanded (now)", why="What the boards use today, for comparison.",
         d="'Archivo', system-ui, sans-serif", dv="'wdth' 125", dw=800, wm=0.85,
         t="'Archivo', system-ui, sans-serif", m="'DM Mono', monospace", fonts="Archivo, DM Mono"),
]

# (id, source, code, name) grouped by round, newest first.
GROUPS = [
    ("Round 6 · Type", "type", TYPE),
    ("Round 5 · UI and brand", "tall", [
        ("u1", "round5/u1-onboarding.jpg", "U1", "Onboarding, role choice"),
        ("u2", "round5/u2-agenda.jpg", "U2", "Attendee agenda"),
        ("u3", "round5/u3-snow-alert.jpg", "U3", "Snow alert"),
        ("u4", "round5/u4-team-mobile.jpg", "U4", "Team mobile, guest late"),
        ("u6", "round5/u6-pass.jpg", "U6", "Festival pass"),
        ("u7", "round5/u7-programme.jpg", "U7", "Programme poster"),
        ("u8", "round5/u8-staff.jpg", "U8", "Staff shift"),
    ]),
    ("Round 5 · Team desktop", "wide", [
        ("u5", "round5/u5-team-desktop.jpg", "U5", "Team calendar, desktop"),
    ]),
    ("Round 5 · Icons", "square", [
        ("c1", "round5/c1-objects.jpg", "C1", "Photographed objects"),
        ("c2", "round5/c2-3d.jpg", "C2", "Matte 3D"),
        ("c3", "round5/c3-pins.jpg", "C3", "Enamel pins"),
        ("c4", "round5/c4-emboss.jpg", "C4", "Blind emboss"),
    ]),
    ("Round 4 · Photos", "tall", [
        ("l1", "round4/l1-stairs.jpg", "L1", "Stairs"),
        ("l2", "round4/l2-projector.jpg", "L2", "Projector beam"),
        ("l3", "round4/l3-doorway.jpg", "L3", "Open door"),
        ("s1", "round4/s2-chair.jpg", "S1", "Director's chair"),
        ("s2", "round4/s3-tickets.jpg", "S2", "Tickets"),
        ("s3", "round4/s1-reels.jpg", "S3", "Film reels"),
        ("m1", "round4/m1-chairs.jpg", "M1", "Empty hall"),
        ("m2", "round4/m2-audience.jpg", "M2", "Audience"),
    ]),
    ("Round 3 · Photos", "tall", [
        ("r1", "round3/b1-seats.jpg", "R1", "Red seats"),
        ("r2", "round3/b2-stills.jpg", "R2", "Three stills"),
        ("r3", "round3/b3-snow.jpg", "R3", "Snow on brick"),
        ("r4", "round3/b4-chairs.jpg", "R4", "Chairs from above"),
    ]),
    ("Round 3 · Illustration", "wide", [
        ("p", "round3/i1-people.jpg", "P", "Roles"),
        ("o", "round3/i2-objects.jpg", "O", "Objects"),
        ("a", "round3/i3-alerts.jpg", "A", "Alerts"),
    ]),
    ("Round 2 · Backgrounds", "tall", [
        ("b1", "explore/b1-camera.jpg", "B1", "Camera"),
        ("b2", "explore/b2-house.jpg", "B2", "Full house"),
        ("b3", "explore/b3-film.jpg", "B3", "Film strips"),
        ("b4", "explore/b4-tickets.jpg", "B4", "Tickets"),
        ("b5", "explore/b5-umbrellas.jpg", "B5", "Umbrellas"),
        ("b6", "explore/b6-bulbs.jpg", "B6", "Marquee bulbs"),
    ]),
    ("Round 2 · Illustration", "wide", [
        ("i1", "explore/i1-riso.jpg", "I1", "Risograph"),
        ("i2", "explore/i2-polish.jpg", "I2", "Polish poster"),
        ("i3", "explore/i3-midcentury.jpg", "I3", "Mid-century"),
        ("i4", "explore/i4-matchbook.jpg", "I4", "Matchbook"),
        ("i5", "explore/i5-linocut.jpg", "I5", "Linocut"),
        ("i6", "explore/i6-cutpaper.jpg", "I6", "Cut paper"),
        ("i7", "explore/i7-halftone.jpg", "I7", "Halftone"),
        ("i8", "explore/i8-stickers.jpg", "I8", "Stickers"),
    ]),
    ("Round 1 · Mood board photos", "card", [
        ("w1", "assets/seats.jpg", "W1", "Red seats"),
        ("k1", "assets/card-raincoat.jpg", "K1", "Raincoat"),
        ("k2", "assets/card-booth.jpg", "K2", "Ticket booth"),
        ("k3", "assets/card-usher.jpg", "K3", "Usher"),
        ("k4", "assets/card-snow.jpg", "K4", "Snow"),
        ("k5", "assets/card-arrival.jpg", "K5", "Arrival"),
        ("k6", "assets/card-ticket.jpg", "K6", "Ticket"),
    ]),
    ("Round 1 · Ink icons", "cutout", [
        ("n1", "assets/ink-ticket.webp", "N1", "Ticket"),
        ("n2", "assets/ink-clapper.webp", "N2", "Clapper"),
        ("n3", "assets/ink-flashlight.webp", "N3", "Flashlight"),
        ("n4", "assets/ink-snow.webp", "N4", "Snow"),
        ("n5", "assets/ink-suitcase.webp", "N5", "Suitcase"),
        ("n6", "assets/ink-projector.webp", "N6", "Projector"),
    ]),
    ("Round 1 · Collage pieces", "cutout", [
        ("t1", "assets/film-strip.webp", "T1", "Film strip"),
        ("t2", "assets/halftone.webp", "T2", "Halftone"),
        ("t3", "assets/paper-1.webp", "T3", "Paper scrap 1"),
        ("t4", "assets/paper-2.webp", "T4", "Paper scrap 2"),
        ("t5", "assets/paper-3.webp", "T5", "Paper scrap 3"),
        ("t6", "assets/paper-black.webp", "T6", "Black paper"),
        ("t7", "assets/paper-red-1.webp", "T7", "Red paper 1"),
        ("t8", "assets/paper-red-2.webp", "T8", "Red paper 2"),
        ("t9", "assets/tape-1.webp", "T9", "Tape 1"),
        ("t10", "assets/tape-2.webp", "T10", "Tape 2"),
    ]),
]


def thumb(src: Path, ident: str) -> tuple[str, int, int]:
    im = Image.open(src)
    alpha = im.mode in ("RGBA", "LA", "P") and src.suffix == ".webp"
    longest = 1200 if not alpha else 800
    im.thumbnail((longest, longest), Image.LANCZOS)
    if alpha:
        name = f"{ident}.webp"
        im.convert("RGBA").save(OUT / name, quality=82, method=6)
    else:
        name = f"{ident}.jpg"
        im.convert("RGB").save(OUT / name, quality=80, optimize=True, progressive=True)
    return f"board/{name}", im.width, im.height


def main() -> None:
    OUT.mkdir(exist_ok=True)
    groups = []
    for title, shape, items in GROUPS:
        rows = []
        if shape == "type":
            groups.append({"title": title, "shape": shape, "items": [dict(kind="type", **t) for t in items],
                           "note": "All open source (SIL Open Font License). Courier Prime is the open screenplay typeface, so times and places use it in most pairings."})
            continue
        for ident, rel, code, name in items:
            src = HERE / rel
            if not src.exists():
                print("missing", rel)
                continue
            path, w, h = thumb(src, ident)
            rows.append({"id": ident, "src": path, "code": code, "name": name, "w": w, "h": h})
        if rows:
            groups.append({"title": title, "shape": shape, "items": rows})
    template = (HERE / "picks.template.html").read_text()
    data = json.dumps(groups, ensure_ascii=False, separators=(",", ":"))
    (HERE / "picks.html").write_text(template.replace("/*ASSETS*/[]", data))
    print(sum(len(g["items"]) for g in groups), "assets")


if __name__ == "__main__":
    main()
