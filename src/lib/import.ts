import ExcelJS from "exceljs";
import {
  choiceLabels,
  questionSchema,
  type QuestionInput,
} from "./quiz";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_QUESTIONS = 1_000;
const HEADER_SEARCH_ROWS = 20;

const requiredHeaders = [
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
] as const;

type HeaderName = (typeof requiredHeaders)[number];
type HeaderMap = Record<HeaderName, number>;
type ParsedAnswer =
  | Pick<Extract<QuestionInput, { kind: "single" }>, "kind" | "answer">
  | Pick<Extract<QuestionInput, { kind: "multiple" }>, "kind" | "answer">
  | Pick<Extract<QuestionInput, { kind: "yes_no" }>, "kind" | "answer">;

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  questions: QuestionInput[];
  errors: ImportError[];
}

type WorkbookRow = {
  rowNumber: number;
  row: ExcelJS.Row;
};

function failure(message: string, row = 0): ImportResult {
  return { questions: [], errors: [{ row, message }] };
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function headerName(value: unknown): HeaderName | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return requiredHeaders.find(
    (header) => normalizeHeader(header) === normalizeHeader(value),
  );
}

function findHeader(worksheet: ExcelJS.Worksheet):
  | { rowNumber: number; columns: HeaderMap }
  | undefined {
  const lastRow = Math.min(worksheet.rowCount, HEADER_SEARCH_ROWS);

  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    const columns = new Map<HeaderName, number>();
    let hasDuplicate = false;

    worksheet.getRow(rowNumber).eachCell((cell, columnNumber) => {
      const name = headerName(cell.value);
      if (!name) {
        return;
      }

      if (columns.has(name)) {
        hasDuplicate = true;
      } else {
        columns.set(name, columnNumber);
      }
    });

    if (
      !hasDuplicate &&
      requiredHeaders.every((header) => columns.has(header))
    ) {
      return {
        rowNumber,
        columns: Object.fromEntries(columns) as HeaderMap,
      };
    }
  }

  return undefined;
}

function isFormula(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  return (
    cell.type === ExcelJS.ValueType.Formula ||
    (typeof value === "object" &&
      value !== null &&
      ("formula" in value || "sharedFormula" in value))
  );
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.isMerged && cell.master.address !== cell.address) {
    return "";
  }

  const value = cell.value;

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map(({ text }) => text).join("").trim();
  }

  if ("text" in value && typeof value.text === "string") {
    return value.text.trim();
  }

  return "";
}

function populatedCells(row: ExcelJS.Row): ExcelJS.Cell[] {
  const cells: ExcelJS.Cell[] = [];
  row.eachCell((cell) => {
    if (isFormula(cell) || cellText(cell) !== "") {
      cells.push(cell);
    }
  });
  return cells;
}

function isDecorativeChoiceRow(row: ExcelJS.Row, columns: HeaderMap): boolean {
  const cells = populatedCells(row);
  if (cells.length === 0) {
    return false;
  }

  const choiceColumns = new Map<string, string>(
    choiceLabels.map((label) => [
      row.worksheet.getColumn(columns[`Choice ${label}`]).letter,
      label,
    ]),
  );

  return cells.every(
    (cell) =>
      choiceColumns.get(cell.address.replace(/\d+$/, "")) !== undefined &&
      cellText(cell).toUpperCase() ===
        choiceColumns.get(cell.address.replace(/\d+$/, "")),
  );
}

function hasContent(worksheet: ExcelJS.Worksheet): boolean {
  let populated = false;
  worksheet.eachRow((row) => {
    if (populatedCells(row).length > 0) {
      populated = true;
    }
  });
  return populated;
}

function isEmptyRow(row: ExcelJS.Row): boolean {
  return populatedCells(row).length === 0;
}

function rowValue(
  row: ExcelJS.Row,
  columns: HeaderMap,
  header: HeaderName,
): string {
  return cellText(row.getCell(columns[header]));
}

