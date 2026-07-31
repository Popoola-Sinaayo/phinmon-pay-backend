import { AppError } from "../../utils/errors";
import { SurveyResponse } from "../responses/response.model";
import { Survey } from "../surveys/survey.model";
import { SurveyFeedback } from "./feedback.model";

export const submitSurveyFeedback = async (
  userId: string,
  surveyId: string,
  data: { rating: number; comment?: string }
) => {
  const survey = await Survey.findById(surveyId);
  if (!survey) throw new AppError("Survey not found", 404);

  const response = await SurveyResponse.findOne({ userId, surveyId });
  if (!response) {
    throw new AppError("You can only leave feedback after completing this survey", 403);
  }

  const existing = await SurveyFeedback.findOne({ userId, surveyId });
  if (existing) {
    throw new AppError("You have already submitted feedback for this survey", 409);
  }

  const comment = data.comment?.trim();
  const feedback = await SurveyFeedback.create({
    userId,
    surveyId,
    rating: data.rating,
    ...(comment ? { comment } : {}),
  });

  return feedback;
};

export const listSurveyFeedback = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [feedback, total] = await Promise.all([
    SurveyFeedback.find()
      .populate("userId", "name email")
      .populate("surveyId", "title status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SurveyFeedback.countDocuments(),
  ]);
  return { feedback, total, page, limit };
};
