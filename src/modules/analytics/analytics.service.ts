import { Survey } from "../surveys/survey.model";
import { SurveyResponse } from "../responses/response.model";
import { normalizeQuestionType } from "../../utils/surveyHelpers";
import { AppError } from "../../utils/errors";
import config from "../../config";
import { deepSeekClient } from "../../providers/deepseek/deepseek.client";

const MAX_TEXT_SAMPLES = 5;
const MAX_TEXT_LENGTH = 120;

const buildSurveyContext = async (surveyId: string) => {
  const survey = await Survey.findById(surveyId);
  if (!survey) throw new AppError("Survey not found", 404);

  const responses = await SurveyResponse.find({ surveyId }).lean();
  const questionSummaries = survey.questions.map((q) => {
    const type = normalizeQuestionType(q.type);
    const answers = responses
      .map((r) => r.answers.find((a) => a.questionId === q.questionId)?.value)
      .filter((v) => v !== undefined && v !== null && v !== "");

    if (type === "single_choice" || type === "multiple_choice" || type === "boolean") {
      const tallies: Record<string, number> = {};
      for (const value of answers) {
        if (Array.isArray(value)) {
          for (const item of value) {
            const key = String(item);
            tallies[key] = (tallies[key] || 0) + 1;
          }
        } else {
          const key = String(value);
          tallies[key] = (tallies[key] || 0) + 1;
        }
      }
      return {
        question: q.questionText,
        type,
        responseCount: answers.length,
        tallies,
      };
    }

    if (type === "number" || type === "rating") {
      const nums = answers.map((v) => Number(v)).filter((n) => Number.isFinite(n));
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      return {
        question: q.questionText,
        type,
        responseCount: nums.length,
        average: avg !== null ? Math.round(avg * 100) / 100 : null,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
      };
    }

    const samples = answers
      .map((v) => String(v).slice(0, MAX_TEXT_LENGTH))
      .slice(0, MAX_TEXT_SAMPLES);

    return {
      question: q.questionText,
      type,
      responseCount: answers.length,
      sampleAnswers: samples,
    };
  });

  return {
    survey: {
      title: survey.title,
      description: survey.description,
      responsesReceived: survey.responsesReceived,
      responsesNeeded: survey.responsesNeeded,
      targetAudience: survey.targetAudience,
    },
    questions: questionSummaries,
    totalResponses: responses.length,
  };
};

export const getAnalyticsSuggestions = () => [
  "What are the main themes in open-text answers?",
  "Which multiple-choice option is most popular?",
  "Summarize overall sentiment from text responses.",
  "Are there any surprising patterns in the data?",
];

export const askSurveyAnalytics = async (
  researcherId: string,
  surveyId: string,
  question: string
) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);

  if (!survey.aiAnalyticsEnabled) {
    throw new AppError("AI analytics add-on not enabled for this survey", 402);
  }
  if (!config().FEATURE_AI_ANALYTICS) {
    throw new AppError("AI analytics is not available on this platform", 503);
  }
  if (!deepSeekClient.isConfigured()) {
    return {
      answer:
        "AI analytics is not configured yet. Please contact support or try again later.",
    };
  }

  const context = await buildSurveyContext(surveyId);
  const answer = await deepSeekClient.chatText(
    [
      {
        role: "system",
        content:
          "You are a survey data analyst for a Nigerian research platform. Answer concisely using only the provided survey context. If data is insufficient, say so. Use plain text, no markdown tables.",
      },
      {
        role: "user",
        content: `Survey context:\n${JSON.stringify(context)}\n\nResearcher question: ${question}`,
      },
    ],
    { maxTokens: 1200 }
  );

  return { answer };
};
