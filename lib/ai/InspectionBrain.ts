import OpenAI from "openai";
import { getAIModel } from "../openai";

export type InspectionAIRequest = {
  task:
    | "equipment"
    | "defect"
    | "finding"
    | "realtor_summary"
    | "report_review"
    | "maintenance";
  systemPrompt: string;
  userPrompt: string;
  images?: Array<{ mimeType: string; base64: string }>;
  temperature?: number;
  responseFormat?: "json_object" | "text";
};

export class InspectionBrain {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async run(request: InspectionAIRequest) {
    const content: any[] = [
      {
        type: "text",
        text:
          "You are FLOW AI, a professional home inspection assistant. " +
          "Be accurate, conservative, explain uncertainty, and never invent defects.\\n\\n" +
          request.userPrompt,
      },
    ];

    if (request.images?.length) {
      for (const image of request.images) {
        content.push({
          type: "image_url",
          image_url: {
            url: `data:${image.mimeType};base64,${image.base64}`,
          },
        });
      }
    }

    const model = getAIModel();

    const response = await this.client.chat.completions.create({
      model,
      temperature: request.temperature ?? 0.2,
      response_format:
        request.responseFormat === "json_object"
          ? { type: "json_object" }
          : undefined,
      messages: [
        {
          role: "system",
          content: request.systemPrompt,
        },
        {
          role: "user",
          content,
        },
      ],
    });

    return {
      model,
      text: response.choices[0]?.message?.content ?? "",
      usage: response.usage,
    };
  }
}

export const inspectionBrain = new InspectionBrain();
