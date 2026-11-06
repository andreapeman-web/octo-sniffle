// Generates a synthetic question file for performance testing: node scripts/gen-bench-pack.mjs 20000 > bench.json
const n = Number(process.argv[2] ?? 20000);
const tags = ["pharmacology", "airway", "physiology", "regional", "emergencies", "preop", "monitoring", "paediatrics", "obstetrics", "icu"];
const questions = Array.from({ length: n }, (_, i) => ({
  id: `bench-${i}`,
  tags: [tags[i % tags.length], tags[(i * 7) % tags.length]],
  type: i % 10 === 0 ? "typed" : "single",
  question: `Benchmark question ${i}: which option is number ${(i % 4) + 1}? ${"Filler text to reach a realistic length. ".repeat(4)}`,
  ...(i % 10 === 0 ? { answer: `Answer ${i}` } : { options: ["Option one", "Option two", "Option three", "Option four"], answer: "ABCD"[i % 4] }),
  explanation: `Explanation for question ${i}. ${"More explanatory text. ".repeat(6)}`,
  difficulty: (i % 5) + 1,
}));
process.stdout.write(JSON.stringify({ format: "study-rpg-questions", version: 1, title: `Benchmark ${n}`, questions }));
