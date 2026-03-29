/**
 * AI Service - Gemini Integration
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

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
        if (this.apiKey) {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
        }
        this.cachedModelName = null;
    }

    async getBestModel() {
        if (this.cachedModelName) return this.cachedModelName;
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
            if (res.ok) {
                const data = await res.json();
                const availableModels = data.models
                    .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name.replace('models/', ''));
                
                const priority = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-pro'];
                for (const p of priority) {
                    if (availableModels.includes(p)) {
                        this.cachedModelName = p;
                        console.log(`[AI Discovery] Selected model: ${p}`);
                        return p;
                    }
                }
                
                if (availableModels.length > 0) {
                    this.cachedModelName = availableModels[0];
                    console.log(`[AI Discovery] Selected fallback model: ${availableModels[0]}`);
                    return availableModels[0];
                }
            }
        } catch (e) {
            console.error('[AI Discovery Error] Defaulting to gemini-2.0-flash');
        }
        return 'gemini-2.0-flash';
    }

    isAvailable() {
        return !!this.apiKey && !!this.genAI;
    }

    async generateContent(prompt, options = {}) {
        if (!this.isAvailable()) {
            throw new Error('AI service is not configured. Please set GEMINI_API_KEY.');
        }

        try {
            const targetModel = await this.getBestModel();
            const model = this.genAI.getGenerativeModel({
                model: targetModel,
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.maxTokens || 2048,
                }
            });

            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.error('Gemini SDK Error:', error);
            throw new Error(error.message || 'AI request failed');
        }
    }

    /**
     * Eddy chat - multi-turn conversation with full history support
     * Uses dynamically verified models for better performance
     * @param {string} message - latest user message
     * @param {Array} history - [{role: 'user'|'assistant', content: string}]
     */
    async eddyChat(message, history = []) {
        if (!this.isAvailable()) {
            throw new Error('AI service is not configured. Please set GEMINI_API_KEY.');
        }

        try {
            const targetModel = await this.getBestModel();
            const model = this.genAI.getGenerativeModel({
                model: targetModel,
                systemInstruction: EDDY_SYSTEM_PROMPT,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 500,
                }
            });

            const formattedHistory = history.map(m => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }],
            }));

            const chat = model.startChat({
                history: formattedHistory
            });

            const result = await chat.sendMessage(message);
            return result.response.text();
        } catch (error) {
            console.error('Gemini Eddy Chat Error:', error);
            throw new Error(error.message || 'Failed to get AI response');
        }
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
