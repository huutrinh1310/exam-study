import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseWorkbook, type ImportResult } from "../src/lib/import";

const headers = [
  "No",
  "Category",
  "Question",
  "Choice A",
  "Choice B",
  "Choice C",
  "Choice D",
  "Choice E",
  "Choice F",
  "Correct Answer",
  "Answer explanation",
];

type RowInput = {
  number?: number | string;
  category?: string;
  prompt?: string;
  choices?: string[];
  answer?: string;
  explanation?: string;
};

function addHeader(
  worksheet: ExcelJS.Worksheet,
  rowNumber = 1,
  startColumn = 1,
): void {
  headers.forEach((value, index) => {
    worksheet.getCell(rowNumber, startColumn + index).value = value;
  });
}

function addQuestion(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  input: RowInput = {},
  startColumn = 1,
): void {
  const values = [
    input.number ?? rowNumber,
    input.category ?? "Cloud",
    input.prompt ?? "A sample question?",
    ...Array.from({ length: 6 }, (_, index) =>
      (input.choices ?? ["Choice one", "Choice two", "Choice three"])[index] ??
      "",
    ),
    input.answer ?? "A",
    input.explanation ?? "A sample explanation.",
  ];
  values.forEach((value, index) => {
    worksheet.getCell(rowNumber, startColumn + index).value = value;
  });
}