function formulaColumns(
  row: ExcelJS.Row,
  allowedColumn?: number,
): number[] {
  const formulas: number[] = [];
  row.eachCell((cell) => {
    const columnLetters = cell.address.replace(/\d+$/, "");
    const columnNumber = [...columnLetters].reduce(
      (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
      0,
    );
    if (isFormula(cell) && columnNumber !== allowedColumn) {
      formulas.push(columnNumber);
    }
  });
  return formulas;
}

function answerFromText(
  raw: string,
  choiceCount: number,
): ParsedAnswer {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error("Correct Answer is missing.");
  }

  const parsed = tokens.map((token) => {
    const match = /^([A-F])(?:\s*-\s*(YES|NO))?$/i.exec(token);
    if (!match) {
      throw new Error(`Unrecognized answer key "${token}".`);
    }

    return {
      label: match[1].toUpperCase() as (typeof choiceLabels)[number],
      booleanValue: match[2]?.toUpperCase(),
    };
  });

  if (new Set(parsed.map(({ label }) => label)).size !== parsed.length) {
    throw new Error("Correct Answer contains duplicate labels.");
  }

  const yesNoCount = parsed.filter(({ booleanValue }) => booleanValue).length;
  if (yesNoCount > 0 && yesNoCount !== parsed.length) {
    throw new Error("YES/NO answer keys cannot be mixed with plain labels.");
  }

  if (yesNoCount > 0) {
    if (parsed.length !== choiceCount) {
      throw new Error("YES/NO answers must include every available choice.");
    }

    const answer = Object.fromEntries(
      parsed.map(({ label, booleanValue }) => [
        label,
        booleanValue === "YES",
      ]),
    );
    return { kind: "yes_no", answer };
  }

  return parsed.length === 1
    ? { kind: "single", answer: [parsed[0].label] }
    : { kind: "multiple", answer: parsed.map(({ label }) => label) };
}

function answerFromMarks(
  row: ExcelJS.Row,
  columns: HeaderMap,
  choiceLabelsInQuestion: readonly (typeof choiceLabels)[number][],
): ParsedAnswer | undefined {
  const values = choiceLabelsInQuestion.map((label) => ({
    label,
    value: cellText(row.getCell(columns[`Choice ${label}`])).toUpperCase(),
  }));
  const nonempty = values.filter(({ value }) => value !== "");

  if (nonempty.length === 0) {
    return undefined;
  }

  if (nonempty.every(({ value }) => value === "〇" || value === "○" || value === "×")) {
    if (nonempty.length !== choiceLabelsInQuestion.length) {
      throw new Error("Answer marks must be supplied for every choice.");
    }
    const selected = values
      .filter(({ value }) => value === "〇" || value === "○")
      .map(({ label }) => label);
    if (selected.length === 0) {
      throw new Error("At least one answer choice must be marked correct.");
    }

    return selected.length === 1
      ? { kind: "single", answer: selected }
      : { kind: "multiple", answer: selected };
  }

  if (nonempty.every(({ value }) => ["TRUE", "FALSE", "YES", "NO"].includes(value))) {
    if (nonempty.length !== choiceLabelsInQuestion.length) {
      throw new Error("YES/NO answers must be supplied for every choice.");
    }

    return {
      kind: "yes_no",
      answer: Object.fromEntries(
        values.map(({ label, value }) => [
          label,
          value === "TRUE" || value === "YES",
        ]),
      ),
    };
  }

  throw new Error("Unrecognized answer marks; use circles/crosses or YES/NO/TRUE/FALSE.");
}

function answersAgree(left: ParsedAnswer, right: ParsedAnswer): boolean {
  if (left.kind === "yes_no" && right.kind === "yes_no") {
    return (
      Object.keys(left.answer).length === Object.keys(right.answer).length &&
      Object.entries(left.answer).every(
        ([label, value]) => right.answer[label] === value,
      )
    );
  }

  if (left.kind !== "yes_no" && right.kind !== "yes_no") {
    return (
      left.kind === right.kind &&
      left.answer.length === right.answer.length &&
      left.answer.every((label) => right.answer.includes(label))
    );
  }

  return false;
}

