import config from "../../config";
import { deepSeekClient } from "../../providers/deepseek/deepseek.client";
import { normalizeQuestionType } from "../../utils/surveyHelpers";
import type { IQuestion } from "../surveys/survey.model";

const GIBBERISH_PATTERN = /^(.)\1{2,}$|^[bcdfghjklmnpqrstvwxyz]{3,}$/i;
const MIN_MEANINGFUL_LENGTH = 3;

export const isHeuristicSpam = (text: string): boolean => {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return true;
  if (trimmed.length < MIN_MEANINGFUL_LENGTH) return true;
  if (GIBBERISH_PATTERN.test(trimmed)) return true;
  if (/^(yes|no|ok|test|aaa|bbb|ccc|xxx|yyy|zzz|asdf|qwerty|none|n\/a|na)$/i.test(trimmed)) {
    return true;
  }
  const uniqueChars = new Set(trimmed.replace(/\s/g, "")).size;
  if (trimmed.length >= 6 && uniqueChars <= 2) return true;
  return false;
};

export interface SpamCheckInput {
  questionText: string;
  value: string;
}

export interface SpamCheckResult {
  isSpam: boolean;
  snippets: string[];
  method: "heuristic" | "ai" | "none";
}

export const detectSpamAnswers = async (
  questions: IQuestion[],
  answers: Array<{ questionId: string; type: string; value: unknown }>
): Promise<SpamCheckResult> => {
  const textAnswers: SpamCheckInput[] = [];

  for (const q of questions) {
    const type = normalizeQuestionType(q.type);
    if (type !== "text_short" && type !== "text_long" && type !== "text") continue;
    const answer = answers.find((a) => a.questionId === q.questionId);
    const value = String(answer?.value ?? "").trim();
    if (value) textAnswers.push({ questionText: q.questionText, value });
  }

  if (!textAnswers.length) {
    return { isSpam: false, snippets: [], method: "none" };
  }

  const heuristicHits = textAnswers.filter((a) => isHeuristicSpam(a.value));
  if (heuristicHits.length > 0) {
    return {
      isSpam: true,
      snippets: heuristicHits.map((h) => h.value.slice(0, 80)),
      method: "heuristic",
    };
  }

  if (!config().FEATURE_AI_SPAM_FILTER || !deepSeekClient.isConfigured()) {
    return { isSpam: false, snippets: [], method: "none" };
  }

  try {
    const payload = textAnswers.map((a) => ({
      question: a.questionText,
      answer: a.value.slice(0, 300),
    }));

    const result = await deepSeekClient.chatJSON<{ isSpam: boolean; reasons?: string[] }>([
      {
        role: "system",
        content:
          'You detect spam or nonsensical survey text answers. Reply JSON only: {"isSpam": boolean, "reasons": string[]}. Mark spam for gibberish like "yyy", "zzz", random letters, or answers that do not address the question.',
      },
      {
        role: "user",
        content: JSON.stringify({ answers: payload }),
      },
    ]);

    if (result.isSpam) {
      return {
        isSpam: true,
        snippets: textAnswers.map((a) => a.value.slice(0, 80)),
        method: "ai",
      };
    }
  } catch {
    // Fail open  do not block submission on AI errors
  }

  return { isSpam: false, snippets: [], method: "none" };
};
