import { describe, expect, it } from "vitest";
import type { StudyAttempt } from "../src/lib/study";
import { canSubmitAnswer } from "../src/lib/study-state";
import { applyChoiceDrop, applyYesNoDrop } from "../src/lib/drag-drop";

const single: Extract<StudyAttempt["questions"][number], { kind: "single" }> = {
  id: "00000000-0000-4000-8000-000000000021",
  position: 0,
  category: "Networks",
  prompt: "Choose one",
  choices: [
    { label: "A", text: "First" },
    { label: "B", text: "Second" },
  ],
  kind: "single",
  response: null,
  feedback: null,
};

const multiple: Extract<StudyAttempt["questions"][number], { kind: "multiple" }> = {
  ...single,
  id: "00000000-0000-4000-8000-000000000022",
  kind: "multiple",
};

const yesNo: Extract<StudyAttempt["questions"][number], { kind: "yes_no" }> = {
  id: "00000000-0000-4000-8000-000000000023",
  position: 0,
  category: "Networks",
  prompt: "Choose true or false",
  choices: [
    { label: "A", text: "First" },
    { label: "B", text: "Second" },
  ],
  kind: "yes_no",
  response: null,
  feedback: null,
};

describe("drag/drop response mapping", () => {
  it("creates exactly one selected label for a single choice", () => {
    const dropped = applyChoiceDrop(single, ["A"], "B");
    expect(dropped).toEqual({ ok: true, response: ["B"] });
    expect(dropped.ok && canSubmitAnswer(single, dropped.response)).toBe(true);
  });

  it("adds and removes distinct multiple-choice labels", () => {
    expect(applyChoiceDrop(multiple, null, "A")).toEqual({ ok: true, response: ["A"] });
    expect(applyChoiceDrop(multiple, ["A"], "B")).toEqual({ ok: true, response: ["A", "B"] });
    expect(applyChoiceDrop(multiple, ["A", "B"], "A")).toEqual({ ok: true, response: ["B"] });
  });

  it("updates only the selected yes/no statement", () => {
    expect(applyYesNoDrop(yesNo, { A: false }, "B", true)).toEqual({
      ok: true,
      response: { A: false, B: true },
    });
  });

  it("requires every yes/no statement to complete submission", () => {
    const partial = applyYesNoDrop(yesNo, null, "A", true);
    expect(partial.ok).toBe(true);
    expect(partial.ok && canSubmitAnswer(yesNo, partial.response)).toBe(false);

    const complete = partial.ok
      ? applyYesNoDrop(yesNo, partial.response, "B", false)
      : null;
    expect(complete).toEqual({ ok: true, response: { A: true, B: false } });
    expect(complete?.ok && canSubmitAnswer(yesNo, complete.response)).toBe(true);
  });

  it("rejects labels outside the question and incompatible current shapes", () => {
    expect(applyChoiceDrop(single, null, "Z")).toMatchObject({ ok: false });
    expect(applyChoiceDrop(single, { A: true }, "A")).toMatchObject({ ok: false });
    expect(applyChoiceDrop(multiple, ["A", "A"], "B")).toMatchObject({ ok: false });
    expect(applyYesNoDrop(yesNo, ["A"], "A", true)).toMatchObject({ ok: false });
    expect(applyYesNoDrop(yesNo, { Z: true }, "A", true)).toMatchObject({ ok: false });
  });
});