function questionFromRows(
  questionRow: ExcelJS.Row,
  answerRow: ExcelJS.Row | undefined,
  columns: HeaderMap,
): { question: QuestionInput } | { error: string; row: number } {
  const questionRowNumber = questionRow.number;
  const formulaColumnsInQuestion = formulaColumns(questionRow);
  if (formulaColumnsInQuestion.length > 0) {
    return {
      error: `Question data cannot contain formulas (column ${formulaColumnsInQuestion[0]}).`,
      row: questionRowNumber,
    };
  }

  const choiceEntries = choiceLabels
    .map((label) => ({
      label,
      text: rowValue(questionRow, columns, `Choice ${label}`),
    }))
    .filter(({ text }) => text !== "");
  const answerSourceRow = answerRow ?? questionRow;
  const answerRowNumber = answerSourceRow.number;
  const answerFormulaColumns = formulaColumns(
    answerSourceRow,
    answerRow ? columns["Correct Answer"] : undefined,
  );
  if (answerFormulaColumns.length > 0) {
    return {
      error: `Question data cannot contain formulas (column ${answerFormulaColumns[0]}).`,
      row: answerRowNumber,
    };
  }

  let parsedAnswer: ReturnType<typeof answerFromText>;
  try {
    const markedAnswer = answerRow
      ? answerFromMarks(
          answerRow,
          columns,
          choiceEntries.map(({ label }) => label),
        )
      : undefined;
    const rawAnswer = rowValue(answerSourceRow, columns, "Correct Answer");
    const explicitAnswer =
      !isFormula(answerSourceRow.getCell(columns["Correct Answer"])) && rawAnswer
        ? answerFromText(rawAnswer, choiceEntries.length)
        : undefined;
    if (
      markedAnswer &&
      explicitAnswer &&
      !answersAgree(markedAnswer, explicitAnswer)
    ) {
      throw new Error("Correct Answer and choice marks disagree.");
    }
    parsedAnswer =
      markedAnswer ??
      explicitAnswer ??
      answerFromText(
        rawAnswer,
        choiceEntries.length,
      );
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Correct Answer is invalid.",
      row: answerRow ? answerRowNumber : questionRowNumber,
    };
  }

  const candidate = {
    category: rowValue(questionRow, columns, "Category"),
    prompt: rowValue(questionRow, columns, "Question"),
    choices: choiceEntries,
    ...parsedAnswer,
    explanation:
      rowValue(answerSourceRow, columns, "Answer explanation") ||
      rowValue(questionRow, columns, "Answer explanation"),
  };
  const result = questionSchema.safeParse(candidate);

  if (!result.success) {
    return {
      error: result.error.issues
        .map((issue) => `${issue.path.join(".") || "Question"}: ${issue.message}`)
        .join("; "),
      row: questionRowNumber,
    };
  }

  return { question: result.data };
}

function isQuestionTypeRow(row: ExcelJS.Row, columns: HeaderMap): boolean {
  return rowValue(row, columns, "Category").toLocaleLowerCase() === "question";
}

function isAnswerTypeRow(row: ExcelJS.Row, columns: HeaderMap): boolean {
  return rowValue(row, columns, "Category").toLocaleLowerCase() === "answer";
}

function parseWorksheet(
  worksheet: ExcelJS.Worksheet,
  header: { rowNumber: number; columns: HeaderMap },
  questions: QuestionInput[],
  errors: ImportError[],
  questionCount: { value: number },
): void {
  const rows: WorkbookRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (
      rowNumber > header.rowNumber &&
      !isEmptyRow(row) &&
      !isDecorativeChoiceRow(row, header.columns)
    ) {
      rows.push({ rowNumber, row });
    }
  });

  for (let index = 0; index < rows.length; index += 1) {
    const { row, rowNumber } = rows[index];
    if (isAnswerTypeRow(row, header.columns)) {
      errors.push({
        row: rowNumber,
        message: "Answer row has no preceding Question row.",
      });
      continue;
    }

    questionCount.value += 1;
    if (questionCount.value > MAX_QUESTIONS) {
      errors.push({
        row: rowNumber,
        message: `Workbook exceeds the ${MAX_QUESTIONS}-question limit.`,
      });
      continue;
    }

    const next = rows[index + 1];
    const answerRow =
      isQuestionTypeRow(row, header.columns) &&
      next &&
      isAnswerTypeRow(next.row, header.columns)
        ? next.row
        : undefined;
    if (answerRow) {
      index += 1;
    }

    const parsed = questionFromRows(row, answerRow, header.columns);
    if ("error" in parsed) {
      errors.push({ row: parsed.row, message: parsed.error });
    } else {
      questions.push(parsed.question);
    }
  }

}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ImportResult> {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return failure("Workbook exceeds the 5 MB upload limit.");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return failure("Could not read workbook; ensure the file is a valid XLSX.");
  }

  const parsedWorksheets = workbook.worksheets.map((worksheet) => ({
    worksheet,
    header: findHeader(worksheet),
  }));
  const sheetsWithHeader = parsedWorksheets.filter(
    (entry): entry is typeof entry & { header: NonNullable<typeof entry.header> } =>
      entry.header !== undefined,
  );

  if (!parsedWorksheets.some(({ worksheet }) => hasContent(worksheet))) {
    return failure("Workbook contains no questions.");
  }

  if (sheetsWithHeader.length === 0) {
    return failure(
      `Could not find all required headers in the first ${HEADER_SEARCH_ROWS} rows.`,
    );
  }

  const questions: QuestionInput[] = [];
  const errors: ImportError[] = [];
  const questionCount = { value: 0 };

  for (const { worksheet, header } of sheetsWithHeader) {
    parseWorksheet(worksheet, header, questions, errors, questionCount);
  }

  for (const { worksheet, header } of parsedWorksheets) {
    if (!header && hasContent(worksheet)) {
      errors.push({
        row: 0,
        message: `Worksheet "${worksheet.name}" contains data but no recognized header.`,
      });
    }
  }

  return questions.length === 0 && errors.length === 0
    ? failure("Workbook contains no questions.")
    : { questions, errors };
}
