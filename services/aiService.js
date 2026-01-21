/**
 * AI Service - Gemini Integration
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

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
        const maxLength = options.maxLength || 'medium';
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
