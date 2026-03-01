export class NetworkManager {
    constructor(onPlayerUpdate, onBlockUpdate, onPlayerDisconnect) {
        this.myId = Math.random().toString(36).substring(2, 9);
        this.peers = new Map(); // id -> { connection, dataChannel }
        this.onPlayerUpdate = onPlayerUpdate;
        this.onBlockUpdate = onBlockUpdate;
        this.onPlayerDisconnect = onPlayerDisconnect;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.signaling = new WebSocket(`${protocol}//${location.host}/signaling`);

        this.signaling.onopen = () => {
            console.log("Connected to signaling server as", this.myId);
            this.sendSignal({ type: 'join', sender: this.myId });
        };

        this.signaling.onmessage = async (event) => {
            const data = JSON.parse(event.data);

            // Ignore messages not meant for us (unless it's a broadcast like 'join')
            if (data.target && data.target !== this.myId) return;

            if (data.type === 'join') {
                if (data.sender !== this.myId) {
                    await this.createPeerConnection(data.sender, true);
                }
            } else if (data.type === 'offer') {
                const pc = await this.createPeerConnection(data.sender, false);
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this.sendSignal({ type: 'answer', target: data.sender, sender: this.myId, sdp: pc.localDescription });
            } else if (data.type === 'answer') {
                const peer = this.peers.get(data.sender);
                if (peer && peer.connection) {
                    await peer.connection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                }
            } else if (data.type === 'candidate') {
                const peer = this.peers.get(data.sender);
                if (peer && peer.connection) {
                    await peer.connection.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }
        };

        this.latencies = new Map();
        this.pingInterval = setInterval(() => this.sendPings(), 1000);
    }

    sendPings() {
        const now = Date.now();
        this.broadcast('ping', { time: now });
    }

    sendSignal(msg) {
        if (this.signaling.readyState === WebSocket.OPEN) {
            this.signaling.send(JSON.stringify(msg));
        }
    }

    async createPeerConnection(peerId, isInitiator) {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        this.peers.set(peerId, { connection: pc, dataChannel: null });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({ type: 'candidate', target: peerId, sender: this.myId, candidate: event.candidate });
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                console.log("Peer disconnected:", peerId);
                this.peers.delete(peerId);
                this.latencies.delete(peerId);
                if (this.onPlayerDisconnect) this.onPlayerDisconnect(peerId);
            }
        };

        if (isInitiator) {
            const dc = pc.createDataChannel('gameData', { negotiated: false });
            this.setupDataChannel(peerId, dc);

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignal({ type: 'offer', target: peerId, sender: this.myId, sdp: pc.localDescription });
        } else {
            pc.ondatachannel = (event) => {
                this.setupDataChannel(peerId, event.channel);
            };
        }

        return pc;
    }

    setupDataChannel(peerId, dc) {
        const peer = this.peers.get(peerId);
        if (peer) peer.dataChannel = dc;

        dc.onopen = () => {
            console.log("Data channel open with", peerId);
            // Request full world state maybe? Future enhancement.
        };

        dc.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'playerUpdate' && this.onPlayerUpdate) {
                this.onPlayerUpdate(peerId, msg.data);
            } else if (msg.type === 'blockUpdate' && this.onBlockUpdate) {
                this.onBlockUpdate(msg.data);
            } else if (msg.type === 'ping') {
                if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
                    peer.dataChannel.send(JSON.stringify({ type: 'pong', data: msg.data }));
                }
            } else if (msg.type === 'pong') {
                const rtt = Date.now() - msg.data.time;
                this.latencies.set(peerId, rtt);
            }
        };
    }

    broadcast(type, data) {
        const msg = JSON.stringify({ type, data });
        for (const [peerId, peer] of this.peers.entries()) {
            if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
                peer.dataChannel.send(msg);
            }
        }
    }
}
