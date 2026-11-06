import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fingerprint, mergeResults, parseCsv, parseQuestionFile } from "../src/lib/parse";

describe("question files", () => {
  it("accepts the bundled sample set without errors", () => {
    const r = parseQuestionFile("sample.json", readFileSync("public/sample-questions.json", "utf8"));
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.questions).toHaveLength(30);
    const multi = r.questions.find((q) => q.id === "smp-005")!;
    expect(multi.correct).toEqual([0, 1]);
    expect(r.questions.find((q) => q.id === "smp-028")!.correct).toEqual([1]); // false
  });

  it("reports missing answers, bad letters, numeric answers and duplicates", () => {
    const r = parseQuestionFile("x.json", JSON.stringify({ questions: [
      { id: "a", question: "Q1", options: ["x", "y"], answer: "B" },
      { id: "a", question: "Q2", options: ["x", "y"], answer: "A" },
      { id: "b", question: "Q3", options: ["x", "y"] },
      { id: "c", question: "Q4", options: ["x", "y"], answer: "E" },
      { id: "d", question: "Q5", options: ["x", "y"], answer: 1 },
      { id: "e", question: "Q1", options: ["x", "y"], answer: "x" },
    ] }));
    const msgs = r.issues.map((i) => `${i.level}:${i.id}:${i.message}`);
    expect(msgs.some((m) => m.startsWith("error:a:duplicate id"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("error:b:missing answer"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("error:c:answer \"E\""))).toBe(true);
    expect(msgs.some((m) => m.startsWith("error:d:numeric answers"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("warning:e:same question text"))).toBe(true);
    expect(r.questions.map((q) => q.id)).toEqual(["a", "e"]);
    expect(r.questions[1].correct).toEqual([0]); // answer given as option text
  });

  it("keeps doses and units verbatim", () => {
    const r = parseQuestionFile("x.json", JSON.stringify([{ question: "Dose?", options: ["0.5 mg (500 µg)", "1:1000"], answer: "A" }]));
    expect(r.questions[0].options[0]).toBe("0.5 mg (500 µg)");
    expect(r.questions[0].key).toBe(fingerprint("Dose?\u00000.5 mg (500 µg)\u00001:1000"));
  });

  it("warns about possible patient identifiers", () => {
    const r = parseQuestionFile("x.json", JSON.stringify([{ question: "Patient Frau Müller, DOB 01.02.1950", answer: "x" }]));
    expect(r.issues.some((i) => i.level === "warning" && /patient data/.test(i.message))).toBe(true);
  });

  it("parses CSV with quotes, semicolons, | options and multi answers", () => {
    const csv = 'id;tags;type;question;options;answer;explanation\n' +
      'c1;pharm|airway;multi;"Which; ""both""?";A thing|B thing|C thing;"A;C";"line1\nline2"\n' +
      'c2;phys;typed;MAP?;;"~93 mmHg";\n';
    expect(parseCsv(csv)[1][3]).toBe('Which; "both"?');
    const r = parseQuestionFile("q.csv", csv);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(r.questions[0].tags).toEqual(["pharm", "airway"]);
    expect(r.questions[0].correct).toEqual([0, 2]);
    expect(r.questions[0].explanation).toBe("line1\nline2");
    expect(r.questions[1].type).toBe("typed");
  });

  it("rejects ids duplicated across files", () => {
    const a = parseQuestionFile("a.json", JSON.stringify([{ id: "x", question: "Q", answer: "y" }]));
    const b = parseQuestionFile("b.json", JSON.stringify([{ id: "x", question: "Q2", answer: "y" }]));
    const m = mergeResults([{ file: "a.json", res: a }, { file: "b.json", res: b }]);
    expect(m.questions).toHaveLength(1);
    expect(m.issues[0].message).toMatch(/also in a.json/);
  });
});
