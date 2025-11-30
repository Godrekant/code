const http = require('http');
const fs = require('fs');
const path = require('path');
// node-fetch is required as native fetch was not yet stable in Node v13.14
const fetch = require('node-fetch');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";

if (!GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY environment variable is not set. This will fail on Render unless configured there.");
}

/**
 * Handles the logic for sending a prompt to the Gemini API.
 * Uses async/await, which is supported in Node v13.14.
 * @param {string} userPrompt The text prompt from the client.
 * @returns {Promise<object>} An object containing the text and sources.
 */
async function callGeminiAPI(userPrompt) {
    if (!GEMINI_API_KEY) {
        throw new Error("Server API Key is not configured.");
    }

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

    return { text: botText, sources: sources };
}


// --- HTTP SERVER LOGIC ---

const server = http.createServer((req, res) => {
    // Set common CORS headers 
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 1. Serve the Chatbot HTML file
    if (req.method === 'GET' && req.url === '/') {
        const filePath = path.join(__dirname, 'chatbot.html');
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading chatbot.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    } 
    // 2. Handle the Chat API POST request
    else if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        
        // Read the request body stream chunk by chunk
        req.on('data', chunk => {
            body += chunk.toString();
        });

        // When the stream is finished, process the request
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const userPrompt = data.prompt;

                if (!userPrompt) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing user prompt' }));
                    return;
                }

                const result = await callGeminiAPI(userPrompt);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));

            } catch (error) {
                console.error("Server Error:", error.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: 'Internal Server Error: ' + error.message,
                    message: "Check server logs for details."
                }));
            }
        });
    } 
    // 3. Handle 404 Not Found
    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Start the server
server.listen(PORT, () => {
    console.log(`Traditional HTTP Server running on http://localhost:${PORT}`);
});
