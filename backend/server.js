/**
 * Live Coding Platform Server
 * Node.js setup using Express for hosting and Socket.IO for real-time synchronization.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io'); 

const app = express();
// Create an HTTP server instance from the Express app
const server = http.createServer(app); 

// Initialize Socket.IO and attach it to the HTTP server
const io = new Server(server);
const port = 3000;

// Simple state storage for code (in-memory, non-persistent)
let currentCodeState = {
    html: '<!-- Welcome to the Live Code Editor! -->\n<h1>Real-time HTML/CSS/JS</h1>\n<p id="time"></p>',
    css: 'body { font-family: sans-serif; background: #f0f0f0; padding: 20px; }\nh1 { color: #2563eb; }',
    javascript: 'let counter = 0;\nsetInterval(() => {\n  counter++;\n  const el = document.getElementById("time");\n  if (el) el.innerHTML = `Seconds active: ${counter}`;\n}, 1000);'
};

// --- Middleware and Static File Serving ---

// Serve the static index.html file from the current directory
app.get('/', (req, res) => {
    // __dirname is the directory where server.js lives
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Socket.IO Real-time Connection Logic ---

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // 1. Synchronization: Send the current code state to the newly connected user
    socket.emit('initialCode', currentCodeState);

    // 2. Listen for 'codeChange' events from any client
    socket.on('codeChange', (updatedCode) => {
        // Update the server's master state
        currentCodeState = updatedCode; 
        
        // 3. Broadcast the updated code to all *other* connected clients
        socket.broadcast.emit('codeUpdate', currentCodeState);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// --- Start the Server ---
server.listen(port, () => {
    console.log(`\nLive Coding Server running at http://localhost:${port}`);
    console.log('If you haven\'t already, run: npm install');
    console.log('Then run: node server.js');
});