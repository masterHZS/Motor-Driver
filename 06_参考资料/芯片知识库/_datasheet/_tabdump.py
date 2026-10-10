import sys, pymupdf

pdf, page_no = sys.argv[1], int(sys.argv[2])
doc = pymupdf.open(pdf)
page = doc.load_page(page_no - 1)
tabs = page.find_tables()
print("tables found:", len(tabs.tables))
for ti, t in enumerate(tabs.tables):
    print("=" * 60)
    print("TABLE", ti, "rows", t.row_count, "cols", t.col_count)
    for r in t.extract():
        print(" | ".join("" if c is None else c.replace("\n", " ").strip() for c in r))
