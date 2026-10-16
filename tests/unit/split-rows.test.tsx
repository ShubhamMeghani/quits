import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PayerRows, SplitRows, type SplitMode } from "@/app/g/[token]/expenses/split-rows";

// BUG-1: in the Exact/%/Shares modes the member names were squeezed to zero width because the row
// inputs carried both `w-full` (from inputClass) and a fixed width; Tailwind's stylesheet order made
// `w-full` win. These tests check that every row renders its member's name and that no row input
// has two competing width utilities.

const people = [
  { id: "a", name: "Aarav" },
  { id: "p", name: "Priya" },
  { id: "r", name: "Rohan Kumar" },
];
const noop = () => undefined;

function rows(html: string): string[] {
  return html.split("<li").slice(1);
}

function widthClasses(cls: string): string[] {
  return cls.split(/\s+/).filter((c) => /^w-/.test(c));
}

describe("BUG-1: every split row renders its member's name", () => {
  for (const mode of ["equal", "exact", "percent", "shares"] as SplitMode[]) {
    it(`${mode} mode`, () => {
      const html = renderToStaticMarkup(
        <SplitRows
          people={people}
          me="p"
          mode={mode}
          included={new Set(["a", "p", "r"])}
          exact={{ a: "100.00" }}
          percent={{ a: "50" }}
          shares={{ a: "2" }}
          owed={{ a: "₹100.00" }}
          onToggle={noop}
          onValue={noop}
        />,
      );
      const rs = rows(html);
      expect(rs).toHaveLength(people.length);
      rs.forEach((row, i) => {
        const p = people[i];
        expect(row).toContain(`data-member="${p.id}"`);
        const name = /data-testid="member-name">([^<]*)</.exec(row)?.[1];
        expect(name).toBe(p.id === "p" ? "Priya (you)" : p.name);
        for (const cls of [...row.matchAll(/<input[^>]*class="([^"]*)"/g)].map((m) => m[1])) {
          if (cls.includes("accent-")) continue; // the equal-mode checkbox
          expect(cls.split(/\s+/)).not.toContain("w-full");
          expect(widthClasses(cls)).toHaveLength(1);
          expect(cls.split(/\s+/)).toContain("shrink-0");
        }
      });
      if (mode !== "equal") expect(html).toContain(`id="sp-a"`);
    });
  }

  it("multiple-payer rows", () => {
    const html = renderToStaticMarkup(<PayerRows people={people} me="a" amounts={{ a: "600" }} onValue={noop} />);
    const rs = rows(html);
    expect(rs).toHaveLength(3);
    rs.forEach((row, i) => {
      expect(/data-testid="member-name">([^<]*)</.exec(row)?.[1]).toBe(i === 0 ? "Aarav (you)" : people[i].name);
      const cls = /<input[^>]*class="([^"]*)"/.exec(row)![1];
      expect(widthClasses(cls)).toEqual(["w-32"]);
    });
  });
});
