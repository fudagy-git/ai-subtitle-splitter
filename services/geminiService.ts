
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { SrtEntry } from "../types";

// The API key is sourced from environment variables, as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

interface ProcessedEntry {
  id: number;
  text: string | string[]; // string for normal/reformatted, string[] for split
}

/**
 * Sends a batch of subtitle entries to the Gemini API for intelligent splitting.
 * @param {SrtEntry[]} entries The array of subtitle entries to process.
 * @param {number} maxChars The maximum number of characters allowed per line.
 * @returns {Promise<ProcessedEntry[]>} A promise that resolves to the AI-processed subtitle entries.
 */
export const processSubtitlesBatch = async (entries: SrtEntry[], maxChars: number): Promise<ProcessedEntry[]> => {
  const entriesToProcess = entries.map(e => ({id: e.id, text: e.text}));

  const prompt = `You are an expert Korean subtitle formatter API. Your task is to process a JSON array of subtitle entries.
You MUST return only a valid JSON array of objects. Do not include any other text, explanations, or markdown formatting (like \`\`\`json).

**CRITICAL RULES:**

1.  **THE ONE-LINE PRINCIPLE (HIGHEST PRIORITY):** For each entry, first, replace any existing newlines with a space to create a single line. If the character count of this single line is LESS THAN OR EQUAL TO ${maxChars}, your output "text" for that entry MUST be that single, flattened line. This is the most important rule.

2.  **TWO-LINE MAX (If Rule 1 fails):** If the text is longer than ${maxChars}, reformat it into one or two lines using a single newline character ('\\n').

3.  **SPLIT (If 2 lines are not enough):** If and only if the text is so long it would require 3 or more lines, the "text" field must be an ARRAY of strings. Each string in the array is a new, sequential subtitle.

**NATURAL LINE BREAKING SUB-RULES (Apply to Rules 2 & 3):**
When breaking lines, you MUST follow this priority to make it natural for Korean speakers:
1.  **Punctuation First:** Always prefer to break a line *after* punctuation like a comma (,) or period (.).
2.  **Meaningful Phrases:** If there's no punctuation, break between complete meaningful phrases. Keep closely related words together. DO NOT SPLIT them.
    -   **BAD:** \`혹시 여기 계시던\\n아저씨 어디 계신지\`
    -   **GOOD:** \`혹시 여기 계시던 아저씨\\n어디 계신지\`
    -   **BAD:** \`옷도 더러워진 거\\n같은데, 우선\`
    -   **GOOD:** \`옷도 더러워진 거 같은데,\\n우선 가져가서 입으세요\`
    -   **BAD:** \`아가씨, 이건 제\\n딸 옷이에요.\`
    -   **GOOD:** \`아가씨, 이건\\n제 딸 옷이에요.\`
3.  **Korean Grammar:** Do not break lines right before particles (e.g., '은/는', '이/가', '을/를', '에', '의').

**INPUT/OUTPUT FORMAT:**

-   **INPUT:** \`[{id: number, text: string}, ...]\`
-   **OUTPUT:** You MUST respond with a JSON array of objects in the same order: \`[{id: number, text: string | string[]}, ...]\`
    -   The \`id\` MUST match the original \`id\`.
    -   \`text\` is a \`string\` for Rule 1 or 2.
    -   \`text\` is a \`string[]\` for Rule 3.

---
**EXAMPLE (maxChars = 20):**

**INPUT:**
\`\`\`json
[
  {"id": 1, "text": "안녕하세요, 반갑습니다."},
  {"id": 2, "text": "옷도 더러워진 거 같은데, 우선 가져가서 입으세요"},
  {"id": 3, "text": "제게 새로운 삶의 기회를 주셨어요. 그때 아저씨의 도움이 없었다면 지금의 저는 없었을 거예요."}
]
\`\`\`

**CORRECT OUTPUT:**
\`\`\`json
[
  {"id": 1, "text": "안녕하세요, 반갑습니다."},
  {"id": 2, "text": "옷도 더러워진 거 같은데,\\n우선 가져가서 입으세요"},
  {"id": 3, "text": ["제게 새로운 삶의 기회를 주셨어요.", "그때 아저씨의 도움이 없었다면", "지금의 저는 없었을 거예요"]}
]
\`\`\`

---
**Your Task:**

**Max Characters per Line**: ${maxChars}
**Input JSON**:
\`\`\`json
${JSON.stringify(entriesToProcess, null, 2)}
\`\`\`

**Output JSON:**`;


  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
        }
    });
    
    const resultText = response.text.trim();
    
    if (resultText) {
      const processedData: ProcessedEntry[] = JSON.parse(resultText);
      
      if (!Array.isArray(processedData) || processedData.length !== entries.length) {
          console.error("AI response was not a valid array or length mismatch.", {expected: entries.length, got: processedData.length});
          return entries.map(e => ({id: e.id, text: e.text}));
      }

      return processedData;

    } else {
      return entries.map(e => ({id: e.id, text: e.text}));
    }
  } catch (error) {
    console.error("Gemini API call failed:", error);
    if (error instanceof Error) {
        if (error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('429')) {
             throw new Error("Gemini API 사용량 한도를 초과했습니다 (오류 429). Google AI Platform에서 사용량, 결제 상태 및 할당량을 확인해주세요. 무료 할당량을 모두 사용했거나, 분당 요청 제한을 초과했을 수 있습니다.");
        }
        if (error.message.includes('API key not valid') || 
            error.message.includes('invalid') ||
            error.message.toLowerCase().includes('permission denied')) {
            throw new Error("환경 변수에 설정된 API 키가 유효하지 않거나 권한이 없습니다. 설정을 확인하세요.");
        }
         if (error.message.toLowerCase().includes('json')) {
            throw new Error(`Gemini API가 유효한 JSON을 반환하지 못했습니다. AI 모델에 일시적인 문제가 있을 수 있습니다. 잠시 후 다시 시도해 주세요. (${error.message})`);
         }
        throw new Error(`Gemini API 오류: ${error.message}`);
    }
    throw new Error("Gemini API와 통신하지 못했습니다. 네트워크 연결을 확인하세요.");
  }
};
