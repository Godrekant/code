const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
// IMPORTANT: Use the port provided by the environment (Render) or default to 3000 for local testing.
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";

if (!GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set. This will fail on Render unless configured there.");
}

// Middleware to parse JSON bodies
app.use(express.json());

// Serve the HTML file from the same directory
app.get('/', (req, res) => {
    // Note: 'chatbot.html' must be in the same directory as 'server.js'
    res.sendFile(path.join(__dirname, 'chatbot.html'));
});

// --- API Endpoint for Chat Logic ---
app.post('/api/chat', async (req, res) => {
    const userPrompt = req.body.prompt;
    if (!userPrompt) {
        return res.status(400).json({ error: 'Missing user prompt' });
    }

    // Ensure the key is available before proceeding
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Server API Key is not configured.' });
    }

    try {
        const systemPrompt = "You are a friendly, concise, and highly informative assistant. Your responses should be based on real-time information when possible, which you will obtain using the Google Search tool. Your goal is to provide accurate and helpful answers.";

        const payload = {
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            tools: [{ "google_search": {} }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            }
        };

        const MAX_RETRIES = 5;
        let response = null;
        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    break;
                } else if (response.status === 429 && i < MAX_RETRIES - 1) {
                    const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw new Error(`External API error: ${response.status} ${response.statusText}`);
                }
            } catch (error) {
                if (i === MAX_RETRIES - 1) throw error; 
            }
        }

        if (!response) {
            throw new Error("Failed to get a response after multiple retries.");
        }

        const result = await response.json();
        
        const candidate = result.candidates?.[0];
        let botText = "I encountered an error trying to process that request.";
        let sources = [];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            botText = candidate.content.parts[0].text;

            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                sources = groundingMetadata.groundingAttributions
                    .map(attribution => ({
                        uri: attribution.web?.uri,
                        title: attribution.web?.title,
                    }))
                    .filter(source => source.uri && source.title);
            }
        }

        res.json({ text: botText, sources: sources });

    } catch (error) {
        console.error("Gemini API Call Error:", error);
        res.status(500).json({ error: 'Failed to communicate with the AI model.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
