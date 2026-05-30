// ============================================================
// Chennai NET Academy — Question Prompts v2
// Anti-hallucination + Difficulty Matrix + Verification
// lib/question-prompts-v2.js
// ============================================================

// ── UGC-NET topic context map (ground Claude in real facts) ──
const SUBJECT_CONTEXT = {
  "Paper I": {
    exam: "UGC-NET Paper I (General Paper)",
    board: "National Testing Agency (NTA), India",
    style: "Conceptual, analytical, application-based questions",
    safe_domains: [
      "Teaching aptitude", "Research methodology", "Logical reasoning",
      "Reading comprehension", "Communication", "ICT", "Environment",
      "Higher education system India", "People and environment"
    ],
  },
  "Environmental Sciences": {
    exam: "UGC-NET Environmental Sciences (Paper II)",
    board: "National Testing Agency (NTA), India",
    style: "Scientific, factual, policy and ecological questions",
    safe_domains: [
      "Ecology", "Biodiversity", "Environmental pollution",
      "Climate change", "Environmental laws India",
      "Natural resources", "Environmental impact assessment",
      "Solid waste management", "Atmosphere"
    ],
  },
};

// ── Core anti-hallucination rules injected into every prompt ─
const ANTI_HALLUCINATION_RULES = `
STRICT ACCURACY RULES — FOLLOW WITHOUT EXCEPTION:
1. ONLY state facts you are 100% certain about. If uncertain → use a conceptual/principle-based question instead of a factual one.
2. NEVER invent names, terms, years, statistics, or organizations. Use only real, verifiable information.
3. Distractor options MUST be real terms/concepts — never invent fake scientific names, fake laws, or fake organizations.
4. Year/date questions: only use years you are fully certain about (e.g., Montreal Protocol 1987, Kyoto Protocol 1997).
5. For Indian environmental laws: only use officially enacted laws (Environment Protection Act 1986, Water Act 1974, Air Act 1981, Wildlife Protection Act 1972, Forest Conservation Act 1980).
6. If a question has ANY doubt about factual accuracy → write a conceptual/definition question on the same topic instead.
7. Every correct answer must be UNAMBIGUOUSLY correct — no "best option" ambiguity.
8. All 4 options must be clearly distinct — no overlapping or confusingly similar options.
9. CONFIDENCE: After each question, internally verify: "Am I 100% sure this answer is correct?" If no → rewrite.
`;

// ── Build generation prompt with difficulty + variant ────────
export function buildGenerationPromptV2({
  subject,
  unit,
  topic,
  difficulty = "medium",      // easy | medium | hard
  variant = 1,                // 1 or 2 (for generating 2 variants per difficulty)
  questionsPerType = 2,
}) {
  const ctx = SUBJECT_CONTEXT[subject] || SUBJECT_CONTEXT["Paper I"];

  const difficultyGuide = {
    easy: "Direct definition, recall-based. Single concept. Clear unambiguous answer. Suitable for first-time learners.",
    medium: "Application and understanding. Requires knowing relationships between concepts. Moderate analytical thinking.",
    hard: "Multi-concept integration, critical analysis, evaluation. Requires deep subject knowledge. NTA-level difficulty.",
  }[difficulty];

  return `You are a senior UGC-NET question paper setter with 15+ years of experience.

EXAM: ${ctx.exam}
UNIT: "${unit}"
TOPIC: "${topic}"
DIFFICULTY LEVEL: ${difficulty.toUpperCase()} — ${difficultyGuide}
VARIANT: ${variant} (generate different questions from variant 1 of same topic+difficulty)

${ANTI_HALLUCINATION_RULES}

Generate exactly ${questionsPerType} question(s) for EACH of the 8 types below.
Total: ${questionsPerType * 8} questions.

Return ONLY a valid JSON object. No markdown, no explanation.

{
  "topic": "${topic}",
  "subject": "${subject}",
  "unit": "${unit}",
  "difficulty": "${difficulty}",
  "variant": ${variant},
  "questions": [
    {
      "type": "mcq_single",
      "question": "Question text",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answer": "A",
      "explanation": "Clear explanation. State WHY A is correct and why others are wrong.",
      "difficulty": "${difficulty}",
      "confidence": 9
    },
    {
      "type": "mcq_multiple",
      "question": "Which of the following statements are correct? (Select all that apply)",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answers": ["A", "C"],
      "explanation": "Explain each correct and incorrect option briefly.",
      "difficulty": "${difficulty}",
      "confidence": 9
    },
    {
      "type": "true_false",
      "question": "Statement: [Write a clear, unambiguous statement about ${topic}]",
      "correct_answer": "True",
      "explanation": "Why this is True/False.",
      "difficulty": "${difficulty}",
      "confidence": 9
    },
    {
      "type": "assertion_reason",
      "assertion": "Assertion (A): [Factual assertion about ${topic}]",
      "reason": "Reason (R): [Related reason or mechanism]",
      "question": "Choose the correct option:",
      "options": [
        "A) Both A and R are true and R is the correct explanation of A",
        "B) Both A and R are true but R is NOT the correct explanation of A",
        "C) A is true but R is false",
        "D) A is false but R is true"
      ],
      "correct_answer": "A",
      "explanation": "Explain the assertion-reason relationship.",
      "difficulty": "${difficulty}",
      "confidence": 9
    },
    {
      "type": "match_following",
      "question": "Match List I with List II correctly:",
      "list_i": ["(i) ...", "(ii) ...", "(iii) ...", "(iv) ..."],
      "list_ii": ["(a) ...", "(b) ...", "(c) ...", "(d) ..."],
      "options": [
        "A) (i)-(a), (ii)-(b), (iii)-(c), (iv)-(d)",
        "B) (i)-(b), (ii)-(a), (iii)-(d), (iv)-(c)",
        "C) (i)-(c), (ii)-(d), (iii)-(a), (iv)-(b)",
        "D) (i)-(d), (ii)-(c), (iii)-(b), (iv)-(a)"
      ],
      "correct_answer": "A",
      "explanation": "Correct mapping explanation.",
      "difficulty": "${difficulty}",
      "confidence": 9
    },
    {
      "type": "sequence_order",
      "question": "Arrange the following in the correct sequence:",
      "items": ["(i) ...", "(ii) ...", "(iii) ...", "(iv) ..."],
      "options": [
        "A) (i)→(ii)→(iii)→(iv)",
        "B) (iii)→(i)→(iv)→(ii)",
        "C) (ii)→(iv)→(i)→(iii)",
        "D) (iv)→(ii)→(iii)→(i)"
      ],
      "correct_answer": "A",
      "explanation": "Why this sequence is correct.",
      "difficulty": "${difficulty}",
      "confidence": 9
    },
    {
      "type": "fill_blanks",
      "question": "__________ is/are [statement completing the concept of ${topic}].",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct_answer": "B",
      "explanation": "Why this fills the blank correctly.",
      "difficulty": "${difficulty}",
      "confidence": 9
    },
    {
      "type": "statement_based",
      "question": "Consider the following statements about ${topic}:\\n(i) ...\\n(ii) ...\\n(iii) ...\\n(iv) ...\\nWhich of the above statements is/are correct?",
      "options": [
        "A) (i) and (ii) only",
        "B) (ii) and (iii) only",
        "C) (i), (ii) and (iii) only",
        "D) (i), (ii), (iii) and (iv)"
      ],
      "correct_answer": "C",
      "explanation": "Verify each statement. Explain which are correct and why.",
      "difficulty": "${difficulty}",
      "confidence": 9
    }
  ]
}

FINAL CHECK before responding:
- Are all facts accurate? ✓
- Are all correct answers unambiguous? ✓
- Are all distractors real terms? ✓
- Is confidence ≥ 8 for every question? ✓
Return ONLY the JSON.`;
}

