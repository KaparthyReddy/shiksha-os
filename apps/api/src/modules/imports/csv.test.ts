import { describe, it, expect } from "vitest";
import { CsvError, MAX_ROWS, parseCsv } from "./csv";

const aliases = {
  name: ["full_name"],
  email: ["e_mail"],
  roll_no: ["rollno"],
};

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, a BOM and header spellings", () => {
    const text = '\uFEFFName,E-mail,Roll No.\r\n"Doe, Jane",jane@x.com,A-1\r\n"Say ""hi""",b@x.com,A-2\r\n';
    const p = parseCsv(text, aliases);
    expect(p.columns).toEqual(["name", "email", "roll_no"]);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]!.values).toEqual({ name: "Doe, Jane", email: "jane@x.com", roll_no: "A-1" });
    expect(p.rows[1]!.values.name).toBe('Say "hi"');
    expect(p.rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it("detects semicolon-separated files", () => {
    const p = parseCsv("name;email;roll_no\nA;a@x.com;1\n", aliases);
    expect(p.delimiter).toBe(";");
    expect(p.rows[0]!.values.email).toBe("a@x.com");
  });

  it("skips blank lines but keeps real line numbers", () => {
    const p = parseCsv("name,email,roll_no\n\nA,a@x.com,1\n\nB,b@x.com,2", aliases);
    expect(p.rows.map((r) => r.line)).toEqual([3, 5]);
  });

  it("keeps multi-line quoted values and counts their lines", () => {
    const p = parseCsv('name,email,roll_no\n"A\nB",a@x.com,1\nC,c@x.com,2\n', aliases);
    expect(p.rows[0]!.values.name).toBe("A\nB");
    expect(p.rows.map((r) => r.line)).toEqual([2, 4]);
  });

  it("flags rows with extra values, but not a harmless trailing separator", () => {
    const p = parseCsv("name,email,roll_no\nA,a@x.com,1,extra\nB,b@x.com,2,\n", aliases);
    expect(p.rows[0]!.tooManyColumns).toBe(true);
    expect(p.rows[1]!.tooManyColumns).toBe(false);
  });

  it("reports ignored columns", () => {
    const p = parseCsv("name,email,roll_no,Favorite Color\nA,a@x.com,1,blue\n", aliases);
    expect(p.ignoredColumns).toEqual(["Favorite Color"]);
  });

  it("rejects an unclosed quote, a repeated column, an empty file and a header-only file", () => {
    expect(() => parseCsv('name,email\n"abc,a@x.com\n', aliases)).toThrow(CsvError);
    expect(() => parseCsv("name,Name\nA,B\n", aliases)).toThrow(CsvError);
    expect(() => parseCsv("   \n", aliases)).toThrow(CsvError);
    expect(() => parseCsv("name,email,roll_no\n", aliases)).toThrow(CsvError);
  });

  it("enforces the row limit", () => {
    const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `N${i},n${i}@x.com,${i}`).join("\n");
    expect(() => parseCsv(`name,email,roll_no\n${rows}\n`, aliases)).toThrow(/Too many rows/);
  });
});