async function workbookBytes(
  setup: (workbook: ExcelJS.Workbook) => void,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  setup(workbook);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

async function importOneRow(
  configure: (worksheet: ExcelJS.Worksheet) => void,
): Promise<ImportResult> {
  return parseWorkbook(
    await workbookBytes((workbook) => {
      const worksheet = workbook.addWorksheet("Questions");
      configure(worksheet);
    }),
  );
}

describe("parseWorkbook", () => {
  it("imports the CCDF practice workbook with all supported question kinds", async () => {
    const bytes = await readFile(
      new URL("../test-data/ccdf-practice-mock.xlsx", import.meta.url),
    );
    const result = await parseWorkbook(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    );

    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(10);
    expect(result.questions.filter(({ kind }) => kind === "single")).toHaveLength(5);
    expect(result.questions.filter(({ kind }) => kind === "multiple")).toHaveLength(3);
    expect(result.questions.filter(({ kind }) => kind === "yes_no")).toHaveLength(2);
  });

  it("finds a header offset to row 2, skips the decorative labels and blank rows", async () => {
    const result = await importOneRow((worksheet) => {
      worksheet.getCell("B1").value = "Workbook title";
      addHeader(worksheet, 2, 2);
      ["B", "C", "D", "K", "L"].forEach((column) => {
        worksheet.mergeCells(`${column}2:${column}3`);
      });
      ["A", "B", "C", "D", "E", "F"].forEach((label, index) => {
        worksheet.getCell(3, 5 + index).value = label;
      });
      addQuestion(worksheet, 6, { answer: "C" }, 2);
    });

    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      category: "Cloud",
      prompt: "A sample question?",
      answer: ["C"],
      kind: "single",
    });
  });

  it("finds a header on row 20", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet, 20, 2);
      addQuestion(worksheet, 21, { answer: "A" }, 2);
    });

    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });

  it("imports all six choices with their corresponding A-F labels", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, {
        choices: ["A text", "B text", "C text", "D text", "E text", "F text"],
      });
    });

    expect(result.errors).toEqual([]);
    expect(result.questions[0].choices).toEqual(
      ["A", "B", "C", "D", "E", "F"].map((label) => ({
        label,
        text: `${label} text`,
      })),
    );
  });

  it.each([
    ["A", "single", ["A"]],
    ["C , E", "multiple", ["C", "E"]],
    [
      "A-YES , B-NO , C-YES",
      "yes_no",
      { A: true, B: false, C: true },
    ],
  ] as const)("parses answer form %s", async (answer, kind, expected) => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, {
        answer,
        choices:
          answer === "C , E"
            ? ["Choice one", "Choice two", "Choice three", "Choice four", "Choice five"]
            : undefined,
      });
    });

    expect(result.errors).toEqual([]);
    expect(result.questions[0]).toMatchObject({ kind, answer: expected });
  });

  it("joins supplied question and answer rows and derives correct options from circles", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet, 2, 2);
      addQuestion(
        worksheet,
        3,
        {
          category: "Question",
          choices: ["One", "Two", "Three"],
          answer: "",
        },
        2,
      );
      worksheet.getCell("C4").value = "Answer";
      worksheet.getCell("E4").value = "×";
      worksheet.getCell("F4").value = { richText: [{ text: "〇" }] };
      worksheet.getCell("G4").value = "×";
      worksheet.getCell("L4").value = "Because two is correct.";
      worksheet.getCell("K4").value = {
        formula: 'TEXTJOIN(" , ",TRUE,IF(F4="〇","B",""))',
        result: "B",
      };
    });

    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      answer: ["B"],
      kind: "single",
      explanation: "Because two is correct.",
    });
  });

  it("imports multiple correct options from a paired answer row", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, { category: "Question", answer: "" });
      worksheet.getCell("B3").value = "Answer";
      worksheet.getCell("D3").value = "〇";
      worksheet.getCell("E3").value = "×";
      worksheet.getCell("F3").value = "〇";
      worksheet.getCell("G3").value = "×";
      worksheet.getCell("K3").value = "Explanation from answer row";
    });

    expect(result.errors).toEqual([]);
    expect(result.questions[0]).toMatchObject({
      answer: ["A", "C"],
      kind: "multiple",
      explanation: "Explanation from answer row",
    });
  });

  it.each([
    ["Cloud tier", "TRUE", "Regional tier"],
    ["FALSE", "maybe", "TRUE"],
    ["〇", "NO", "×"],
  ])("rejects unrecognized formula-backed marks %j", async (...marks) => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, { category: "Question", answer: "" });
      worksheet.getCell("B3").value = "Answer";
      marks.forEach((mark, index) => {
        worksheet.getCell(3, 4 + index).value = mark;
      });
      worksheet.getCell("J3").value = {
        formula: 'TEXTJOIN(", ",TRUE,IF(E3="TRUE","B-YES","A-NO"))',
        result: "A-NO, B-YES, C-NO",
      };
    });

    expect(result.questions).toEqual([]);
    expect(result.errors).toEqual([
      { row: 3, message: expect.stringMatching(/unrecognized.*mark/i) },
    ]);
  });

  it.each([true, false])("reads explicit boolean marks with formula=%s", async (formula) => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, {
        category: "Question",
        choices: ["One", "Two", "Three", "Four"],
        answer: "",
      });
      worksheet.getCell("B3").value = "Answer";
      ["yEs", "nO", "tRuE", "fAlSe"].forEach((mark, index) => {
        worksheet.getCell(3, 4 + index).value = mark;
      });
      if (formula) {
        worksheet.getCell("J3").value = { formula: '"unused cached answer"' };
      }
    });

    expect(result.errors).toEqual([]);
    expect(result.questions[0]).toMatchObject({
      kind: "yes_no",
      answer: { A: true, B: false, C: true, D: false },
    });
  });

  it.each([
    ["B", ["〇", "×", "×"]],
    ["A-YES, B-NO, C-NO", ["NO", "YES", "NO"]],
    ["A", ["YES", "NO", "NO"]],
    ["Z", ["〇", "×", "×"]],
  ])("rejects explicit answer %s disagreeing with marks", async (answer, marks) => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, { category: "Question", answer: "" });
      worksheet.getCell("B3").value = "Answer";
      marks.forEach((mark, index) => {
        worksheet.getCell(3, 4 + index).value = mark;
      });
      worksheet.getCell("J3").value = answer;
    });

    expect(result.questions).toEqual([]);
    expect(result.errors).toEqual([
      { row: 3, message: expect.stringMatching(/disagree|unrecognized/i) },
    ]);
  });

  it.each([
    ["C, A", ["〇", "×", "〇"], "multiple", ["A", "C"]],
    [
      "C-NO, B-NO, A-YES",
      ["YES", "NO", "NO"],
      "yes_no",
      { A: true, B: false, C: false },
    ],
  ])("accepts matching explicit key %s regardless of order", async (answer, marks, kind, expected) => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, { category: "Question", answer: "" });
      worksheet.getCell("B3").value = "Answer";
      marks.forEach((mark, index) => {
        worksheet.getCell(3, 4 + index).value = mark;
      });
      worksheet.getCell("J3").value = answer;
    });

    expect(result.errors).toEqual([]);
    expect(result.questions[0]).toMatchObject({ kind, answer: expected });
  });

  it.each(["no sheets", "empty sheet", "header only", "decorative only"])(
    "reports no questions for a workbook with %s",
    async (contents) => {
      const result = await parseWorkbook(await workbookBytes((workbook) => {
        if (contents === "no sheets") return;
        const worksheet = workbook.addWorksheet("Questions");
        if (contents === "empty sheet") return;
        addHeader(worksheet);
        if (contents === "decorative only") {
          ["A", "B", "C", "D", "E", "F"].forEach((label, index) => {
            worksheet.getCell(2, 4 + index).value = label;
          });
        }
      }));

      expect(result.questions).toEqual([]);
      expect(result.errors).toEqual([
        { row: 0, message: expect.stringMatching(/no questions/i) },
      ]);
    },
  );

  it("accepts multiple rows separated by blank spacer rows", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, { number: 1 });
      addQuestion(worksheet, 5, { number: 2, answer: "B" });
    });

    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(2);
  });

  it("reports malformed, unknown, and duplicate answer keys with source rows", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, { answer: "A, Z" });
      addQuestion(worksheet, 3, { answer: "A, A" });
      addQuestion(worksheet, 4, { answer: "A-YES, B-NO" });
    });

    expect(result.questions).toEqual([]);
    expect(result.errors.map(({ row }) => row)).toEqual([2, 3, 4]);
  });

  it("rejects formulas in question data", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2);
      worksheet.getCell("C2").value = { formula: '"A computed prompt"' };
    });

    expect(result.questions).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toMatch(/formula/i);
  });

  it("reports missing headers and missing answer keys", async () => {
    const missingHeader = await importOneRow((worksheet) => {
      worksheet.getCell("A1").value = "Question";
      worksheet.getCell("B2").value = "some data";
    });
    const missingKey = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, { answer: "" });
    });

    expect(missingHeader.questions).toEqual([]);
    expect(missingHeader.errors[0].row).toBe(0);
    expect(missingKey.questions).toEqual([]);
    expect(missingKey.errors[0].row).toBe(2);
  });

  it("reports an orphan answer row and other populated invalid rows", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      worksheet.getCell("B2").value = "Answer";
      worksheet.getCell("D2").value = "〇";
      worksheet.getCell("B4").value = 7;
      worksheet.getCell("C4").value = "Cloud";
    });

    expect(result.questions).toEqual([]);
    expect(result.errors.map(({ row }) => row)).toEqual([2, 4]);
  });

  it("requires yes/no answers to describe every choice", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      addQuestion(worksheet, 2, {
        choices: ["One", "Two", "Three"],
        answer: "A-YES, B-NO",
      });
    });

    expect(result.questions).toEqual([]);
    expect(result.errors[0].row).toBe(2);
  });

  it("enforces the uploaded byte limit before parsing", async () => {
    const result = await parseWorkbook(new ArrayBuffer(5 * 1024 * 1024 + 1));

    expect(result.questions).toEqual([]);
    expect(result.errors[0].row).toBe(0);
    expect(result.errors[0].message).toMatch(/5 MB/i);
  });

  it("limits the import to 1000 question rows", async () => {
    const result = await importOneRow((worksheet) => {
      addHeader(worksheet);
      for (let row = 2; row <= 1002; row += 1) {
        addQuestion(worksheet, row);
      }
    });

    expect(result.questions).toHaveLength(1000);
    expect(result.errors.some(({ row }) => row === 1002)).toBe(true);
  });

  it("returns a structured error for corrupt workbook bytes", async () => {
    const bytes = new TextEncoder().encode("not xlsx");
    const result = await parseWorkbook(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    );

    expect(result.questions).toEqual([]);
    expect(result.errors[0].row).toBe(0);
  });
});