// ── Verification prompt (2nd pass) ───────────────────────────
export function buildVerificationPrompt(question) {
  return `You are a UGC-NET subject matter expert and fact-checker.

Review this exam question and verify its accuracy:

${JSON.stringify(question, null, 2)}

Check:
1. Is the question factually accurate?
2. Is the marked correct answer definitively correct?
3. Are all distractor options real (not invented) terms?
4. Is there any ambiguity in the correct answer?
5. Are the explanation details accurate?

Return ONLY this JSON:
{
  "is_accurate": true,
  "confidence": 9,
  "issues": [],
  "corrected_answer": null,
  "corrected_explanation": null,
  "verdict": "approve"
}

verdict must be one of: "approve" | "needs_edit" | "reject"
- approve: confidence ≥ 8, no issues
- needs_edit: confidence 6-7, minor fixable issues (provide correction)
- reject: confidence < 6, factual errors, or invented content

Return ONLY the JSON.`;
}

// ── Study notes prompt v2 ────────────────────────────────────
export function buildStudyNotesPromptV2(subject, unit, topic) {
  return `You are an expert UGC-NET educator. Write accurate study notes.

Subject: "${subject}" | Unit: "${unit}" | Topic: "${topic}"

${ANTI_HALLUCINATION_RULES}

Return ONLY this JSON:
{
  "study_notes": "200-250 word comprehensive note covering: core definition, key mechanisms/principles, important examples, real-world applications, exam-important facts. Only state facts you are 100% certain about.",
  "key_points": [
    "5-7 bullet points of must-know facts for NET exam",
    "Each point should be a single, verifiable fact",
    "No invented statistics or unverified claims"
  ],
  "important_terms": [
    {"term": "...", "definition": "..."},
    {"term": "...", "definition": "..."}
  ]
}
Return ONLY the JSON.`;
}

// ── Generation matrix: all difficulty × variant combos ───────
export function getGenerationMatrix(questionsPerType = 2) {
  const matrix = [];
  const difficulties = ["easy", "medium", "hard"];
  const variants = [1, 2]; // 2 variants per difficulty

  for (const difficulty of difficulties) {
    for (const variant of variants) {
      matrix.push({ difficulty, variant, questionsPerType });
    }
  }
  // 3 difficulties × 2 variants × 8 types × 2 Qs = 96 questions/topic
  // At questionsPerType=1: 3×2×8×1 = 48 questions/topic × 111 topics = 5,328
  return matrix;
}

// ── Calculate expected total questions ───────────────────────
export function calculateExpected(totalTopics, questionsPerType = 1) {
  const matrix = getGenerationMatrix(questionsPerType);
  return totalTopics * matrix.length * 8 * questionsPerType;
}
