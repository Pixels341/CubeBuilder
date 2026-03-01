import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json({ limit: '200mb' }));

app.post('/api/save', (req, res) => {
    try {
        fs.writeFileSync(path.join(__dirname, 'world.json'), JSON.stringify(req.body));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/load', (req, res) => {
    try {
        const worldPath = path.join(__dirname, 'world.json');
        if (fs.existsSync(worldPath)) {
            res.sendFile(worldPath);
        } else {
            res.status(404).json({ error: 'World not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Serve static files from the 'dist' directory (after you run npm run build)
// Or serve from 'public' if you prefer, but standard is dist for production
app.use(express.static(path.join(__dirname, 'dist')));

// Start HTTP server
const server = app.listen(port, () => {
    console.log(`\n==============================================`);
    console.log(`🎮 HYTALE CLONE DEDICATED SERVER STARTED 🎮`);
    console.log(`==============================================`);
    console.log(`Server is running on port: ${port}`);
    console.log(`\nPlayers on your Local Network can join at: `);
    console.log(`-> http://localhost:${port}`);
    // You could theoretically parse interfaces to get local IP here,
    // but telling them the port is usually enough for a standard tutorial.
    console.log(`\nTo allow internet access, forward port ${port} TCP/UDP on your router.`);
});

// Start WebSocket (Signaling) Server attached to HTTP server
const wss = new WebSocketServer({ server, path: '/signaling' });

console.log(`\n📡 Signaling Server initialized! Waiting for connections...`);

wss.on('connection', (ws, req) => {
    console.log(`\n[+] A new player connected right now!`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'join') {
                console.log(`[>>] Player Joined: ${data.sender}`);
            }

            // Broadcast message acting as simple P2P Signaling Router
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === ws.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch (e) {
            console.error("Failed to parse incoming WS message:", e);
        }
    });

    ws.on('close', () => {
        console.log(`[-] A player disconnected.`);
    });
});
