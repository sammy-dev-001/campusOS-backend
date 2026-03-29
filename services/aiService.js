/**
 * AI Service - Gemini Integration
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';
const GEMINI_FLASH_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

const EDDY_SYSTEM_PROMPT = `You are Eddy, a friendly and knowledgeable AI student companion for Nigerian university students using the EduFi app.

Your role:
- Help students with study tips, learning strategies, and explaining complex topics
- Assist with financial tracking, budgeting, and money management advice
- Provide mental health support, motivation, and wellness tips
- Help with time management, schedules, and productivity
- Offer course selection and career guidance

Your personality:
- Warm, encouraging, and patient like a friendly peer mentor
- Break down complex topics into digestible parts
- Use examples relevant to Nigerian students when possible
- Keep responses concise (2-3 paragraphs max)
- Use **bold text** for key terms and bullet points for lists
- Use emojis sparingly for friendliness 📚💰🧠

Important: You handle ACADEMICS, FINANCE, and WELLNESS. Be helpful across all these domains.`;

class AIService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
    }

    isAvailable() {
        return !!this.apiKey;
    }

    async generateContent(prompt, options = {}) {
        if (!this.isAvailable()) {
            throw new Error('AI service is not configured. Please set GEMINI_API_KEY.');
        }

        const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.maxTokens || 2048,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'AI request failed');
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    /**
     * Eddy chat - multi-turn conversation with full history support
     * Uses gemini-1.5-flash for better performance
     * @param {string} message - latest user message
     * @param {Array} history - [{role: 'user'|'assistant', content: string}]
     */
    async eddyChat(message, history = []) {
        if (!this.isAvailable()) {
            throw new Error('AI service is not configured. Please set GEMINI_API_KEY.');
        }

        // Build contents array: system primer + history + new message
        const contents = [
            { role: 'user', parts: [{ text: EDDY_SYSTEM_PROMPT }] },
            { role: 'model', parts: [{ text: 'Understood! I am Eddy, ready to help with academic guidance, finance, and wellness.' }] },
            ...history.slice(-20).map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }],
            })),
            { role: 'user', parts: [{ text: message }] },
        ];

        const response = await fetch(`${GEMINI_FLASH_URL}?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 500,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || 'Failed to get AI response');
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text
            || "I'm sorry, I couldn't process that. Please try again.";
    }

    parseJSON(response) {
        let jsonStr = response;
        if (response.includes('```json')) {
            jsonStr = response.split('```json')[1].split('```')[0].trim();
        } else if (response.includes('```')) {
            jsonStr = response.split('```')[1].split('```')[0].trim();
        }
        return JSON.parse(jsonStr);
    }

    async summarizeDocument(text, options = {}) {
        const prompt = `Summarize this document concisely:\n\n${text.substring(0, 15000)}\n\nSummary:`;
        return await this.generateContent(prompt, { temperature: 0.5, maxTokens: 1500 });
    }

    async generateQuiz(text, options = {}) {
        const numQuestions = options.numQuestions || 5;
        const prompt = `Generate ${numQuestions} quiz questions as JSON array: [{"id":1,"question":"...","options":["A","B","C","D"],"correctAnswer":"A","explanation":"..."}]\n\nContent:\n${text.substring(0, 10000)}\n\nJSON:`;
        const response = await this.generateContent(prompt, { temperature: 0.6, maxTokens: 2000 });
        return this.parseJSON(response);
    }

    async generateFlashcards(text, count = 10) {
        const prompt = `Create ${count} flashcards as JSON: [{"id":1,"front":"Question","back":"Answer"}]\n\nContent:\n${text.substring(0, 8000)}\n\nJSON:`;
        const response = await this.generateContent(prompt, { temperature: 0.5, maxTokens: 2000 });
        return this.parseJSON(response);
    }

    async chat(message, history = []) {
        const ctx = history.slice(-10).map(h => `${h.role === 'user' ? 'Student' : 'Assistant'}: ${h.content}`).join('\n');
        const prompt = `You are Campus Buddy, a friendly AI academic assistant.\n\n${ctx ? `History:\n${ctx}\n\n` : ''}Student: ${message}\n\nAssistant:`;
        return await this.generateContent(prompt, { temperature: 0.7, maxTokens: 1000 });
    }
}

export const aiService = new AIService();
export default aiService;
