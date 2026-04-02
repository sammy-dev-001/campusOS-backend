import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; // Use node-fetch for ESM compatibility or just use global fetch if node is 18+
dotenv.config();

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log("Testing API Key:", apiKey.substring(0, 10) + "...");
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();
        if (data.models) {
            console.log("Success! Models found.");
        } else {
            console.log("Failed! Response:", JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("Network Error:", e.message);
    }
}
test();
