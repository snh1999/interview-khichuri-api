import type { TApiKeyProvider } from "@/src/database/database.types";

export const GEN_AI_PROVIDERS = [
  "google",
  "openai",
  "groq",
  "openrouter",
  "mistral",
  "github",
  "cerebras",
] as const;

interface IProviderConfig {
  sdk: "google" | "openai";
  baseURL: string;
  defaultModel: string;
}

export const PROVIDER_CONFIG: Record<TApiKeyProvider, IProviderConfig> = {
  google: {
    sdk: "google",
    baseURL: "",
    defaultModel: "gemini-2.5-flash",
  },
  openai: {
    sdk: "openai",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  groq: {
    sdk: "openai",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
  },
  openrouter: {
    sdk: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
  mistral: {
    sdk: "openai",
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
  },
  github: {
    sdk: "openai",
    baseURL: "https://models.github.ai/inference",
    defaultModel: "openai/gpt-4o-mini",
  },
  cerebras: {
    sdk: "openai",
    baseURL: "https://api.cerebras.ai/v1",
    defaultModel: "llama3.1-8b",
  },
};

export const RESUME_EXTRACTION_PROMPT = `Extract structured profile information from the following resume text.

Return a JSON object that matches the provided schema.

Field rules:
- For skills, industries, and job titles, return them as arrays of name strings (reasonably normalized, e.g. consistent casing and no duplicates).
- For experience/education entries, preserve the order as they appear in the resume text (do not re-sort chronologically).
- Parse dates as ISO date strings (YYYY-MM-DD) when possible.
- For the "country" field in personal info, use the ISO 3166-1 alpha-2 country code.
- Keep all extracted text in its original language; do not translate.
- Skip/Use undefined for any field that cannot be determined from the resume.
- If the input text is empty, garbled, or not a usable resume, skip or return all fields as undefined. Do not invent or hallucinate content.

Resume text:
`;

export const EXTRACTION_PROMPT = `Extract structured job posting information from the following job description text.

Return a JSON object that matches the provided schema.

Field rules:
- roleName: the title of the position being hired for.
- topicNames: skills/technologies mentioned, as an array of strings— return names as they appear in the text (reasonably normalized, e.g. consistent casing and no duplicates).
- companyName: the hiring company's name, as written in the text.
- location: the job location (e.g. "Remote", "New York, NY", "Hybrid - SF").
- source: where the job was found, if mentioned.
- deadline: ISO date string (YYYY-MM-DD) if a specific date is mentioned. If only a vague timeframe is given (e.g. "ASAP", "Q3 2026"), skip rather than guessing a specific date.
- interviewDate: ISO date string (YYYY-MM-DD) if mentioned, otherwise skip(undefined).
- status: one of "saved", "applied", "scheduled".
  - Use "scheduled" if an interviewDate is present.
  - Use "applied" only if the text explicitly indicates an application was already submitted.
  - Otherwise use "saved".
  - If truly undeterminable, skip/use undefined.
- If the job description lists multiple distinct roles, extract only the first role mentioned.
- Skip/use undefined for any field that cannot be determined from the text (for array fields return empty array).
- If the input text is empty, garbled, or not a usable job description,skip/return all fields as undefined. Do not invent or hallucinate content.

Job description:
`;

export const GENERATE_INTERVIEW_QUESTIONS_PROMPT_FALLBACK = `You are an expert technical interviewer. Generate interview questions based on the following context.

Output format: Return a JSON object with a "questions" array, where each question has a "questionText", "answer", "notes" (optional) field.

Question rules:
- Prioritize questions most likely to actually appear in a real technical interview for this role and experience level.
- Spread questions across the provided topics rather than concentrating on one topic.
- Mix difficulty levels (easy, medium, hard).
- Mix question types where relevant (conceptual, coding, system design, behavioral-technical).
- If a list of previously asked questions is provided below, do not repeat them or generate close variations of them.
- questionText/answer/notes may contain Markdown (code blocks, bold, lists, etc.) for rich formatting where appropriate.
- answers should contain the expected answer from the following context.
- notes (optional) should include guidance/hints towards expected answers



Context:
`;

export const GENERATE_TOPIC_QUESTIONS_PROMPT_FALLBACK = `Generate few questions based on the following context.

Output format: Return a JSON object with a "questions" array, where each question has a "questionText", "answer", "notes" (optional) field.

Question rules:
- Prioritize questions most likely to actually appear in a real technical interview for this role and experience level.
- Spread questions across the provided topics rather than concentrating on one topic.
- Mix difficulty levels (easy, medium, hard).
- Mix question types where relevant (conceptual, coding, system design, behavioral-technical).
- If a list of previously asked questions is provided below, do not repeat them or generate close variations of them.
- questionText/answer/notes may contain Markdown (code blocks, bold, lists, etc.) for rich formatting where appropriate.
- answers should contain the expected answers for related questionText.
- notes (optional) should add explanation or related questions/topics for further exploration.


Context:
`;

export const EXPLAIN_INTERVIEW_QUESTION_PROMPT = `You are an expert technical interviewer.
Provide a clear explanation for the following interview question, intended to help a candidate understand what is being tested and how to approach it.

Output format: Markdown.

Rules:
- Explain what the question is really testing (the underlying concept or skill).
- Give a brief outline of how a strong answer would be structured, without writing the full ideal answer unless asked.
- Keep the explanation focused and practical, not a generic essay.
- Keep the output in the same language as the question.

Question:
`;

export const GENERATE_RESUME_PROMPT = `You are an expert resume writer for software developers.
Generate polished resume content based on the candidate's profile data provided below.

Return a JSON object that matches the provided schema.

Rules:
- Rewrite and polish raw profile content (experience bullets, summaries, etc.) into clear, achievement-oriented resume language. Do not just copy raw notes verbatim.
- If a target job description is provided, tailor emphasis and wording toward that role; otherwise produce a strong generic resume from the profile.
- Keep all content in the same language as the source profile data; do not translate.
- Do not invent experience, skills, or achievements not supported by the profile data.
- Skip or Use undefined for any section that cannot be populated from the available profile data.

Profile data:
`;
