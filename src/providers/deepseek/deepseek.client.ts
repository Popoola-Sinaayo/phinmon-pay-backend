import axios from "axios";
import config from "../../config";
import { createLogger } from "../../utils/logger";

const log = createLogger("DeepSeek");

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
}

const summarizeAxiosError = (err: unknown) => {
  const axiosErr = err as {
    response?: { status?: number; data?: unknown };
    message?: string;
  };
  return {
    httpStatus: axiosErr.response?.status,
    responseData: axiosErr.response?.data,
    message: axiosErr.message,
  };
};

class DeepSeekClient {
  private get baseUrl() {
    return config().DEEPSEEK_API_URL.replace(/\/$/, "");
  }

  isConfigured(): boolean {
    return Boolean(config().DEEPSEEK_API_KEY);
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${config().DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    };
  }

  async chatText(messages: DeepSeekMessage[], options?: { maxTokens?: number }): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("DeepSeek API key not configured");
    }

    const url = `${this.baseUrl}/chat/completions`;
    log.info("DeepSeek chat request", { url, messageCount: messages.length });

    try {
      const { data } = await axios.post<ChatCompletionResponse>(
        url,
        {
          model: config().DEEPSEEK_MODEL,
          messages,
          stream: false,
          max_tokens: options?.maxTokens ?? 1500,
        },
        { headers: this.authHeaders(), timeout: 60000 }
      );

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Empty DeepSeek response");
      return content;
    } catch (err) {
      log.error("DeepSeek chat failed", summarizeAxiosError(err));
      throw err;
    }
  }

  async chatJSON<T>(messages: DeepSeekMessage[]): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("DeepSeek API key not configured");
    }

    const url = `${this.baseUrl}/chat/completions`;
    log.info("DeepSeek JSON chat request", { url, messageCount: messages.length });

    try {
      const { data } = await axios.post<ChatCompletionResponse>(
        url,
        {
          model: config().DEEPSEEK_MODEL,
          messages,
          stream: false,
          max_tokens: 800,
          response_format: { type: "json_object" },
        },
        { headers: this.authHeaders(), timeout: 45000 }
      );

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("Empty DeepSeek JSON response");
      return JSON.parse(content) as T;
    } catch (err) {
      log.error("DeepSeek JSON chat failed", summarizeAxiosError(err));
      throw err;
    }
  }
}

export const deepSeekClient = new DeepSeekClient();
