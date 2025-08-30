import { GoogleGenAI, Type } from "@google/genai";
import { SrtEntry } from './srtService';

// IMPORTANT: Access the API key from Vite's environment variables
const apiKey = import.meta.env.VITE_API_KEY;
if (!apiKey) {
    throw new Error("VITE_API_KEY is not set. Please check your .env file and Vercel project settings.");
}

const ai = new GoogleGenAI({ apiKey });

const model = "gemini-2.5-flash";

const responseSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING },
            startTime: { type: Type.STRING },
            endTime: { type: Type.STRING },
            text: { type: Type.STRING },
        },
        required: ["id", "startTime", "endTime", "text"],
    },
};

const systemInstruction = `You are an expert subtitle editor for YouTube Shorts. Your task is to process an SRT file and optimize it for vertical video viewing, ensuring maximum readability and engagement. Follow these rules strictly:

1.  **Analyze and Merge**: Analyze the entire SRT file to understand the context. Merge lines intelligently to create short, impactful subtitle blocks.
2.  **Line Limit**: Each subtitle block MUST have a maximum of 2 lines. NEVER exceed this limit.
3.  **Character Limit**: Each line MUST NOT exceed 15 characters, including spaces. This is critical for mobile viewing.
4.  **Natural Breaks**: Split lines at natural grammatical breaks (commas, ends of phrases) whenever possible. Avoid splitting in the middle of a word or a coherent thought.
5.  **Timing Adjustment**: When merging subtitle entries, you MUST adjust the timing. The new entry's start time should be the start time of the first merged entry, and the end time should be the end time of the last merged entry.
6.  **Preserve Structure**: Maintain the original SRT data structure (id, startTime, endTime, text). The 'text' field should contain the processed two-line subtitle, with lines separated by a newline character (\\n).
7.  **JSON Output**: Your final output MUST be a valid JSON array of SRT objects, conforming to the provided schema. Do not output any text or explanation outside of the JSON array.
`;


export async function geminiProcessSrt(srtEntries: SrtEntry[]): Promise<string> {
    try {
        const response = await ai.models.generateContent({
            model,
            contents: `Here is the SRT data in JSON format. Please process it according to the rules.\n\n${JSON.stringify(srtEntries)}`,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.3,
            },
        });

        const jsonString = response.text.trim();
        const processedEntries: SrtEntry[] = JSON.parse(jsonString);

        // Convert JSON back to SRT format string
        return processedEntries.map(entry => {
            return `${entry.id}\n${entry.startTime} --> ${entry.endTime}\n${entry.text}\n`;
        }).join('\n');

    } catch (error) {
        console.error("Error processing SRT with Gemini API:", error);
        if (error instanceof Error && error.message.includes('API key not valid')) {
             throw new Error("The provided API key is invalid or has expired. Please check your .env file and Vercel environment variables.");
        }
        throw new Error("Failed to get a valid response from the AI. The content may be blocked or the API is unavailable.");
    }
}