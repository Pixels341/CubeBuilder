import { defineConfig } from 'vite';
import { WebSocketServer } from 'ws';
import fs from 'fs';

export default defineConfig({
    plugins: [
        {
            name: 'webrtc-signaling-server',
            configureServer(server) {
                // Set up the WebSocket server on the same HTTP server Vite uses
                const wss = new WebSocketServer({ noServer: true });

                server.httpServer.on('upgrade', (request, socket, head) => {
                    if (request.url === '/signaling') {
                        wss.handleUpgrade(request, socket, head, (ws) => {
                            wss.emit('connection', ws, request);
                        });
                    }
                });

                // Simple broadcast signaling logic
                wss.on('connection', (ws) => {
                    ws.on('message', (message) => {
                        const data = JSON.parse(message);
                        // Broadcast the message to all other connected clients
                        wss.clients.forEach((client) => {
                            if (client !== ws && client.readyState === ws.OPEN) {
                                client.send(JSON.stringify(data));
                            }
                        });
                    });
                });

                server.middlewares.use((req, res, next) => {
                    if (req.url === '/api/save' && req.method === 'POST') {
                        let body = '';
                        req.on('data', chunk => { body += chunk; });
                        req.on('end', () => {
                            try {
                                fs.writeFileSync('world.json', body);
                                res.statusCode = 200;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ success: true }));
                            } catch (e) {
                                res.statusCode = 500;
                                res.end(JSON.stringify({ error: e.message }));
                            }
                        });
                        return;
                    }

                    if (req.url === '/api/load' && req.method === 'GET') {
                        try {
                            if (fs.existsSync('world.json')) {
                                const data = fs.readFileSync('world.json', 'utf8');
                                res.statusCode = 200;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(data);
                            } else {
                                res.statusCode = 404;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'World not found' }));
                            }
                        } catch (e) {
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: e.message }));
                        }
                        return;
                    }
                    next();
                });
            },
        }
    ]
});
