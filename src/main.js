import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { NetworkManager } from './network.js';

function sendBlockUpdate(action, data) {
    if (window.networkManager) {
        window.networkManager.broadcast('blockUpdate', { action, ...data });
    }
}

// DOM Elements
const appDiv = document.getElementById('app');
const playBtn = document.getElementById('play-btn');
const overlay = document.getElementById('start-overlay');
const hotbarSlots = document.querySelectorAll('.hotbar-slot');
const qMenu = document.getElementById('q-menu');
const chatContainer = document.getElementById('chat-container');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
let isChatting = false;

const neonColorPicker = document.getElementById('neon-color-picker');
const inventoryColorPicker = document.getElementById('inventory-color-picker');
const toolModeSelect = document.getElementById('tool-mode');
const sniperSettings = document.getElementById('sniper-settings');
const adminModeToggle = document.getElementById('admin-mode-toggle');
const sniperShapeSelect = document.getElementById('sniper-shape');
const sniperBrushSelect = document.getElementById('sniper-brush');
const sniperRadiusInput = document.getElementById('sniper-radius');
const radiusVal = document.getElementById('radius-val');
const sniperReplaceSettings = document.getElementById('sniper-replace-settings');
const sniperReplaceTarget = document.getElementById('sniper-replace-target');
const sniperReplaceWith = document.getElementById('sniper-replace-with');

const serverNameInput = document.getElementById('server-name-input');
const publicServerToggle = document.getElementById('public-server-toggle');
const hudServerName = document.getElementById('hud-server-name');
const hudServerStatus = document.getElementById('hud-server-status');
const inventoryTooltip = document.getElementById('inventory-tooltip');
const scoreboard = document.getElementById('scoreboard');
const scoreboardList = document.getElementById('scoreboard-list');
let isPublicServer = false;
let dummyBots = new Map();

function updateScoreboard() {
    if (!scoreboardList) return;
    scoreboardList.innerHTML = '';

    // Add Self
    const myRow = document.createElement('tr');
    myRow.innerHTML = `<td style="padding: 4px 0;">${window.playerName || 'Player'} (You)</td><td style="text-align: right; padding: 4px 0; color: #86efac;">0ms</td>`;
    scoreboardList.appendChild(myRow);

    // Add Peers
    if (window.networkManager) {
        window.networkManager.peers.forEach((peer, peerId) => {
            const hasPing = window.networkManager.latencies && window.networkManager.latencies.has(peerId);
            const ping = hasPing ? window.networkManager.latencies.get(peerId) : '?';
            const color = ping !== '?' ? (ping < 100 ? '#86efac' : (ping < 250 ? '#fde047' : '#fca5a5')) : '#94a3b8';

            const row = document.createElement('tr');
            row.innerHTML = `<td style="padding: 4px 0;">Peer ${peerId.substring(0, 4)}</td><td style="text-align: right; padding: 4px 0; color: ${color};">${ping}${ping !== '?' ? 'ms' : ''}</td>`;
            scoreboardList.appendChild(row);
        });
    }

    // Add Bots
    dummyBots.forEach((bot, botId) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td style="padding: 4px 0;">Bot ${botId.substring(0, 4)}</td><td style="text-align: right; padding: 4px 0; color: #94a3b8;">Bot</td>`;
        scoreboardList.appendChild(row);
    });
}

// Audio setup
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);
masterGain.gain.value = 0.5; // Default volume matching HTML slider
const customAudioBuffers = {};

['jump', 'place', 'break', 'door'].forEach(type => {
    const input = document.getElementById(`sound-${type}`);
    if (input) {
        input.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                customAudioBuffers[type] = audioBuffer;
            } else {
                delete customAudioBuffers[type];
            }
        });
    }
});

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (customAudioBuffers[type]) {
        const source = audioCtx.createBufferSource();
        source.buffer = customAudioBuffers[type];
        source.connect(masterGain);
        source.start();
        return;
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(masterGain);

    if (type === 'jump') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'place') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'break') {
        osc.type = 'sawtooth';
        // Add minimal noise variation
        osc.frequency.setValueAtTime(200 + Math.random() * 50, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'door') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'firework_launch') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.5);

        let filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, audioCtx.currentTime);

        osc.connect(filter);
        filter.connect(gainNode);

        gainNode.gain.setValueAtTime(0.0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    } else if (type === 'firework_explode') {
        osc.type = 'square';

        // Quick high to low freq for pop
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.8);

        // Static crackle emulation
        const bufferSize = audioCtx.sampleRate * 0.8;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        let noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 1000;

        let noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
        noiseGain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noise.start();

        gainNode.gain.setValueAtTime(0.0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);

        osc.connect(gainNode);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.8);
    }
}

// Settings
const chunkSize = 16;
const chunkHeight = 64;
let renderDistance = 3; // Number of chunks in each direction


// State
let selectedBlockType = 1;
const chunks = new Map();
const pendingDecorations = new Map();
const blocks = {
    1: { name: 'Grass', category: 'Terrain' },
    2: { name: 'Dirt', category: 'Terrain' },
    3: { name: 'Stone', category: 'Terrain' },
    4: { name: 'Sand', category: 'Terrain' },
    5: { name: 'Neon', category: 'Building' },
    6: { name: 'Wood', category: 'Building' },
    7: { name: 'Brick', category: 'Building' },
    8: { name: 'GlassPane', category: 'Building' },
    9: { name: 'Fence', category: 'Building' },
    10: { name: 'Rail', category: 'Building' },
    11: { name: 'Door', category: 'Building' },
    12: { name: 'Shutter', category: 'Building' }
};

for (let i = 13; i <= 100; i++) {
    let name = `Block ${i}`;
    let category = 'Misc';

    if (i >= 13 && i <= 28) { name = `Wallpaper ${i - 12}`; category = 'Wallpapers'; }
    else if (i === 29) { name = `Paintable Block`; category = 'Building'; }
    else if (i === 30) { name = `Sign`; category = 'Building'; }
    else if (i >= 31 && i <= 38) { continue; }
    else if (i >= 39 && i <= 48) { name = `Ore ${i - 38}`; category = 'Ores'; }
    else if (i >= 49 && i <= 62) { continue; }
    else if (i >= 63 && i <= 68) { name = `Flower ${i - 62}`; category = 'Flowers'; }
    else if (i >= 69 && i <= 72) { name = `Bed ${i - 68}`; category = 'Beds'; }
    else if (i >= 73 && i <= 80) { name = `Kitchen Appliance ${i - 72}`; category = 'Kitchen'; }
    else if (i === 81) { name = 'Leaves'; category = 'Flora'; }
    else if (i === 82) { name = 'Tall Grass'; category = 'Flora'; }
    else if (i === 83) { name = 'Firework Box'; category = 'Misc'; }
    else if (i === 84) { name = 'Small Rock'; category = 'Flora'; }
    else if (i === 85) { name = 'Oak Planks'; category = 'House Materials'; }
    else if (i === 86) { name = 'Dark Oak Planks'; category = 'House Materials'; }
    else if (i === 87) { name = 'Birch Planks'; category = 'House Materials'; }
    else if (i === 88) { name = 'Spruce Planks'; category = 'House Materials'; }
    else if (i === 89) { name = 'Cobblestone'; category = 'House Materials'; }
    else if (i === 90) { name = 'Stone Bricks'; category = 'House Materials'; }
    else if (i === 91) { name = 'Mossy Stone Bricks'; category = 'House Materials'; }
    else if (i === 92) { name = 'Cracked Stone Bricks'; category = 'House Materials'; }
    else if (i === 93) { name = 'Red Roof Tiles'; category = 'House Materials'; }
    else if (i === 94) { name = 'Blue Roof Tiles'; category = 'House Materials'; }
    else if (i === 95) { name = 'Slate Roof Tiles'; category = 'House Materials'; }
    else if (i === 96) { name = 'Hardwood Floor'; category = 'House Materials'; }
    else if (i === 97) { name = 'Checkerboard Floor'; category = 'House Materials'; }
    else if (i === 98) { name = 'White Concrete'; category = 'House Materials'; }
    else if (i === 99) { name = 'Gray Concrete'; category = 'House Materials'; }
    else if (i === 100) { name = 'Black Concrete'; category = 'House Materials'; }

    blocks[i] = { name, category };
}

if (sniperReplaceTarget && sniperReplaceWith) {
    for (const [id, block] of Object.entries(blocks)) {
        let opt1 = document.createElement('option');
        opt1.value = id; opt1.innerText = block.name;
        sniperReplaceTarget.appendChild(opt1);

        let opt2 = document.createElement('option');
        opt2.value = id; opt2.innerText = block.name;
        sniperReplaceWith.appendChild(opt2);
    }
}

let currentNeonColor = new THREE.Color(0x00ffff);
let currentNeonIntensity = 2.0;
let qMenuOpen = false;
let isAdminMode = false;

let toolMode = 'standard';
let sniperShape = 'sphere';
let sniperBrush = 'erode';
let sniperRadius = 2;
let replaceTargetId = 1;
let replaceWithId = 1;

if (neonColorPicker) {
    neonColorPicker.addEventListener('input', (e) => {
        currentNeonColor.set(e.target.value);
        neonColorPicker.style.boxShadow = `0 0 20px ${e.target.value}80`;
        if (inventoryColorPicker) inventoryColorPicker.value = e.target.value;
    });
}
if (inventoryColorPicker) {
    inventoryColorPicker.addEventListener('input', (e) => {
        currentNeonColor.set(e.target.value);
        if (neonColorPicker) {
            neonColorPicker.value = e.target.value;
            neonColorPicker.style.boxShadow = `0 0 20px ${e.target.value}80`;
        }
    });
}
if (adminModeToggle) {
    adminModeToggle.addEventListener('change', (e) => {
        isAdminMode = e.target.checked;
    });
}
if (toolModeSelect) {
    toolModeSelect.addEventListener('change', (e) => {
        toolMode = e.target.value;
        if (toolMode === 'sniper') {
            sniperSettings.style.opacity = '1';
            sniperSettings.style.pointerEvents = 'auto';
        } else {
            sniperSettings.style.opacity = '0.3';
            sniperSettings.style.pointerEvents = 'none';
        }
    });
}
if (sniperShapeSelect) sniperShapeSelect.addEventListener('change', e => sniperShape = e.target.value);
if (sniperBrushSelect) {
    sniperBrushSelect.addEventListener('change', e => {
        sniperBrush = e.target.value;
        if (sniperBrush === 'replace') {
            if (sniperReplaceSettings) sniperReplaceSettings.style.display = 'block';
        } else {
            if (sniperReplaceSettings) sniperReplaceSettings.style.display = 'none';
        }
    });
}
if (sniperReplaceTarget) sniperReplaceTarget.addEventListener('change', e => replaceTargetId = parseInt(e.target.value));
if (sniperReplaceWith) sniperReplaceWith.addEventListener('change', e => replaceWithId = parseInt(e.target.value));
if (sniperRadiusInput) {
    sniperRadiusInput.addEventListener('input', e => {
        sniperRadius = parseInt(e.target.value);
        radiusVal.innerText = sniperRadius;
    });
}

if (serverNameInput) {
    serverNameInput.addEventListener('input', (e) => {
        if (hudServerName) hudServerName.innerText = e.target.value;
    });
}
if (publicServerToggle) {
    publicServerToggle.addEventListener('change', (e) => {
        isPublicServer = e.target.checked;
        if (hudServerStatus) {
            hudServerStatus.innerText = isPublicServer ? 'Public Mode' : 'Private Mode';
            hudServerStatus.style.color = isPublicServer ? '#6ee7b7' : '#fca5a5';
        }
        if (!isPublicServer) {
            // Remove all dummy bots
            for (let [botId, bot] of dummyBots) {
                if (typeof onPlayerDisconnect === 'function') onPlayerDisconnect(botId);
            }
            dummyBots.clear();
        }
    });
}

if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (text) {
                appendChatMessage(window.playerName || 'Player', text);
                sendBlockUpdate('chat', { text: text, playerName: window.playerName || 'Player' });
            }
            chatInput.value = '';
            chatInput.style.display = 'none';
            if (chatMessages) chatMessages.classList.remove('active');
            isChatting = false;
            controls.lock();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            chatInput.value = '';
            chatInput.style.display = 'none';
            if (chatMessages) chatMessages.classList.remove('active');
            isChatting = false;
            if (document.activeElement) document.activeElement.blur();
            controls.lock();
        }
    });

    chatInput.addEventListener('blur', () => {
        if (isChatting && !controls.isLocked) {
            chatInput.style.display = 'none';
            if (chatMessages) chatMessages.classList.remove('active');
            isChatting = false;
        }
    });
}

function appendChatMessage(name, text) {
    if (!chatMessages) return;
    const el = document.createElement('div');
    el.className = 'chat-message';
    // Remove tags to prevent generic HTML injection
    const sanitizedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const sanitizedName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    el.innerHTML = `<strong style="color: #60a5fa;">${sanitizedName}:</strong> ${sanitizedText}`;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (chatMessages.childElementCount > 50) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

// Three.js Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue
scene.fog = new THREE.Fog(0x87CEEB, 20, renderDistance * chunkSize);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
appDiv.appendChild(renderer.domElement);
const inventoryContainer = document.getElementById('inventory-container');
const inventoryMenu = document.getElementById('inventory-menu');
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas?.getContext('2d');
const timeSlider = document.getElementById('time-slider');
const renderDistSlider = document.getElementById('render-dist-slider');
const flightSlider = document.getElementById('flight-slider');
const lightSlider = document.getElementById('light-slider');
const volumeSlider = document.getElementById('volume-slider');
let isInventoryOpen = false;
let showMinimap = true;

// Hotbar state tracking
let activeHotbarSlot = 0;
const hotbarContents = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // initial layout

function updateHotbarUI() {
    hotbarSlots.forEach((slot, index) => {
        slot.classList.toggle('active', index === activeHotbarSlot);
        const blockId = hotbarContents[index];

        if (window.iconDataURLs && window.iconDataURLs[blockId]) {
            slot.style.backgroundColor = 'transparent';
            slot.style.backgroundImage = `url(${window.iconDataURLs[blockId]})`;
            slot.style.backgroundSize = 'cover';
            slot.style.imageRendering = 'pixelated';
        } else {
            // Fallback
            if (blockId <= 12) slot.style.backgroundColor = `hsl(${(blockId * 40) % 360}, 60%, 50%)`;
            else slot.style.backgroundColor = `hsl(${((blockId * 17) % 360)}, 60%, 50%)`;
        }
        slot.innerText = '';
    });
    selectedBlockType = hotbarContents[activeHotbarSlot];
}

// Hotbar Tooltips
hotbarSlots.forEach((slot, index) => {
    slot.addEventListener('mouseenter', (e) => {
        if (inventoryTooltip) {
            inventoryTooltip.style.display = 'block';
            inventoryTooltip.innerText = blocks[hotbarContents[index]]?.name || 'Unknown';
            inventoryTooltip.style.left = e.pageX + 15 + 'px';
            inventoryTooltip.style.top = e.pageY + 15 + 'px';
        }
    });
    slot.addEventListener('mousemove', (e) => {
        if (inventoryTooltip) {
            inventoryTooltip.style.left = e.pageX + 15 + 'px';
            inventoryTooltip.style.top = e.pageY + 15 + 'px';
            inventoryTooltip.innerText = blocks[hotbarContents[index]]?.name || 'Unknown';
        }
    });
    slot.addEventListener('mouseleave', () => {
        if (inventoryTooltip) inventoryTooltip.style.display = 'none';
    });
});

function initInventoryUI() {
    if (!inventoryContainer || inventoryContainer.children.length > 0) return;

    // Group blocks by category
    const categories = {};
    for (let i = 1; i <= 100; i++) {
        if (!blocks[i]) continue;
        const cat = blocks[i].category || 'Misc';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(i);
    }

    for (const [category, itemIds] of Object.entries(categories)) {
        const section = document.createElement('div');

        const header = document.createElement('h2');
        header.innerText = category;
        header.style.color = '#e2e8f0';
        header.style.marginBottom = '12px';
        header.style.fontSize = '1.3rem';
        header.style.textAlign = 'left';
        header.style.fontFamily = 'sans-serif';
        header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        header.style.paddingBottom = '8px';
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(64px, 1fr))';
        grid.style.gap = '12px';

        for (const i of itemIds) {
            const item = document.createElement('div');
            item.style.width = '64px';
            item.style.height = '64px';

            if (window.iconDataURLs && window.iconDataURLs[i]) {
                item.style.backgroundColor = 'transparent';
                item.style.backgroundImage = `url(${window.iconDataURLs[i]})`;
                item.style.backgroundSize = 'cover';
                item.style.imageRendering = 'pixelated';
            } else {
                if (i <= 12) item.style.backgroundColor = `hsl(${(i * 40) % 360}, 60%, 50%)`;
                else item.style.backgroundColor = `hsl(${((i * 17) % 360)}, 60%, 50%)`;
            }

            item.style.borderRadius = '8px';
            item.style.cursor = 'pointer';
            item.style.border = '2px solid rgba(255,255,255,0.2)';

            item.addEventListener('mouseenter', (e) => {
                item.style.border = '2px solid white';
                if (inventoryTooltip) {
                    inventoryTooltip.style.display = 'block';
                    inventoryTooltip.innerText = blocks[i]?.name || `Block ${i}`;
                    inventoryTooltip.style.left = e.pageX + 15 + 'px';
                    inventoryTooltip.style.top = e.pageY + 15 + 'px';
                }
            });
            item.addEventListener('mousemove', (e) => {
                if (inventoryTooltip) {
                    inventoryTooltip.style.left = e.pageX + 15 + 'px';
                    inventoryTooltip.style.top = e.pageY + 15 + 'px';
                }
            });
            item.addEventListener('mouseleave', () => {
                item.style.border = '2px solid rgba(255,255,255,0.2)';
                if (inventoryTooltip) {
                    inventoryTooltip.style.display = 'none';
                }
            });

            item.addEventListener('click', () => {
                hotbarContents[activeHotbarSlot] = i;
                updateHotbarUI();

                // Auto close inventory
                inventoryMenu.classList.add('hidden');
                controls.lock();
                isInventoryOpen = false;
            });
            grid.appendChild(item);
        }

        section.appendChild(grid);
        inventoryContainer.appendChild(section);
    }
}

if (timeSlider) {
    timeSlider.addEventListener('input', e => {
        document.getElementById('time-val').innerText = e.target.value;
        const time = parseInt(e.target.value);
        // Map 0-2400 to sun position
        const angle = (time / 2400) * Math.PI * 2 - Math.PI / 2;
        dirLight.position.set(Math.cos(angle) * 500, Math.sin(angle) * 500, 200);
        // Change sky color based on time
        const skyColor = new THREE.Color().setHSL(0.55, 0.4, Math.max(0.05, Math.sin(angle)));
        scene.background = skyColor;
        scene.fog.color = skyColor;
    });
}
if (renderDistSlider) {
    renderDistSlider.addEventListener('input', e => {
        document.getElementById('render-dist-val').innerText = e.target.value + ' Chunks';
        renderDistance = parseInt(e.target.value);
        scene.fog.far = renderDistance * chunkSize;
        forceUpdateChunks = true;
    });
}
if (flightSlider) flightSlider.addEventListener('input', e => {
    document.getElementById('flight-val').innerText = (e.target.value / 10) + 'x';
});
if (lightSlider) lightSlider.addEventListener('input', e => {
    document.getElementById('light-val').innerText = (e.target.value / 10);
    ambientLight.intensity = e.target.value / 10;
});
if (volumeSlider) volumeSlider.addEventListener('input', e => {
    document.getElementById('volume-val').innerText = e.target.value + '%';
    masterGain.gain.value = e.target.value / 100;
});

const interactableMeshes = []; // Meshes robust enough for native raycasting (instanced and painted meshes)

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
dirLight.position.set(200, 300, 200);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 1000;
dirLight.shadow.camera.left = -200;
dirLight.shadow.camera.right = 200;
dirLight.shadow.camera.top = 200;
dirLight.shadow.camera.bottom = -200;
dirLight.shadow.bias = -0.0005; // Tight bias to prevent acne/bleeding
scene.add(dirLight);

// Controls
const controls = new PointerLockControls(camera, document.body);

playBtn.addEventListener('click', () => {
    const inputName = document.getElementById('player-name-input').value.trim();
    window.playerName = inputName || 'Player_' + Math.floor(Math.random() * 1000);
    if (document.activeElement) document.activeElement.blur();
    controls.lock();
});

let lastLockTime = 0;

controls.addEventListener('lock', () => {
    lastLockTime = performance.now();
    overlay.classList.add('hidden');
    qMenu.classList.add('hidden');
    qMenuOpen = false;
});

// Fix browser pointer lock camera jump bug
document.addEventListener('mousemove', (e) => {
    if (controls.isLocked) {
        // Discard events right after locking to avoid centering snap
        if (performance.now() - lastLockTime < 150) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            return;
        }

        if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            return;
        }
    }
}, true);

controls.addEventListener('unlock', () => {
    if (!qMenuOpen && !isInventoryOpen && !isChatting) {
        overlay.classList.remove('hidden');
    }
});

// UI Event Listeners
document.addEventListener('wheel', (e) => {
    if (controls.isLocked) {
        if (e.deltaY > 0) {
            activeHotbarSlot = (activeHotbarSlot + 1) % 9;
            updateHotbarUI();
        } else if (e.deltaY < 0) {
            activeHotbarSlot = (activeHotbarSlot - 1 + 9) % 9;
            updateHotbarUI();
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T' || e.key === 'Enter') {
        if (controls.isLocked && !isChatting) {
            e.preventDefault();
            isChatting = true;
            controls.unlock();
            if (chatInput) {
                chatInput.style.display = 'block';
                chatInput.value = '';
                if (chatMessages) chatMessages.classList.add('active');
                setTimeout(() => chatInput.focus(), 10);
            }
            return;
        }
    }

    if (isChatting) return;

    if (e.key.toLowerCase() === 'q') {
        if (controls.isLocked) {
            qMenuOpen = true;
            controls.unlock();
            qMenu.classList.remove('hidden');
            if (typeof updatePlayerListUI === 'function') updatePlayerListUI();
        } else if (qMenuOpen) {
            qMenu.classList.add('hidden');
            controls.lock();
            qMenuOpen = false;
        }
        return;
    }

    if (e.key.toLowerCase() === 'i') {
        if (controls.isLocked) {
            isInventoryOpen = true;
            controls.unlock();
            inventoryMenu.classList.remove('hidden');
        } else if (isInventoryOpen) {
            inventoryMenu.classList.add('hidden');
            if (document.activeElement) document.activeElement.blur();
            controls.lock();
            isInventoryOpen = false;
        }
        return;
    }

    if (e.key === 'Escape') {
        if (isInventoryOpen) {
            inventoryMenu.classList.add('hidden');
            if (document.activeElement) document.activeElement.blur();
            controls.lock();
            isInventoryOpen = false;
        }
        return;
    }

    if (e.key.toLowerCase() === 'm') {
        showMinimap = !showMinimap;
        if (minimapCanvas) minimapCanvas.style.display = showMinimap ? 'block' : 'none';
        return;
    }

    if (e.key.toLowerCase() === 'u' && isAdminMode) {
        if (undoStack.length > 0) {
            const group = undoStack.pop();
            isUndoing = true;
            for (let i = group.length - 1; i >= 0; i--) {
                const act = group[i];
                if (act.kind === 'setBlock') {
                    setBlock(act.x, act.y, act.z, act.type, act.customData);
                    updateNeighbors(act.x, act.z);
                } else if (act.kind === 'setOffsetBlock') {
                    setOffsetBlock(act.x, act.y, act.z, act.type, act.customData);
                } else if (act.kind === 'paintFace') {
                    applyPaintFace(act.bwX, act.bwY, act.bwZ, act.faceIdx, act.colorData);
                }
            }
            isUndoing = false;
            playSound('place');
            appendChatMessage('System', 'Undid last action.');
        } else {
            appendChatMessage('System', 'Nothing to undo.');
        }
        return;
    }

    if (qMenuOpen || !controls.isLocked) return;

    if (e.key >= '1' && e.key <= '9') {
        activeHotbarSlot = parseInt(e.key) - 1;
        updateHotbarUI();
    }
});

// Physics and Movement Vectors
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const playerVelocity = 40.0;
const gravity = -30.0;
const jumpSpeed = 15.0;

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;
let canJump = false;
let isFlying = false;

document.addEventListener('keydown', (event) => {
    if (event.code === 'Tab') {
        event.preventDefault();
        scoreboard.style.display = 'block';
        updateScoreboard();
        return;
    }

    if (qMenuOpen || !controls.isLocked) return;
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'KeyP':
            if (isAdminMode) {
                if (toolMode === 'paint') {
                    toolModeSelect.value = 'standard';
                } else {
                    toolModeSelect.value = 'paint';
                }
                toolModeSelect.dispatchEvent(new Event('change'));
            }
            break;
        case 'KeyR':
        // Fallthrough to block rotation
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'PageUp':
        case 'PageDown':
            if (lastPlacedBlock) {
                if (isAdminMode) {
                    currentUndoGroup = [];
                }

                if (lastPlacedBlock.isOffset) {
                    setOffsetBlock(lastPlacedBlock.x, lastPlacedBlock.y, lastPlacedBlock.z, 0);
                } else {
                    setBlock(lastPlacedBlock.x, lastPlacedBlock.y, lastPlacedBlock.z, 0);
                    updateNeighbors(lastPlacedBlock.x, lastPlacedBlock.z);
                    lastPlacedBlock.isOffset = true;
                    // Standard blocks are rendered at +0.5 from their grid indices!
                    lastPlacedBlock.x += 0.5;
                    lastPlacedBlock.y += 0.5;
                    lastPlacedBlock.z += 0.5;
                }

                if (event.shiftKey) {
                    if (event.code === 'ArrowUp') lastPlacedBlock.y += 0.0625;
                    if (event.code === 'ArrowDown') lastPlacedBlock.y -= 0.0625;
                } else {
                    let lookDir = new THREE.Vector3();
                    camera.getWorldDirection(lookDir);
                    let dx = 0; let dz = 0;

                    if (Math.abs(lookDir.x) > Math.abs(lookDir.z)) {
                        if (lookDir.x > 0) { // Facing East (+X)
                            if (event.code === 'ArrowUp') dx = 0.0625;
                            else if (event.code === 'ArrowDown') dx = -0.0625;
                            else if (event.code === 'ArrowLeft') dz = -0.0625;
                            else if (event.code === 'ArrowRight') dz = 0.0625;
                        } else { // Facing West (-X)
                            if (event.code === 'ArrowUp') dx = -0.0625;
                            else if (event.code === 'ArrowDown') dx = 0.0625;
                            else if (event.code === 'ArrowLeft') dz = 0.0625;
                            else if (event.code === 'ArrowRight') dz = -0.0625;
                        }
                    } else {
                        if (lookDir.z > 0) { // Facing South (+Z)
                            if (event.code === 'ArrowUp') dz = 0.0625;
                            else if (event.code === 'ArrowDown') dz = -0.0625;
                            else if (event.code === 'ArrowLeft') dx = 0.0625;
                            else if (event.code === 'ArrowRight') dx = -0.0625;
                        } else { // Facing North (-Z)
                            if (event.code === 'ArrowUp') dz = -0.0625;
                            else if (event.code === 'ArrowDown') dz = 0.0625;
                            else if (event.code === 'ArrowLeft') dx = -0.0625;
                            else if (event.code === 'ArrowRight') dx = 0.0625;
                        }
                    }
                    lastPlacedBlock.x += dx;
                    lastPlacedBlock.z += dz;
                }

                if (event.code === 'KeyR') {
                    if (!lastPlacedBlock.customData) lastPlacedBlock.customData = {};
                    lastPlacedBlock.customData.rot = (lastPlacedBlock.customData.rot || 0) + Math.PI / 2;
                }

                let cData = lastPlacedBlock.customData ? { ...lastPlacedBlock.customData, isOffset: true } : { isOffset: true };
                setOffsetBlock(lastPlacedBlock.x, lastPlacedBlock.y, lastPlacedBlock.z, lastPlacedBlock.type, cData);

                if (isAdminMode && currentUndoGroup) {
                    if (currentUndoGroup.length > 0) {
                        undoStack.push(currentUndoGroup);
                        if (undoStack.length > 10) undoStack.shift();
                    }
                    currentUndoGroup = null;
                }
            }
            break;
        case 'KeyE':
            raycaster.setFromCamera(centerElement, camera);
            const intersectsSign = raycaster.intersectObjects(interactableMeshes);
            if (intersectsSign.length > 0) {
                const hit = intersectsSign[0];
                let blockCenter = new THREE.Vector3();
                if (hit.object.isInstancedMesh) {
                    const matrix = new THREE.Matrix4();
                    hit.object.getMatrixAt(hit.instanceId, matrix);
                    blockCenter.setFromMatrixPosition(matrix);
                } else if (hit.object.userData && hit.object.userData.isSmart) {
                    blockCenter.set(hit.object.userData.cx, hit.object.userData.cy, hit.object.userData.cz);
                } else {
                    blockCenter.copy(hit.object.position);
                }
                const isOffsetBlock = hit.object.userData?.isOffset || (
                    !Number.isInteger(blockCenter.x - 0.5) ||
                    !Number.isInteger(blockCenter.y - 0.5) ||
                    !Number.isInteger(blockCenter.z - 0.5)
                );

                let targetType = 0;
                let cData = null;
                if (isOffsetBlock) {
                    const cx = Math.floor(blockCenter.x / chunkSize);
                    const cz = Math.floor(blockCenter.z / chunkSize);
                    const cKey = `${cx},${cz}`;
                    if (chunks.has(cKey)) {
                        const ob = chunks.get(cKey).offsetBlocks.find(o => o.x === blockCenter.x && o.y === blockCenter.y && o.z === blockCenter.z);
                        if (ob) {
                            targetType = ob.type;
                            cData = ob;
                        }
                    }
                } else {
                    const bx = Math.floor(blockCenter.x);
                    const by = Math.floor(blockCenter.y);
                    const bz = Math.floor(blockCenter.z);
                    targetType = getBlock(bx, by, bz);
                    const cx = Math.floor(bx / chunkSize);
                    const cz = Math.floor(bz / chunkSize);
                    const cKey = `${cx},${cz}`;
                    const customKey = `${bx - cx * chunkSize},${by},${bz - cz * chunkSize}`;
                    if (chunks.has(cKey) && chunks.get(cKey).customData.has(customKey)) {
                        cData = chunks.get(cKey).customData.get(customKey);
                    }
                }

                if (targetType === 30 && cData && cData.text) {
                    showSignText(cData.text);
                }
            }
            break;
        case 'KeyF':
            isFlying = !isFlying;
            if (!isFlying) { moveUp = false; moveDown = false; }
            break;
        case 'Space':
            event.preventDefault(); // Prevent spacebar from clicking focused UI elements
            if (isFlying) {
                moveUp = true;
            } else {
                if (canJump === true) {
                    velocity.y += jumpSpeed;
                    playSound('jump');
                }
                canJump = false;
            }
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            if (isFlying) moveDown = true;
            break;
    }
});

document.addEventListener('keyup', (event) => {
    if (event.code === 'Tab') {
        event.preventDefault();
        scoreboard.style.display = 'none';
        return;
    }

    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
        case 'Space': moveUp = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': moveDown = false; break;
    }
});

// Terrain Generation
const noise2D = createNoise2D();
const noise3D = createNoise3D();

const undoStack = [];
let currentUndoGroup = null;
let isUndoing = false;

function pushUndoAction(action) {
    if (currentUndoGroup) {
        currentUndoGroup.push(action);
    } else {
        undoStack.push([action]);
        if (undoStack.length > 10) undoStack.shift();
    }
}

function getBlock(x, y, z) {
    const chunkX = Math.floor(x / chunkSize);
    const chunkZ = Math.floor(z / chunkSize);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (chunks.has(chunkKey)) {
        const chunk = chunks.get(chunkKey);
        const bx = Math.floor(x) - chunkX * chunkSize;
        const bz = Math.floor(z) - chunkZ * chunkSize;
        const by = Math.floor(y);

        if (bx >= 0 && bx < chunkSize && by >= 0 && by < chunkHeight && bz >= 0 && bz < chunkSize) {
            return chunk.data[bx][by][bz];
        }
    }
    return 0; // Air
}

function setBlock(x, y, z, type, customBlockData = null, isRemote = false) {
    if (!isRemote) sendBlockUpdate('setBlock', { x, y, z, type, customBlockData });
    const chunkX = Math.floor(x / chunkSize);
    const chunkZ = Math.floor(z / chunkSize);
    const chunkKey = `${chunkX},${chunkZ}`;

    if (chunks.has(chunkKey)) {
        const chunk = chunks.get(chunkKey);
        const bx = Math.floor(x) - chunkX * chunkSize;
        const bz = Math.floor(z) - chunkZ * chunkSize;
        const by = Math.floor(y);

        if (bx >= 0 && bx < chunkSize && by >= 0 && by < chunkHeight && bz >= 0 && bz < chunkSize) {
            const oldValue = chunk.data[bx][by][bz];
            const localKey = `${bx},${by},${bz}`;

            let oldCustomData = null;
            if (chunk.customData.has(localKey)) {
                const pd = chunk.customData.get(localKey);
                oldCustomData = { ...pd };
                delete oldCustomData.light;
            }

            if (!isRemote && !isUndoing && isAdminMode) {
                if (oldValue !== type || JSON.stringify(oldCustomData) !== JSON.stringify(customBlockData)) {
                    pushUndoAction({ kind: 'setBlock', x, y, z, type: oldValue, customData: oldCustomData });
                }
            }

            chunk.data[bx][by][bz] = type;
            chunk.needsUpdate = true;

            // Clean up old custom data/lights
            if (oldValue === 5 && type !== 5) {
                if (chunk.customData.has(localKey)) {
                    const data = chunk.customData.get(localKey);
                    if (data.light) { scene.remove(data.light); data.light.dispose(); }
                    chunk.customData.delete(localKey);
                }
            }
            if (chunk.paintedFaces.has(localKey)) {
                chunk.paintedFaces.delete(localKey);
            }
            // we remove any offset blocks at exactly this coordinate for sanity
            chunk.offsetBlocks = chunk.offsetBlocks.filter(ob => !(ob.x === x && ob.y === y && ob.z === z));

            // Apply new custom data/lights
            if (type === 5 && customBlockData) {
                if (chunk.customData.has(localKey)) {
                    const data = chunk.customData.get(localKey);
                    if (data.light) { scene.remove(data.light); data.light.dispose(); }
                }

                const lightColor = customBlockData.color.clone();
                const light = new THREE.PointLight(lightColor, customBlockData.intensity * 2.0, 15);
                light.position.set(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.floor(z) + 0.5);
                light.castShadow = true;
                light.shadow.bias = -0.001; // fix acne
                scene.add(light);

                chunk.customData.set(localKey, {
                    color: lightColor,
                    intensity: customBlockData.intensity,
                    light: light
                });
            } else if (customBlockData) {
                chunk.customData.set(localKey, { ...customBlockData });
            }
            return true;
        }
    }
    return false;
}

function setOffsetBlock(x, y, z, type, customData = null, isRemote = false) {
    if (!isRemote) sendBlockUpdate('setOffsetBlock', { x, y, z, type, customData });
    const chunkX = Math.floor(x / chunkSize);
    const chunkZ = Math.floor(z / chunkSize);
    const chunkKey = `${chunkX},${chunkZ}`;
    if (chunks.has(chunkKey)) {
        const chunk = chunks.get(chunkKey);
        // Add or replace
        const existingIdx = chunk.offsetBlocks.findIndex(ob => ob.x === x && ob.y === y && ob.z === z);

        let oldType = 0;
        let oldCustomData = null;
        if (existingIdx > -1) {
            const ob = chunk.offsetBlocks[existingIdx];
            oldType = ob.type;
            oldCustomData = { ...ob };
            delete oldCustomData.x; delete oldCustomData.y; delete oldCustomData.z; delete oldCustomData.type;
        }

        if (!isRemote && !isUndoing && isAdminMode) {
            if (oldType !== type || JSON.stringify(oldCustomData) !== JSON.stringify(customData)) {
                pushUndoAction({ kind: 'setOffsetBlock', x, y, z, type: oldType, customData: oldCustomData });
            }
        }

        if (existingIdx > -1) {
            if (type === 0) {
                chunk.offsetBlocks.splice(existingIdx, 1);
            } else {
                chunk.offsetBlocks[existingIdx].type = type;
                if (customData) Object.assign(chunk.offsetBlocks[existingIdx], customData);
            }
        } else if (type !== 0) {
            chunk.offsetBlocks.push({ x, y, z, type, ...customData });
        }
        chunk.needsUpdate = true;
        return true;
    }
    return false;
}

function updateNeighbors(x, z) {
    const cx = Math.floor(x / chunkSize);
    const cz = Math.floor(z / chunkSize);
    const bx = Math.floor(x) - cx * chunkSize;
    const bz = Math.floor(z) - cz * chunkSize;

    if (bx === 0 && chunks.has(`${cx - 1},${cz}`)) chunks.get(`${cx - 1},${cz}`).needsUpdate = true;
    if (bx === chunkSize - 1 && chunks.has(`${cx + 1},${cz}`)) chunks.get(`${cx + 1},${cz}`).needsUpdate = true;
    if (bz === 0 && chunks.has(`${cx},${cz - 1}`)) chunks.get(`${cx},${cz - 1}`).needsUpdate = true;
    if (bz === chunkSize - 1 && chunks.has(`${cx},${cz + 1}`)) chunks.get(`${cx},${cz + 1}`).needsUpdate = true;
}

function generateChunkData(chunkX, chunkZ) {
    const data = new Array(chunkSize);
    for (let x = 0; x < chunkSize; x++) {
        data[x] = new Array(chunkHeight);
        for (let y = 0; y < chunkHeight; y++) {
            data[x][y] = new Array(chunkSize).fill(0);
        }
    }

    const worldXOffset = chunkX * chunkSize;
    const worldZOffset = chunkZ * chunkSize;
    const scaleCave = 0.05;

    for (let x = 0; x < chunkSize; x++) {
        for (let z = 0; z < chunkSize; z++) {
            const worldX = worldXOffset + x;
            const worldZ = worldZOffset + z;

            const scaleMain = 0.008; // Large wide features
            const scaleDetail = 0.04; // Small bumps
            let n1 = noise2D(worldX * scaleMain, worldZ * scaleMain);
            let n2 = noise2D(worldX * scaleDetail, worldZ * scaleDetail);
            let h = n1 * 0.8 + n2 * 0.2;

            // Map height to a smaller amplitude range (10-20) for flatter large plains
            h = Math.floor((h + 1) / 2 * 10) + 10;

            for (let y = 0; y < chunkHeight; y++) {
                let blockType = 0;
                if (y < h - 4) {
                    blockType = 3;
                } else if (y < h - 1) {
                    blockType = 2;
                } else if (y === h - 1) {
                    if (y <= 13) {
                        blockType = 4;
                    } else {
                        blockType = 1;
                    }
                }

                if (blockType !== 0 && y < h - 2) {
                    let n3 = noise3D(worldX * scaleCave, y * scaleCave, worldZ * scaleCave);
                    if (n3 > 0.4) {
                        blockType = 0; // Cave air
                    }
                }
                data[x][y][z] = blockType;
            }

            // Surface decorators
            let topY = h - 1;
            if (topY >= 0 && topY < chunkHeight && data[x][topY][z] === 1) {
                if (Math.random() < 0.1 && topY + 1 < chunkHeight) {
                    data[x][topY + 1][z] = 82; // Tall Grass
                } else if (Math.random() < 0.01 && topY + 1 < chunkHeight) {
                    data[x][topY + 1][z] = 84; // Small Surface Rock
                } else if (Math.random() < 0.005 && x > 6 && x < chunkSize - 6 && z > 6 && z < chunkSize - 6) {
                    // Tree Generation (Grand Fantasy)
                    let treeHeight = 10 + Math.floor(Math.random() * 8); // 10 to 17 blocks tall!

                    const placeDec = (px, py, pz, type) => {
                        if (py < 0 || py >= chunkHeight) return;
                        if (px >= 0 && px < chunkSize && pz >= 0 && pz < chunkSize) {
                            if (data[px][py][pz] === 0 || data[px][py][pz] === 81) data[px][py][pz] = type;
                        } else {
                            let cx = Math.floor(px / chunkSize);
                            let cz = Math.floor(pz / chunkSize);
                            let cKey = `${chunkX + cx},${chunkZ + cz}`;
                            let bx = px % chunkSize; if (bx < 0) bx += chunkSize;
                            let bz = pz % chunkSize; if (bz < 0) bz += chunkSize;
                            if (chunks.has(cKey)) {
                                let tChunk = chunks.get(cKey);
                                if (tChunk.data[bx][py][bz] === 0 || tChunk.data[bx][py][bz] === 81) {
                                    tChunk.data[bx][py][bz] = type;
                                    tChunk.needsUpdate = true;
                                }
                            } else {
                                if (!pendingDecorations.has(cKey)) pendingDecorations.set(cKey, []);
                                pendingDecorations.get(cKey).push({ bx, by: py, bz, type });
                            }
                        }
                    };

                    let trunkCurveX = 0;
                    let trunkCurveZ = 0;
                    let curveDirX = (Math.random() - 0.5) * 0.8;
                    let curveDirZ = (Math.random() - 0.5) * 0.8;

                    // Trunk
                    for (let ty = 0; ty < treeHeight; ty++) {
                        if (ty > treeHeight * 0.3) {
                            trunkCurveX += curveDirX;
                            trunkCurveZ += curveDirZ;
                        }
                        let currX = Math.floor(x + trunkCurveX);
                        let currZ = Math.floor(z + trunkCurveZ);

                        // Thicker trunk at base
                        let trunkRadius = ty < 3 ? 1 : 0;
                        for (let tx = -trunkRadius; tx <= trunkRadius; tx++) {
                            for (let tz = -trunkRadius; tz <= trunkRadius; tz++) {
                                // Round the base
                                if (Math.abs(tx) === 1 && Math.abs(tz) === 1 && ty > 0) continue;

                                let px = currX + tx;
                                let pz = currZ + tz;
                                placeDec(px, topY + 1 + ty, pz, 6); // Wood Trunk
                            }
                        }
                    }

                    // Canopy
                    let canopyLevels = 6 + Math.floor(Math.random() * 4);
                    let leafBottom = topY + 1 + treeHeight - canopyLevels;
                    let leafTop = topY + 1 + treeHeight + 2;

                    let finalTrunkX = Math.floor(x + trunkCurveX);
                    let finalTrunkZ = Math.floor(z + trunkCurveZ);

                    for (let ly = leafBottom; ly <= leafTop; ly++) {
                        if (ly >= chunkHeight) continue;

                        let levelRatio = (ly - leafBottom) / (leafTop - leafBottom);
                        // Huge sweeping canopy, wider in the lower middle
                        let radius = 4 + Math.sin(levelRatio * Math.PI) * 4.5;
                        if (levelRatio > 0.8) radius -= 2;

                        for (let lx = -Math.ceil(radius); lx <= Math.ceil(radius); lx++) {
                            for (let lz = -Math.ceil(radius); lz <= Math.ceil(radius); lz++) {
                                let dist = Math.sqrt(lx * lx + lz * lz);
                                // Add random noise for organic shape
                                if (dist <= radius + (Math.random() * 1.5 - 0.5) && Math.random() > 0.05) {
                                    let px = finalTrunkX + lx;
                                    let pz = finalTrunkZ + lz;
                                    placeDec(px, ly, pz, 81); // Leaves

                                    // Hanging moss / vines effect
                                    if (Math.random() < 0.08 && ly > topY + 4) {
                                        let dropLen = Math.floor(1 + Math.random() * 4);
                                        for (let d = 1; d <= dropLen; d++) {
                                            placeDec(px, ly - d, pz, 81);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let myKey = `${chunkX},${chunkZ}`;
    if (pendingDecorations.has(myKey)) {
        let decs = pendingDecorations.get(myKey);
        for (let d of decs) {
            if (data[d.bx][d.by][d.bz] === 0 || data[d.bx][d.by][d.bz] === 81) {
                data[d.bx][d.by][d.bz] = d.type;
            }
        }
        pendingDecorations.delete(myKey);
    }
    return data;
}

function generateTexture(type, id = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const noise = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

    if (type === 'dirt') {
        for (let i = 0; i < 256; i++) {
            ctx.fillStyle = `rgb(${noise(100, 130)}, ${noise(60, 90)}, ${noise(20, 40)})`;
            ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1);
        }
    } else if (type === 'grass_top') {
        for (let i = 0; i < 256; i++) {
            ctx.fillStyle = `rgb(${noise(40, 70)}, ${noise(120, 160)}, ${noise(30, 60)})`;
            ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1);
        }
    } else if (type === 'grass_side') {
        for (let x = 0; x < 16; x++) {
            let fringe = noise(2, 5);
            for (let y = 0; y < 16; y++) {
                if (y < fringe) ctx.fillStyle = `rgb(${noise(40, 70)}, ${noise(120, 160)}, ${noise(30, 60)})`;
                else ctx.fillStyle = `rgb(${noise(100, 130)}, ${noise(60, 90)}, ${noise(20, 40)})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    } else if (type === 'stone') {
        for (let i = 0; i < 256; i++) {
            let val = noise(100, 140);
            ctx.fillStyle = `rgb(${val}, ${val}, ${val})`;
            ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1);
        }
    } else if (type === 'sand') {
        for (let i = 0; i < 256; i++) {
            ctx.fillStyle = `rgb(${noise(200, 230)}, ${noise(180, 210)}, ${noise(120, 150)})`;
            ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1);
        }
    } else if (type === 'wood') {
        for (let i = 0; i < 256; i++) {
            let x = i % 16, y = Math.floor(i / 16);
            let v = noise(0, 1) > 0 ? 10 : -10;
            if (x % 4 === 0) v -= 20;
            ctx.fillStyle = `rgb(${140 + v}, ${90 + v}, ${50 + v})`;
            ctx.fillRect(x, y, 1, 1);
        }
    } else if (type === 'brick') {
        ctx.fillStyle = '#b22222'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#dddddd';
        for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
        ctx.fillRect(4, 1, 1, 3); ctx.fillRect(12, 1, 1, 3);
        ctx.fillRect(0, 5, 1, 3); ctx.fillRect(8, 5, 1, 3);
        ctx.fillRect(4, 9, 1, 3); ctx.fillRect(12, 9, 1, 3);
        ctx.fillRect(0, 13, 1, 3); ctx.fillRect(8, 13, 1, 3);
    } else if (type === 'glass') {
        ctx.fillStyle = 'rgba(150, 200, 255, 0.4)'; ctx.fillRect(0, 0, 16, 16);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, 16, 16);
        ctx.fillStyle = 'white'; ctx.fillRect(3, 3, 2, 8); ctx.fillRect(5, 3, 4, 2);
    } else if (type === 'rail') {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = '#654321'; ctx.fillRect(2, 2, 12, 2); ctx.fillRect(2, 7, 12, 2); ctx.fillRect(2, 12, 12, 2);
        ctx.fillStyle = '#aaaaaa'; ctx.fillRect(4, 0, 2, 16); ctx.fillRect(10, 0, 2, 16);
    } else if (type === 'door') {
        ctx.fillStyle = '#654321'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#4a2f15'; ctx.fillRect(2, 2, 12, 5); ctx.fillRect(2, 9, 12, 5);
        ctx.fillStyle = '#ddcc33'; ctx.fillRect(12, 8, 2, 2);
    } else if (type === 'wallpaper') {
        const hue = ((id * 40) % 360);
        ctx.fillStyle = `hsl(${hue}, 60%, 50%)`; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = `hsl(${hue}, 70%, 40%)`;
        if (id % 3 === 0) {
            for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 2, 16);
        } else if (id % 3 === 1) {
            for (let x = 0; x < 16; x += 4) for (let y = 0; y < 16; y += 4) if ((x + y) % 8 === 0) ctx.fillRect(x, y, 4, 4);
        } else {
            for (let x = 2; x < 16; x += 4) for (let y = 2; y < 16; y += 4) ctx.fillRect(x, y, 2, 2);
        }
    } else if (type === 'ore') {
        for (let i = 0; i < 256; i++) {
            let val = noise(100, 140);
            ctx.fillStyle = `rgb(${val}, ${val}, ${val})`;
            ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1);
        }
        const specColor = `hsl(${((id * 50) % 360)}, 80%, 60%)`;
        ctx.fillStyle = specColor;
        for (let j = 0; j < 8; j++) {
            ctx.fillRect(noise(2, 12), noise(2, 12), noise(1, 2), noise(1, 3));
        }
    } else if (type === 'bed_top') {
        const hue = ((id * 50) % 360);
        ctx.fillStyle = `hsl(${hue}, 60%, 50%)`; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 16, 6);
    } else if (type === 'bed_side') {
        ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0, 0, 16, 16); // wood
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 16, 4); // mattress part
    } else if (type === 'flower') {
        const hue = ((id * 60) % 360);
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = '#228b22'; ctx.fillRect(7, 8, 2, 8);
        ctx.fillRect(5, 10, 2, 1); ctx.fillRect(9, 12, 2, 1); // leaves
        ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
        ctx.beginPath(); ctx.arc(8, 5, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffff00'; ctx.beginPath(); ctx.arc(8, 5, 1.5, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'kitchen_oven') {
        ctx.fillStyle = '#dddddd'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#222222'; ctx.fillRect(2, 4, 12, 10);
        ctx.fillStyle = '#111111'; ctx.fillRect(3, 2, 2, 1); ctx.fillRect(7, 2, 2, 1); ctx.fillRect(11, 2, 2, 1);
    } else if (type === 'kitchen_cab') {
        ctx.fillStyle = '#bbbbbb'; ctx.fillRect(0, 0, 16, 16);
        ctx.strokeStyle = '#888888'; ctx.lineWidth = 1; ctx.strokeRect(1, 1, 14, 14);
        ctx.fillStyle = '#444444'; ctx.fillRect(13, 6, 1, 4);
    } else if (type === 'kitchen_top') {
        ctx.fillStyle = '#333333'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#555555'; ctx.fillRect(noise(0, 14), noise(0, 14), 2, 2); ctx.fillRect(noise(0, 14), noise(0, 14), 2, 2);
    } else if (type === 'leaves') {
        ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, 16, 16);
        for (let i = 0; i < 150; i++) {
            ctx.fillStyle = `rgb(${noise(20, 50)}, ${noise(100, 160)}, ${noise(20, 50)})`;
            ctx.fillRect(noise(0, 15), noise(0, 15), noise(2, 3), noise(2, 3));
        }
    } else if (type === 'tall_grass') {
        ctx.clearRect(0, 0, 16, 16);
        for (let i = 0; i < 20; i++) {
            ctx.fillStyle = `rgb(${noise(30, 60)}, ${noise(120, 180)}, ${noise(20, 50)})`;
            ctx.fillRect(noise(2, 14), noise(6, 15), 1, noise(4, 10));
        }
    } else if (type === 'firework_box') {
        ctx.fillStyle = '#cc2222'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(4, 0, 2, 16);
        ctx.fillRect(10, 0, 2, 16);
        ctx.fillStyle = '#111111';
        ctx.fillRect(7, 0, 2, 2);
    } else if (type === 'planks') {
        let baseR, baseG, baseB;
        if (id === 85) { baseR = 160; baseG = 120; baseB = 70; } // Oak
        else if (id === 86) { baseR = 70; baseG = 45; baseB = 25; } // Dark Oak
        else if (id === 87) { baseR = 210; baseG = 190; baseB = 140; } // Birch
        else if (id === 88) { baseR = 110; baseG = 75; baseB = 45; } // Spruce
        ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = `rgb(${baseR - 20}, ${baseG - 20}, ${baseB - 20})`;
        for (let i = 0; i < 16; i += 4) ctx.fillRect(0, i, 16, 1);
        ctx.fillRect(4, 0, 1, 4); ctx.fillRect(12, 4, 1, 4); ctx.fillRect(6, 8, 1, 4); ctx.fillRect(10, 12, 1, 4);
    } else if (type === 'cobble') {
        ctx.fillStyle = '#666'; ctx.fillRect(0, 0, 16, 16);
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = noise(0, 1) ? '#555' : '#777';
            ctx.fillRect(noise(0, 14), noise(0, 14), noise(2, 4), noise(2, 4));
        }
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, 16, 16);
    } else if (type === 'stone_bricks') {
        ctx.fillStyle = '#777'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#555';
        ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(7, 0, 1, 7); ctx.fillRect(15, 8, 1, 7);
        if (id === 91) { // Mossy
            for (let i = 0; i < 30; i++) { ctx.fillStyle = '#4a5'; ctx.fillRect(noise(0, 15), noise(0, 15), 1, 1); }
        } else if (id === 92) { // Cracked
            ctx.fillStyle = '#333';
            for (let i = 0; i < 10; i++) { ctx.fillRect(noise(2, 13), noise(2, 13), 1, 1); }
        }
    } else if (type === 'roof_tiles') {
        let sc; if (id === 93) sc = '#b33'; else if (id === 94) sc = '#33b'; else sc = '#445';
        ctx.fillStyle = sc; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let i = 0; i < 16; i += 4) ctx.fillRect(0, i + 3, 16, 1);
        for (let i = 0; i < 16; i += 4) { ctx.fillRect(i, 0, 1, 16); ctx.fillRect(i + 2, 0, 1, 16); }
    } else if (type === 'floor') {
        if (id === 96) { // Hardwood
            ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0, 0, 16, 16);
            ctx.fillStyle = '#6b4018';
            ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 8, 16, 2);
            ctx.fillRect(4, 0, 2, 8); ctx.fillRect(12, 8, 2, 8);
        } else { // Checkerboard
            for (let x = 0; x < 16; x += 8) {
                for (let y = 0; y < 16; y += 8) {
                    ctx.fillStyle = ((x + y) % 16 === 0) ? '#fff' : '#111';
                    ctx.fillRect(x, y, 8, 8);
                }
            }
        }
    } else if (type === 'concrete') {
        let c; if (id === 98) c = '#eee'; else if (id === 99) c = '#777'; else c = '#222';
        ctx.fillStyle = c; ctx.fillRect(0, 0, 16, 16);
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = noise(0, 1) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
            ctx.fillRect(noise(0, 15), noise(0, 15), 1, 1);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const texGrassTop = generateTexture('grass_top');
const texGrassSide = generateTexture('grass_side');
const texDirt = generateTexture('dirt');
const texStone = generateTexture('stone');
const texSand = generateTexture('sand');
const texWood = generateTexture('wood');
const texBrick = generateTexture('brick');
const texGlass = generateTexture('glass');
const texRail = generateTexture('rail');
const texDoor = generateTexture('door');

const geometry = new THREE.BoxGeometry(1, 1, 1);

const wedgeGeometry = new THREE.BoxGeometry(1, 1, 1);
const wedgePos = wedgeGeometry.attributes.position;
for (let i = 0; i < wedgePos.count; i++) {
    const y = wedgePos.getY(i);
    const z = wedgePos.getZ(i);
    if (y > 0) {
        wedgePos.setY(i, -0.8 * z + 0.1);
    } else {
        wedgePos.setY(i, -0.8 * z - 0.1);
    }
}
wedgeGeometry.computeVertexNormals();
const materials = {
    1: [
        new THREE.MeshStandardMaterial({ map: texGrassSide, roughness: 1.0, metalness: 0.0 }),
        new THREE.MeshStandardMaterial({ map: texGrassSide, roughness: 1.0, metalness: 0.0 }),
        new THREE.MeshStandardMaterial({ map: texGrassTop, roughness: 1.0, metalness: 0.0 }),
        new THREE.MeshStandardMaterial({ map: texDirt, roughness: 1.0, metalness: 0.0 }),
        new THREE.MeshStandardMaterial({ map: texGrassSide, roughness: 1.0, metalness: 0.0 }),
        new THREE.MeshStandardMaterial({ map: texGrassSide, roughness: 1.0, metalness: 0.0 })
    ],
    2: new THREE.MeshStandardMaterial({ map: texDirt, roughness: 1.0, metalness: 0.0 }),
    3: new THREE.MeshStandardMaterial({ map: texStone, roughness: 1.0, metalness: 0.0 }),
    4: new THREE.MeshStandardMaterial({ map: texSand, roughness: 1.0, metalness: 0.0 }),
    5: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    6: new THREE.MeshStandardMaterial({ map: texWood, roughness: 1.0, metalness: 0.0 }),
    7: new THREE.MeshStandardMaterial({ map: texBrick, roughness: 1.0, metalness: 0.0 }),
    8: new THREE.MeshStandardMaterial({ map: texGlass, transparent: true, side: THREE.DoubleSide }),
    9: new THREE.MeshStandardMaterial({ map: texWood, roughness: 1.0, metalness: 0.0 }),
    10: new THREE.MeshStandardMaterial({ map: texRail, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    11: new THREE.MeshStandardMaterial({ map: texDoor, roughness: 1.0, metalness: 0.0 }),
    12: new THREE.MeshStandardMaterial({ map: texWood, roughness: 1.0, metalness: 0.0 })
};

for (let i = 13; i <= 100; i++) {
    let mat;
    if (i >= 13 && i <= 28) mat = new THREE.MeshStandardMaterial({ map: generateTexture('wallpaper', i), roughness: 0.9 });
    else if (i >= 39 && i <= 48) mat = new THREE.MeshStandardMaterial({ map: generateTexture('ore', i), roughness: 0.8 });
    else if (i >= 63 && i <= 68) mat = new THREE.MeshStandardMaterial({ map: generateTexture('flower', i), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    else if (i >= 69 && i <= 72) {
        const top = new THREE.MeshStandardMaterial({ map: generateTexture('bed_top', i), roughness: 0.9 });
        const side = new THREE.MeshStandardMaterial({ map: generateTexture('bed_side', i), roughness: 0.9 });
        mat = [side, side, top, side, side, side];
    } else if (i >= 73 && i <= 80) {
        const front = new THREE.MeshStandardMaterial({ map: i % 2 === 0 ? generateTexture('kitchen_oven', i) : generateTexture('kitchen_cab', i), roughness: 0.4 });
        const side = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
        const top = new THREE.MeshStandardMaterial({ map: generateTexture('kitchen_top', i), roughness: 0.2 });
        mat = [side, side, top, side, front, side];
    } else if (i === 29) {
        mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    } else if (i === 81) {
        mat = new THREE.MeshStandardMaterial({ map: generateTexture('leaves'), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1.0 });
    } else if (i === 82) {
        mat = new THREE.MeshStandardMaterial({ map: generateTexture('tall_grass'), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    } else if (i === 83) {
        mat = new THREE.MeshStandardMaterial({ map: generateTexture('firework_box'), roughness: 0.8 });
    } else if (i === 84) {
        mat = new THREE.MeshStandardMaterial({ map: texStone, roughness: 1.0 });
    } else if (i >= 85 && i <= 88) {
        mat = new THREE.MeshStandardMaterial({ map: generateTexture('planks', i), roughness: 0.9 });
    } else if (i === 89) {
        mat = new THREE.MeshStandardMaterial({ map: generateTexture('cobble', i), roughness: 1.0 });
    } else if (i >= 90 && i <= 92) {
        mat = new THREE.MeshStandardMaterial({ map: generateTexture('stone_bricks', i), roughness: 0.9 });
    } else if (i >= 93 && i <= 95) {
        mat = new THREE.MeshStandardMaterial({ map: generateTexture('roof_tiles', i), roughness: 0.7 });
    } else if (i >= 96 && i <= 97) {
        mat = new THREE.MeshStandardMaterial({ map: generateTexture('floor', i), roughness: 0.4 });
    } else if (i >= 98 && i <= 100) {
        mat = new THREE.MeshStandardMaterial({ map: generateTexture('concrete', i), roughness: 0.9 });
    } else continue;
    materials[i] = mat;
}

window.iconDataURLs = {
    1: texGrassSide.image.toDataURL(),
    2: texDirt.image.toDataURL(),
    3: texStone.image.toDataURL(),
    4: texSand.image.toDataURL(),
    5: (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; const ctx = c.getContext('2d'); ctx.fillStyle = '#00ffff'; ctx.fillRect(0, 0, 16, 16); return c.toDataURL(); })(),
    6: texWood.image.toDataURL(),
    7: texBrick.image.toDataURL(),
    8: texGlass.image.toDataURL(),
    9: texWood.image.toDataURL(),
    10: texRail.image.toDataURL(),
    11: texDoor.image.toDataURL(),
    12: texWood.image.toDataURL()
};

for (let i = 13; i <= 100; i++) {
    if (i >= 13 && i <= 28) window.iconDataURLs[i] = generateTexture('wallpaper', i).image.toDataURL();
    else if (i >= 39 && i <= 48) window.iconDataURLs[i] = generateTexture('ore', i).image.toDataURL();
    else if (i >= 63 && i <= 68) window.iconDataURLs[i] = generateTexture('flower', i).image.toDataURL();
    else if (i >= 69 && i <= 72) window.iconDataURLs[i] = generateTexture('bed_top', i).image.toDataURL();
    else if (i >= 73 && i <= 80) window.iconDataURLs[i] = (i % 2 === 0 ? generateTexture('kitchen_oven', i) : generateTexture('kitchen_cab', i)).image.toDataURL();
    else if (i === 29) {
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(15, 0, 1, 16);
        ctx.fillRect(0, 0, 16, 1);
        ctx.fillRect(0, 0, 1, 16);
        window.iconDataURLs[i] = c.toDataURL();
    } else if (i === 81) {
        window.iconDataURLs[i] = generateTexture('leaves').image.toDataURL();
    } else if (i === 82) {
        window.iconDataURLs[i] = generateTexture('tall_grass').image.toDataURL();
    } else if (i === 83) {
        window.iconDataURLs[i] = generateTexture('firework_box').image.toDataURL();
    } else if (i === 84) {
        window.iconDataURLs[i] = texStone.image.toDataURL();
    } else if (i >= 85 && i <= 88) {
        window.iconDataURLs[i] = generateTexture('planks', i).image.toDataURL();
    } else if (i === 89) {
        window.iconDataURLs[i] = generateTexture('cobble', i).image.toDataURL();
    } else if (i >= 90 && i <= 92) {
        window.iconDataURLs[i] = generateTexture('stone_bricks', i).image.toDataURL();
    } else if (i >= 93 && i <= 95) {
        window.iconDataURLs[i] = generateTexture('roof_tiles', i).image.toDataURL();
    } else if (i >= 96 && i <= 97) {
        window.iconDataURLs[i] = generateTexture('floor', i).image.toDataURL();
    } else if (i >= 98 && i <= 100) {
        window.iconDataURLs[i] = generateTexture('concrete', i).image.toDataURL();
    } else continue;
}

// Initial UI Calls using the newly generated dataURLs!
updateHotbarUI();
initInventoryUI();

function buildChunkMesh(chunkKey) {
    const chunk = chunks.get(chunkKey);
    if (!chunk || !chunk.needsUpdate) return;

    if (chunk.meshes) {
        Object.values(chunk.meshes).forEach(mesh => {
            scene.remove(mesh);
            const idx = interactableMeshes.indexOf(mesh);
            if (idx > -1) interactableMeshes.splice(idx, 1);
            mesh.dispose();
        });
    }

    // Clear painted extra meshes
    if (chunk.extraMeshesObjects) {
        chunk.extraMeshesObjects.forEach(m => {
            scene.remove(m);
            const idx = interactableMeshes.indexOf(m);
            if (idx > -1) interactableMeshes.splice(idx, 1);
            if (m.material.userData && m.material.userData.isDynamic) m.material.dispose();
            m.geometry.dispose();
        });
    }

    chunk.meshes = {};
    chunk.extraMeshesObjects = [];
    const instancesCount = {};

    const instancedLocations = [];
    const smartLocations = [];

    // First pass: integer array blocks
    for (let x = 0; x < chunkSize; x++) {
        for (let y = 0; y < chunkHeight; y++) {
            for (let z = 0; z < chunkSize; z++) {
                const type = chunk.data[x][y][z];
                if (type !== 0) {
                    const localKey = `${x},${y},${z}`;
                    if (chunk.paintedFaces.has(localKey)) {
                        // Rebuild explicitly as a single mesh
                        continue;
                    }

                    // Simple culling
                    let exposed = false;
                    const isTransparent = (t) => t === 0 || t === 5 || (t >= 8 && t <= 12) || (t >= 63 && t <= 80) || t === 81 || t === 82 || t === 84 || (t >= 93 && t <= 95);
                    if (x === 0 || x === chunkSize - 1 || y === 0 || y === chunkHeight - 1 || z === 0 || z === chunkSize - 1) {
                        exposed = true;
                    } else if (
                        isTransparent(chunk.data[x + 1][y][z]) ||
                        isTransparent(chunk.data[x - 1][y][z]) ||
                        isTransparent(chunk.data[x][y + 1][z]) ||
                        isTransparent(chunk.data[x][y - 1][z]) ||
                        isTransparent(chunk.data[x][y][z + 1]) ||
                        isTransparent(chunk.data[x][y][z - 1])
                    ) {
                        exposed = true;
                    }

                    if (!exposed) continue;

                    if (type === 5 || (type >= 8 && type <= 12) || (type >= 63 && type <= 80) || type === 82 || type === 84 || (type >= 93 && type <= 95)) {
                        smartLocations.push({ bx: x, by: y, bz: z, type, isOffset: false });
                        continue;
                    }

                    if (exposed) {
                        instancesCount[type] = (instancesCount[type] || 0) + 1;
                        instancedLocations.push({ bx: x, by: y, bz: z, type, isOffset: false });
                    }
                }
            }
        }
    }

    // Add offset blocks to instance count
    chunk.offsetBlocks.forEach(ob => {
        if (ob.type === 5 || (ob.type >= 8 && ob.type <= 12) || (ob.type >= 63 && ob.type <= 80) || ob.type === 82 || ob.type === 84 || (ob.type >= 93 && ob.type <= 95)) {
            smartLocations.push(ob);
        } else {
            instancesCount[ob.type] = (instancesCount[ob.type] || 0) + 1;
            instancedLocations.push(ob);
        }
    });

    // Allocate InstancedMeshes
    Object.keys(instancesCount).forEach(type => {
        const count = instancesCount[type];
        if (count > 0) {
            const mesh = new THREE.InstancedMesh(geometry, materials[type], count);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
                depthPacking: THREE.RGBADepthPacking,
                alphaTest: 0.5
            });
            mesh.userData = { type: parseInt(type) };
            chunk.meshes[type] = mesh;
            scene.add(mesh);
            interactableMeshes.push(mesh);
        }
    });

    const instanceIndexes = {};
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const chunkWorldX = chunk.x * chunkSize;
    const chunkWorldZ = chunk.z * chunkSize;

    // Build Instances
    instancedLocations.forEach(loc => {
        const type = loc.type;
        const mesh = chunk.meshes[type];
        if (!instanceIndexes[type]) instanceIndexes[type] = 0;
        const idx = instanceIndexes[type]++;

        if (!loc.isOffset) {
            position.set(chunkWorldX + loc.bx + 0.5, loc.by + 0.5, chunkWorldZ + loc.bz + 0.5);
            matrix.setPosition(position);
            mesh.setMatrixAt(idx, matrix);

            if (type === 5) { // Neon custom color mapping
                const localKey = `${loc.bx},${loc.by},${loc.bz}`;
                if (chunk.customData.has(localKey)) {
                    const data = chunk.customData.get(localKey);
                    mesh.setColorAt(idx, data.color.clone().multiplyScalar(data.intensity));
                } else {
                    mesh.setColorAt(idx, new THREE.Color(0xffffff));
                }
            } else if (type === 29) { // Paintable block custom color mapping
                const localKey = `${loc.bx},${loc.by},${loc.bz}`;
                if (chunk.customData.has(localKey)) {
                    const data = chunk.customData.get(localKey);
                    mesh.setColorAt(idx, data.color.clone());
                } else {
                    mesh.setColorAt(idx, new THREE.Color(0xffffff));
                }
            }
        } else {
            // It's an offset block, we just use its raw x,y,z 
            position.set(loc.x, loc.y, loc.z);
            let rotY = loc.rot || 0;
            const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
            matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
            mesh.setMatrixAt(idx, matrix);
            if (type === 5) {
                if (loc.color && loc.intensity) {
                    mesh.setColorAt(idx, loc.color.clone().multiplyScalar(loc.intensity));
                } else {
                    mesh.setColorAt(idx, new THREE.Color(0xffffff));
                }
            } else if (type === 29) {
                if (loc.color) {
                    mesh.setColorAt(idx, loc.color.clone());
                } else {
                    mesh.setColorAt(idx, new THREE.Color(0xffffff));
                }
            }
        }
    });

    Object.values(chunk.meshes).forEach(mesh => {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    // Build Painted Meshes (Non-instanced per distinct painted face config)
    for (let x = 0; x < chunkSize; x++) {
        for (let y = 0; y < chunkHeight; y++) {
            for (let z = 0; z < chunkSize; z++) {
                const localKey = `${x},${y},${z}`;
                if (chunk.paintedFaces.has(localKey)) {
                    const blockType = chunk.data[x][y][z];
                    if (blockType !== 0) {
                        const _paintedMatsIndices = chunk.paintedFaces.get(localKey);
                        const matArray = [];
                        for (let i = 0; i < 6; i++) {
                            const faceData = _paintedMatsIndices[i];
                            let faceType = blockType;
                            let faceColor = null;
                            let faceIntensity = 1.0;
                            if (faceData !== undefined && faceData !== null) {
                                if (typeof faceData === 'object') {
                                    faceType = faceData.type;
                                    faceColor = faceData.color;
                                    faceIntensity = faceData.intensity || 1.0;
                                } else {
                                    faceType = faceData;
                                }
                            }

                            if (faceType === 29 && faceColor) {
                                matArray.push(new THREE.MeshStandardMaterial({ color: faceColor, roughness: 0.8 }));
                            } else if (faceType === 5 && faceColor) {
                                const nMat = new THREE.MeshBasicMaterial({ color: faceColor.clone().multiplyScalar(faceIntensity) });
                                nMat.userData = { isDynamic: true };
                                matArray.push(nMat);
                            } else {
                                const m = materials[faceType] || materials[3];
                                matArray.push(Array.isArray(m) ? m[i] : m);
                            }
                        }
                        const pMesh = new THREE.Mesh(geometry, matArray);
                        pMesh.position.set(chunkWorldX + x + 0.5, y + 0.5, chunkWorldZ + z + 0.5);
                        pMesh.castShadow = true;
                        pMesh.receiveShadow = true;
                        pMesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
                        scene.add(pMesh);
                        interactableMeshes.push(pMesh);
                        chunk.extraMeshesObjects.push(pMesh);
                    }
                }
            }
        }
    }

    // Smart Meshes (Type 8 to 12)
    smartLocations.forEach(loc => {
        const { bx, by, bz, type, isOffset } = loc;
        const wx = isOffset ? loc.x : chunkWorldX + bx + 0.5;
        const wy = isOffset ? loc.y : by + 0.5;
        const wz = isOffset ? loc.z : chunkWorldZ + bz + 0.5;

        const gx = Math.floor(wx);
        const gy = Math.floor(wy);
        const gz = Math.floor(wz);
        const nN = getBlock(gx, gy, gz - 1);
        const nS = getBlock(gx, gy, gz + 1);
        const nE = getBlock(gx + 1, gy, gz);
        const nW = getBlock(gx - 1, gy, gz);

        const meshes = [];
        const mat = materials[type] || materials[3];

        if (type === 5) { // Neon Tube
            let color = new THREE.Color(0xffffff);
            let intensity = 1.0;
            let dataKey = isOffset ? `${loc.x},${loc.y},${loc.z}` : `${bx},${by},${bz}`;
            if (isOffset && loc.color) {
                color = loc.color.clone();
                intensity = loc.intensity || 1.0;
            } else if (chunk.customData.has(dataKey)) {
                const data = chunk.customData.get(dataKey);
                color = data.color.clone();
                intensity = data.intensity;
            }
            const nMat = new THREE.MeshBasicMaterial({ color: color.multiplyScalar(intensity) });
            nMat.userData = { isDynamic: true };

            meshes.push(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), nMat));
            if (nN === 5) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.4), nMat); p.position.z = -0.3; meshes.push(p); }
            if (nS === 5) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.4), nMat); p.position.z = 0.3; meshes.push(p); }
            if (nE === 5) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.2), nMat); p.position.x = 0.3; meshes.push(p); }
            if (nW === 5) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.2), nMat); p.position.x = -0.3; meshes.push(p); }
            if (getBlock(gx, gy + 1, gz) === 5) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), nMat); p.position.y = 0.3; meshes.push(p); }
            if (getBlock(gx, gy - 1, gz) === 5) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), nMat); p.position.y = -0.3; meshes.push(p); }
        } else if (type === 8) { // Glass Pane
            meshes.push(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), mat));
            if (nN === 8 || (nN !== 0 && nN < 8)) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.45), mat); p.position.z = -0.275; meshes.push(p); }
            if (nS === 8 || (nS !== 0 && nS < 8)) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.45), mat); p.position.z = 0.275; meshes.push(p); }
            if (nE === 8 || (nE !== 0 && nE < 8)) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1, 0.1), mat); p.position.x = 0.275; meshes.push(p); }
            if (nW === 8 || (nW !== 0 && nW < 8)) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1, 0.1), mat); p.position.x = -0.275; meshes.push(p); }
        } else if (type === 9) { // Fence
            meshes.push(new THREE.Mesh(new THREE.BoxGeometry(0.25, 1, 0.25), mat));
            const armGeom = new THREE.BoxGeometry(0.1, 0.2, 0.45);
            const armGeomX = new THREE.BoxGeometry(0.45, 0.2, 0.1);
            if (nN === 9 || (nN !== 0 && nN < 8)) { const p1 = new THREE.Mesh(armGeom, mat); p1.position.set(0, 0.2, -0.275); const p2 = new THREE.Mesh(armGeom, mat); p2.position.set(0, -0.2, -0.275); meshes.push(p1, p2); }
            if (nS === 9 || (nS !== 0 && nS < 8)) { const p1 = new THREE.Mesh(armGeom, mat); p1.position.set(0, 0.2, 0.275); const p2 = new THREE.Mesh(armGeom, mat); p2.position.set(0, -0.2, 0.275); meshes.push(p1, p2); }
            if (nE === 9 || (nE !== 0 && nE < 8)) { const p1 = new THREE.Mesh(armGeomX, mat); p1.position.set(0.275, 0.2, 0); const p2 = new THREE.Mesh(armGeomX, mat); p2.position.set(0.275, -0.2, 0); meshes.push(p1, p2); }
            if (nW === 9 || (nW !== 0 && nW < 8)) { const p1 = new THREE.Mesh(armGeomX, mat); p1.position.set(-0.275, 0.2, 0); const p2 = new THREE.Mesh(armGeomX, mat); p2.position.set(-0.275, -0.2, 0); meshes.push(p1, p2); }
        } else if (type === 10) { // Rail
            const rM = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 1), mat);
            rM.position.y = -0.475;
            if (nN === 10 && nE === 10 && nS !== 10 && nW !== 10) { rM.rotation.y = Math.PI / 4; }
            else if (nN === 10 && nW === 10 && nS !== 10 && nE !== 10) { rM.rotation.y = -Math.PI / 4; }
            else if (nS === 10 && nE === 10 && nN !== 10 && nW !== 10) { rM.rotation.y = -Math.PI / 4; }
            else if (nS === 10 && nW === 10 && nN !== 10 && nE !== 10) { rM.rotation.y = Math.PI / 4; }
            else if (nE === 10 || nW === 10) rM.rotation.y = Math.PI / 2;
            meshes.push(rM);
        } else if (type === 82) { // Tall Grass Cross shape
            const m1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
            m1.rotation.y = Math.PI / 4;
            const m2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
            m2.rotation.y = -Math.PI / 4;
            meshes.push(m1, m2);
        } else if (type === 84) { // Small rock
            const rM = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), mat);
            rM.position.y = -0.4;
            if ((gx + gz) % 2 === 0) rM.rotation.y = Math.PI / 4; // Add some predictable rotation scatter
            meshes.push(rM);
        } else if (type === 11 || type === 12) { // Door or Shutter
            let isOpen = false;
            let dataKey = isOffset ? `${loc.x},${loc.y},${loc.z}` : `${bx},${by},${bz}`;
            if (chunk.customData.has(dataKey)) {
                isOpen = chunk.customData.get(dataKey).open;
            }
            if (type === 11) {
                const dM = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.15), mat);
                dM.position.z = isOpen ? -0.425 : 0.425;
                if (isOpen) { dM.rotation.y = Math.PI / 2; dM.position.x = 0.425; dM.position.z = 0; }
                meshes.push(dM);
            } else {
                const dM = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), mat);
                dM.position.z = isOpen ? -0.35 : 0.45;
                if (isOpen) { dM.rotation.y = Math.PI / 2; dM.position.x = 0.45; dM.position.z = 0; }
                meshes.push(dM);
            }
        } else if (type >= 63 && type <= 68) { // Flowers
            const flowerGeom = new THREE.PlaneGeometry(1, 1);
            const p1 = new THREE.Mesh(flowerGeom, mat);
            p1.rotation.y = Math.PI / 4;
            const p2 = new THREE.Mesh(flowerGeom, mat);
            p2.rotation.y = -Math.PI / 4;
            meshes.push(p1, p2);
        } else if (type >= 69 && type <= 72) { // Beds
            const bedMat = Array.isArray(mat) ? mat : [mat, mat, mat, mat, mat, mat];
            const bedMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5625, 2), bedMat);
            bedMesh.position.y = -0.21875;
            let dataKey = isOffset ? `${loc.x},${loc.y},${loc.z}` : `${bx},${by},${bz}`;
            let rot = 0;
            if (isOffset && loc.rot !== undefined) {
                rot = loc.rot;
            } else if (chunk.customData.has(dataKey)) {
                rot = chunk.customData.get(dataKey).rot || 0;
            }
            bedMesh.rotation.y = rot;

            // Offset the bed center so the "foot" starts in the clicked block
            // and the "head" extends 1 full block length in the forward direction.
            bedMesh.position.x -= Math.sin(rot) * 0.5;
            bedMesh.position.z -= Math.cos(rot) * 0.5;

            meshes.push(bedMesh);
        } else if (type >= 73 && type <= 80) { // Kitchen
            const kMat = Array.isArray(mat) ? mat : [mat, mat, mat, mat, mat, mat];
            const kMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), kMat);
            let dataKey = isOffset ? `${loc.x},${loc.y},${loc.z}` : `${bx},${by},${bz}`;
            let rot = 0;
            if (isOffset && loc.rot !== undefined) {
                rot = loc.rot;
            } else if (chunk.customData.has(dataKey)) {
                rot = chunk.customData.get(dataKey).rot || 0;
            }
            kMesh.rotation.y = rot;
            meshes.push(kMesh);
        } else if (type >= 93 && type <= 95) { // Roof Tiles (Wedges)
            const wMat = Array.isArray(mat) ? mat : [mat, mat, mat, mat, mat, mat];
            const wMesh = new THREE.Mesh(wedgeGeometry, wMat);
            let dataKey = isOffset ? `${loc.x},${loc.y},${loc.z}` : `${bx},${by},${bz}`;
            let rot = 0;
            if (isOffset && loc.rot !== undefined) {
                rot = loc.rot;
            } else if (chunk.customData.has(dataKey)) {
                rot = chunk.customData.get(dataKey).rot || 0;
            }
            wMesh.rotation.y = rot + Math.PI; // Face the slope towards the player
            meshes.push(wMesh);
        }

        let dataKey = isOffset ? `${loc.x},${loc.y},${loc.z}` : `${bx},${by},${bz}`;
        meshes.forEach(m => {
            m.position.add(new THREE.Vector3(wx, wy, wz));
            m.castShadow = true;
            m.receiveShadow = true;
            m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
            m.userData = { isSmart: true, isOffset, type, rx: gx, ry: gy, rz: gz, cx: wx, cy: wy, cz: wz, dataKey };
            scene.add(m);
            interactableMeshes.push(m);
            chunk.extraMeshesObjects.push(m);
        });
    });

    chunk.needsUpdate = false;
}

let lastUpdateChunkPlayerX = -999999;
let lastUpdateChunkPlayerZ = -999999;
let forceUpdateChunks = true;

function updateChunks() {
    const playerChunkX = Math.floor(camera.position.x / chunkSize);
    const playerChunkZ = Math.floor(camera.position.z / chunkSize);

    let movedChunk = (playerChunkX !== lastUpdateChunkPlayerX || playerChunkZ !== lastUpdateChunkPlayerZ);

    if (movedChunk || forceUpdateChunks) {
        lastUpdateChunkPlayerX = playerChunkX;
        lastUpdateChunkPlayerZ = playerChunkZ;
        forceUpdateChunks = false;

        const activeChunks = new Set();
        let chunkGeneratesThisFrame = 0;

        for (let i = -renderDistance; i <= renderDistance; i++) {
            for (let j = -renderDistance; j <= renderDistance; j++) {
                const cx = playerChunkX + i;
                const cz = playerChunkZ + j;
                const key = `${cx},${cz}`;
                activeChunks.add(key);

                if (!chunks.has(key)) {
                    if (chunkGeneratesThisFrame > 4) continue; // Rate limit pure array-generation to 4 per frame
                    chunks.set(key, {
                        x: cx,
                        z: cz,
                        data: generateChunkData(cx, cz),
                        customData: new Map(),
                        paintedFaces: new Map(),
                        offsetBlocks: [],
                        needsUpdate: true,
                        meshes: {},
                        extraMeshesObjects: []
                    });
                    chunkGeneratesThisFrame++;
                }
            }
        }

        for (const [key, chunk] of chunks.entries()) {
            if (!activeChunks.has(key)) {
                // Cleanup lights
                for (const data of chunk.customData.values()) {
                    if (data.light) { scene.remove(data.light); data.light.dispose(); }
                }
                if (chunk.meshes) {
                    Object.values(chunk.meshes).forEach(mesh => {
                        scene.remove(mesh);
                        const idx = interactableMeshes.indexOf(mesh);
                        if (idx > -1) interactableMeshes.splice(idx, 1);
                        mesh.geometry.dispose();
                    });
                }
                if (chunk.extraMeshesObjects) {
                    chunk.extraMeshesObjects.forEach(m => {
                        scene.remove(m);
                        const idx = interactableMeshes.indexOf(m);
                        if (idx > -1) interactableMeshes.splice(idx, 1);
                        if (m.material.userData && m.material.userData.isDynamic) m.material.dispose();
                        m.geometry.dispose();
                    });
                }
                chunks.delete(key);
            }
        }

        // If we didn't generate all missing chunks yet, force another execution next frame
        if (chunkGeneratesThisFrame > 0) {
            forceUpdateChunks = true;
        }
    }

    let chunksBuiltThisFrame = 0;
    for (const [key, chunk] of chunks.entries()) {
        if (chunk.needsUpdate) {
            buildChunkMesh(key);
            chunksBuiltThisFrame++;
            if (chunksBuiltThisFrame >= 2) break; // Rate limit heavy mesh construction to 2 per frame
        }
    }
}

// Raycasting Interaction Setup with native ThreeJS intersectObjects!
const raycaster = new THREE.Raycaster();
raycaster.far = 10;
const centerElement = new THREE.Vector2(0, 0);

function doVoxelSniper(hitCenter, normal) {
    if (sniperShape === 'line') {
        const lineRay = new THREE.Ray(camera.position, camera.getWorldDirection(new THREE.Vector3()));
        for (let i = 0; i < 15; i++) { // distance 15 line
            const p = lineRay.at(i, new THREE.Vector3());
            applyBrush(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), 0);
        }
        return;
    }

    const R = sniperRadius;
    const cx = Math.floor(hitCenter.x);
    const cy = Math.floor(hitCenter.y);
    const cz = Math.floor(hitCenter.z);

    for (let x = -R; x <= R; x++) {
        for (let y = -R; y <= R; y++) {
            for (let z = -R; z <= R; z++) {
                const wx = cx + x;
                const wy = cy + y;
                const wz = cz + z;

                let inShape = false;
                if (sniperShape === 'sphere') {
                    if (x * x + y * y + z * z <= R * R) inShape = true;
                } else if (sniperShape === 'disc') {
                    if (y === 0 && x * x + z * z <= R * R) inShape = true;
                } else if (sniperShape === 'triangle') { // Pyramid
                    if (Math.abs(x) + Math.abs(z) <= (R - Math.abs(y))) inShape = true;
                }

                if (inShape && wy >= 0 && wy < chunkHeight) {
                    applyBrush(wx, wy, wz);
                }
            }
        }
    }
}

function applyBrush(wx, wy, wz) {
    const current = getBlock(wx, wy, wz);
    if (sniperBrush === 'erode') {
        if (current !== 0) {
            setBlock(wx, wy, wz, 0);
            updateNeighbors(wx, wz);
            playSound('break');
        }
    } else if (sniperBrush === 'splatter') {
        if (current === 0 && Math.random() > 0.5) {
            setBlock(wx, wy, wz, selectedBlockType);
            updateNeighbors(wx, wz);
            playSound('place');
        }
    } else if (sniperBrush === 'overlay') {
        if (current === 0 && wy > 0) {
            const below = getBlock(wx, wy - 1, wz);
            if (below !== 0) {
                setBlock(wx, wy, wz, selectedBlockType);
                updateNeighbors(wx, wz);
                playSound('place');
            }
        }
    } else if (sniperBrush === 'replace') {
        if (current === replaceTargetId) {
            setBlock(wx, wy, wz, replaceWithId);
            updateNeighbors(wx, wz);
            playSound('place');
        }
    }
}


let isMouseDown = false;
let mouseDownButton = null;
let applyActionInterval = null;
let initialBreakType = null;
let lastPlacedBlock = null;

function performBlockAction(eventButton, isFirstClick = true) {
    if (!controls.isLocked) return;

    raycaster.setFromCamera(centerElement, camera);
    const intersects = raycaster.intersectObjects(interactableMeshes);

    if (intersects.length > 0) {
        const hit = intersects[0];
        // Figure out center coordinate based on InstancedMesh or regular Mesh
        let blockCenter = new THREE.Vector3();
        if (hit.object.isInstancedMesh) {
            const matrix = new THREE.Matrix4();
            hit.object.getMatrixAt(hit.instanceId, matrix);
            blockCenter.setFromMatrixPosition(matrix);
        } else if (hit.object.userData && hit.object.userData.isSmart) {
            blockCenter.set(hit.object.userData.cx, hit.object.userData.cy, hit.object.userData.cz);
        } else {
            // It's a painted Mesh
            blockCenter.copy(hit.object.position);
        }
        const isOffsetBlock = hit.object.userData?.isOffset || (
            !Number.isInteger(blockCenter.x - 0.5) ||
            !Number.isInteger(blockCenter.y - 0.5) ||
            !Number.isInteger(blockCenter.z - 0.5)
        );

        if (toolMode === 'sniper') {
            doVoxelSniper(blockCenter, hit.face.normal);
            return;
        }

        if (toolMode === 'paint' && eventButton === 2) {
            // Face Paint Logic
            if (isOffsetBlock) return; // Ignore painting offset custom blocks for simpler proto
            const bwX = Math.floor(blockCenter.x);
            const bwY = Math.floor(blockCenter.y);
            const bwZ = Math.floor(blockCenter.z);
            const cx = Math.floor(bwX / chunkSize);
            const cz = Math.floor(bwZ / chunkSize);
            const cKey = `${cx},${cz}`;
            if (chunks.has(cKey)) {
                const chunk = chunks.get(cKey);
                const locKey = `${bwX - cx * chunkSize},${bwY},${bwZ - cz * chunkSize}`;
                if (!chunk.paintedFaces.has(locKey)) {
                    chunk.paintedFaces.set(locKey, []);
                }
                const faceMap = chunk.paintedFaces.get(locKey);
                // Determine face index: +x, -x, +y, -y, +z, -z 
                let faceIdx = 0;
                if (hit.face.normal.x > 0.5) faceIdx = 0;
                else if (hit.face.normal.x < -0.5) faceIdx = 1;
                else if (hit.face.normal.y > 0.5) faceIdx = 2;
                else if (hit.face.normal.y < -0.5) faceIdx = 3;
                else if (hit.face.normal.z > 0.5) faceIdx = 4;
                else if (hit.face.normal.z < -0.5) faceIdx = 5;

                let colorData = null;
                if (selectedBlockType === 29) {
                    colorData = { type: 29, color: currentNeonColor.clone() };
                } else if (selectedBlockType === 5) {
                    colorData = { type: 5, color: currentNeonColor.clone(), intensity: currentNeonIntensity };
                } else {
                    colorData = selectedBlockType;
                }
                applyPaintFace(bwX, bwY, bwZ, faceIdx, colorData, false);
            }
            return;
        }

        if (eventButton === 1) { // Middle click: Pick block & Select
            let pickedType = 0;
            let customDataObj = null;
            let bx, by, bz;

            if (isOffsetBlock) {
                bx = blockCenter.x; by = blockCenter.y; bz = blockCenter.z;
                pickedType = hit.object.userData?.type || selectedBlockType;

                const cx = Math.floor(bx / chunkSize);
                const cz = Math.floor(bz / chunkSize);
                const cKey = `${cx},${cz}`;
                if (chunks.has(cKey)) {
                    const ob = chunks.get(cKey).offsetBlocks.find(o => o.x === bx && o.y === by && o.z === bz);
                    if (ob) {
                        pickedType = ob.type;
                        customDataObj = { ...ob };
                        delete customDataObj.x; delete customDataObj.y; delete customDataObj.z; delete customDataObj.type;
                    }
                }
            } else {
                bx = Math.floor(blockCenter.x);
                by = Math.floor(blockCenter.y);
                bz = Math.floor(blockCenter.z);
                pickedType = getBlock(bx, by, bz);

                const cx = Math.floor(bx / chunkSize);
                const cz = Math.floor(bz / chunkSize);
                const dataKey = `${bx - cx * chunkSize},${by},${bz - cz * chunkSize}`;
                const cKey = `${cx},${cz}`;
                if (chunks.has(cKey) && chunks.get(cKey).customData.has(dataKey)) {
                    customDataObj = { ...chunks.get(cKey).customData.get(dataKey) };
                }
            }

            if (pickedType && pickedType !== 0) {
                selectedBlockType = pickedType;
                hotbarContents[activeHotbarSlot] = selectedBlockType;
                updateHotbarUI();

                lastPlacedBlock = {
                    x: bx,
                    y: by,
                    z: bz,
                    type: pickedType,
                    isOffset: isOffsetBlock,
                    customData: customDataObj || null
                };

                appendChatMessage('System', 'Block Selected! Use arrow keys or R to modify it.');
                playSound('place');
            }
            return;
        }

        if (eventButton === 0) { // Left click: Break block
            let targetType = 0;
            if (hit.object.userData && hit.object.userData.type) {
                targetType = hit.object.userData.type;
            } else if (!isOffsetBlock) {
                targetType = getBlock(Math.floor(blockCenter.x), Math.floor(blockCenter.y), Math.floor(blockCenter.z));
            }

            if (isFirstClick) {
                initialBreakType = targetType;
            } else if (targetType !== initialBreakType) {
                return; // Prevent breaking a different type of block if we are just holding down the mouse button
            }

            let broke = false;
            if (isOffsetBlock) {
                if (setOffsetBlock(blockCenter.x, blockCenter.y, blockCenter.z, 0)) broke = true;
            } else {
                if (setBlock(Math.floor(blockCenter.x), Math.floor(blockCenter.y), Math.floor(blockCenter.z), 0)) broke = true;
                updateNeighbors(Math.floor(blockCenter.x), Math.floor(blockCenter.z));
            }
            if (broke) playSound('break');
        } else if (eventButton === 2) { // Right click: Place block
            let targetType = 0;
            if (hit.object.userData && hit.object.userData.type) targetType = hit.object.userData.type;
            else if (!isOffsetBlock) targetType = getBlock(Math.floor(blockCenter.x), Math.floor(blockCenter.y), Math.floor(blockCenter.z));

            if (targetType === 83) {
                if (!applyActionInterval) {
                    const blockPos = new THREE.Vector3(blockCenter.x, blockCenter.y, blockCenter.z);
                    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];
                    activeFireworks.push(new Firework(scene, blockPos, randomColor));
                    if (isOffsetBlock) {
                        setOffsetBlock(blockCenter.x, blockCenter.y, blockCenter.z, 0);
                    } else {
                        setBlock(Math.floor(blockCenter.x), Math.floor(blockCenter.y), Math.floor(blockCenter.z), 0);
                        updateNeighbors(Math.floor(blockCenter.x), Math.floor(blockCenter.z));
                    }
                }
                return;
            }

            if (hit.object.userData && hit.object.userData.isSmart && (hit.object.userData.type === 11 || hit.object.userData.type === 12)) {
                // Interactive blocks should only trigger once, effectively debounce them from spam click
                if (!applyActionInterval) {
                    const ud = hit.object.userData;
                    const key = ud.dataKey;
                    const chunkX = Math.floor(ud.cx / chunkSize);
                    const chunkZ = Math.floor(ud.cz / chunkSize);
                    interactDoor(ud.cx, ud.cz, chunkX, chunkZ, key, false);
                }
                return; // Prevent placing block
            }

            if (toolMode === 'offset') {
                // Determine collision hit surface point
                // Nudge out slightly along normal to attach to outside face
                const testPt = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(0.01));

                // Align to 0.25 grid for the center!
                const ox = Math.round(testPt.x * 4) / 4;
                const oy = Math.round(testPt.y * 4) / 4;
                const oz = Math.round(testPt.z * 4) / 4;

                let customData = { isOffset: true };
                if (selectedBlockType === 30) {
                    controls.unlock();
                    let text = prompt('Enter Sign Text:');
                    customData = { isOffset: true, text: text || 'Empty Sign' };
                } else if (selectedBlockType === 5 || selectedBlockType === 29) {
                    customData = { isOffset: true, color: currentNeonColor.clone(), intensity: currentNeonIntensity };
                } else if ((selectedBlockType >= 69 && selectedBlockType <= 80) || (selectedBlockType >= 93 && selectedBlockType <= 95)) {
                    const dx = camera.position.x - ox;
                    const dz = camera.position.z - oz;
                    let rot = 0;
                    if (Math.abs(dx) > Math.abs(dz)) rot = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
                    else rot = dz > 0 ? 0 : Math.PI;
                    customData.rot = rot;
                }
                if (setOffsetBlock(ox, oy, oz, selectedBlockType, customData)) {
                    playSound('place');
                    lastPlacedBlock = { x: ox, y: oy, z: oz, type: selectedBlockType, isOffset: true, customData: customData };
                }
            } else {
                // Standard block building!
                const px = Math.floor(blockCenter.x + hit.face.normal.x);
                const py = Math.floor(blockCenter.y + hit.face.normal.y);
                const pz = Math.floor(blockCenter.z + hit.face.normal.z);

                const cX = Math.floor(camera.position.x);
                const cY = Math.floor(camera.position.y);
                const cY2 = Math.floor(camera.position.y - 1);
                const cZ = Math.floor(camera.position.z);

                if (px === cX && (py === cY || py === cY2) && pz === cZ) {
                    return; // Dont build inside self
                }

                let customData = null;
                if (selectedBlockType === 30) {
                    controls.unlock();
                    let text = prompt('Enter Sign Text:');
                    customData = { text: text || 'Empty Sign' };
                } else if (selectedBlockType === 5 || selectedBlockType === 29) {
                    customData = { color: currentNeonColor, intensity: currentNeonIntensity };
                } else if ((selectedBlockType >= 69 && selectedBlockType <= 80) || (selectedBlockType >= 93 && selectedBlockType <= 95)) {
                    const dx = camera.position.x - (px + 0.5);
                    const dz = camera.position.z - (pz + 0.5);
                    let rot = 0;
                    if (Math.abs(dx) > Math.abs(dz)) {
                        rot = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
                    } else {
                        rot = dz > 0 ? 0 : Math.PI;
                    }
                    customData = { rot };
                }

                if (setBlock(px, py, pz, selectedBlockType, customData)) {
                    updateNeighbors(px, pz);
                    playSound('place');
                    lastPlacedBlock = { x: px, y: py, z: pz, type: selectedBlockType, isOffset: false, customData: customData };
                }
            }
        }
    }
}

function applyPaintFace(bwX, bwY, bwZ, faceIdx, colorData, isRemote = false) {
    const cx = Math.floor(bwX / chunkSize);
    const cz = Math.floor(bwZ / chunkSize);
    const cKey = `${cx},${cz}`;
    if (chunks.has(cKey)) {
        const chunk = chunks.get(cKey);
        const locKey = `${bwX - cx * chunkSize},${bwY},${bwZ - cz * chunkSize}`;

        let oldColorData = null;
        if (chunk.paintedFaces.has(locKey)) {
            oldColorData = chunk.paintedFaces.get(locKey)[faceIdx];
        }

        if (!isRemote && !isUndoing && isAdminMode) {
            if (JSON.stringify(oldColorData) !== JSON.stringify(colorData)) {
                pushUndoAction({ kind: 'paintFace', bwX, bwY, bwZ, faceIdx, colorData: oldColorData });
            }
        }

        if (!chunk.paintedFaces.has(locKey)) {
            chunk.paintedFaces.set(locKey, []);
        }
        chunk.paintedFaces.get(locKey)[faceIdx] = colorData;
        chunk.needsUpdate = true;
    }
    if (!isRemote) sendBlockUpdate('paintFace', { x: bwX, y: bwY, z: bwZ, faceIdx, colorData });
}

function interactDoor(cx, cz, chunkX, chunkZ, key, isRemote = false) {
    const cKey = `${chunkX},${chunkZ}`;
    if (chunks.has(cKey)) {
        const chunk = chunks.get(cKey);
        if (!chunk.customData.has(key)) {
            chunk.customData.set(key, { open: false });
        }
        chunk.customData.get(key).open = !chunk.customData.get(key).open;
        chunk.needsUpdate = true;
        playSound('door');
    }
    if (!isRemote) sendBlockUpdate('interactDoor', { cx, cz, chunkX, chunkZ, key });
}

document.addEventListener('mousedown', (event) => {
    isMouseDown = true;
    mouseDownButton = event.button;
    if (isAdminMode) {
        currentUndoGroup = [];
    }
    performBlockAction(mouseDownButton, true);
    applyActionInterval = setInterval(() => {
        if (isMouseDown) performBlockAction(mouseDownButton, false);
    }, 150); // Action repeats every 150ms while held
});

document.addEventListener('mouseup', () => {
    isMouseDown = false;
    mouseDownButton = null;
    if (applyActionInterval) {
        clearInterval(applyActionInterval);
        applyActionInterval = null;
    }
    if (isAdminMode && currentUndoGroup) {
        if (currentUndoGroup.length > 0) {
            undoStack.push(currentUndoGroup);
            if (undoStack.length > 10) undoStack.shift();
        }
        currentUndoGroup = null;
    }
});

document.addEventListener('wheel', (event) => {
    if (!controls.isLocked || !event.shiftKey) return;

    raycaster.setFromCamera(centerElement, camera);
    const intersects = raycaster.intersectObjects(interactableMeshes);
    if (intersects.length > 0) {
        const hit = intersects[0];
        let blockCenter = new THREE.Vector3();
        if (hit.object.isInstancedMesh) {
            const matrix = new THREE.Matrix4();
            hit.object.getMatrixAt(hit.instanceId, matrix);
            blockCenter.setFromMatrixPosition(matrix);
        }

        const isOffsetBlock = !Number.isInteger(blockCenter.x - 0.5);
        if (!isOffsetBlock) {
            const bx = Math.floor(blockCenter.x);
            const by = Math.floor(blockCenter.y);
            const bz = Math.floor(blockCenter.z);
            const block = getBlock(bx, by, bz);
            if (block === 5) { // Neon block
                const chunkX = Math.floor(bx / chunkSize);
                const chunkZ = Math.floor(bz / chunkSize);
                const chunkKey = `${chunkX},${chunkZ}`;
                const chunk = chunks.get(chunkKey);

                if (chunk) {
                    const lX = bx - chunkX * chunkSize;
                    const lZ = bz - chunkZ * chunkSize;
                    const localKey = `${lX},${by},${lZ}`;

                    if (chunk.customData.has(localKey)) {
                        let data = chunk.customData.get(localKey);
                        let delta = event.deltaY < 0 ? 0.2 : -0.2;
                        data.intensity = Math.max(0, data.intensity + delta);

                        if (data.light) data.light.intensity = data.intensity * 2.0;
                        chunk.needsUpdate = true;
                    }
                }
            }
        } else {
            // adjust offset neon logic here if we wanted!
        }
    } else {
        // If not looking at things or holding shift to cycle brightness,
        // use scroll wheel for cycling the active hotbar slot
        if (event.deltaY > 0) {
            activeHotbarSlot = (activeHotbarSlot + 1) % 9;
        } else {
            activeHotbarSlot = (activeHotbarSlot - 1 + 9) % 9;
        }
        updateHotbarUI();
    }
});


// Initialization
camera.position.set(chunkSize / 2, 40, chunkSize / 2);

let spawnAttempts = 0;
function trySetSpawn() {
    let top = getTopBlockFast(camera.position.x, camera.position.z).h;
    if (top > 0) {
        camera.position.y = top + 2;
        velocity.y = 0;
    } else if (spawnAttempts < 10) {
        spawnAttempts++;
        setTimeout(trySetSpawn, 200);
    }
}
setTimeout(trySetSpawn, 200);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Save and Load World Functionality
function createWorldExportData() {
    const exportData = { version: 1, chunks: [] };
    chunks.forEach((chunk, key) => {
        const cdObj = {};
        for (const [k, v] of chunk.customData) {
            cdObj[k] = { ...v };
            delete cdObj[k].light;
        }
        const pfObj = {};
        for (const [k, v] of chunk.paintedFaces) {
            pfObj[k] = v;
        }

        exportData.chunks.push({
            key, x: chunk.x, z: chunk.z, data: chunk.data,
            customData: cdObj,
            paintedFaces: pfObj,
            offsetBlocks: chunk.offsetBlocks
        });
    });
    return exportData;
}

function loadWorldData(parsed) {
    if (parsed.version !== 1) {
        appendChatMessage('System', 'Unknown world format version.');
        return;
    }

    chunks.forEach(chunk => {
        for (const data of chunk.customData.values()) {
            if (data.light) { scene.remove(data.light); data.light.dispose(); }
        }
        if (chunk.meshes) {
            Object.values(chunk.meshes).forEach(m => { scene.remove(m); m.dispose(); });
        }
        if (chunk.extraMeshesObjects) {
            chunk.extraMeshesObjects.forEach(m => {
                scene.remove(m);
                if (m.material.userData && m.material.userData.isDynamic) m.material.dispose();
                m.geometry.dispose();
            });
        }
    });
    chunks.clear();
    interactableMeshes.length = 0;

    parsed.chunks.forEach(c => {
        const customDataMap = new Map();
        for (const k in c.customData) {
            const v = c.customData[k];
            if (v.color) v.color = new THREE.Color(v.color.r, v.color.g, v.color.b);
            if (v.intensity) {
                const [lx, ly, lz] = k.split(',').map(Number);
                const chunkWorldX = c.x * chunkSize;
                const chunkWorldZ = c.z * chunkSize;
                const light = new THREE.PointLight(v.color, v.intensity * 2.0, 15);
                light.position.set(chunkWorldX + lx + 0.5, ly + 0.5, chunkWorldZ + lz + 0.5);
                light.castShadow = true;
                light.shadow.bias = -0.001;
                scene.add(light);
                v.light = light;
            }
            customDataMap.set(k, v);
        }
        const paintedFacesMap = new Map();
        for (const k in c.paintedFaces) {
            const faceArr = c.paintedFaces[k];
            for (let i = 0; i < faceArr.length; i++) {
                if (faceArr[i] && faceArr[i].color) {
                    faceArr[i].color = new THREE.Color(faceArr[i].color.r, faceArr[i].color.g, faceArr[i].color.b);
                }
            }
            paintedFacesMap.set(k, faceArr);
        }

        chunks.set(c.key, {
            x: c.x,
            z: c.z,
            data: c.data,
            customData: customDataMap,
            paintedFaces: paintedFacesMap,
            offsetBlocks: c.offsetBlocks,
            needsUpdate: true,
            meshes: {},
            extraMeshesObjects: []
        });
    });

    updateChunks();
}

document.getElementById('btn-save-world')?.addEventListener('click', () => {
    if (document.activeElement) document.activeElement.blur();
    qMenu.classList.add('hidden');
    qMenuOpen = false;
    controls.lock();

    const exportData = createWorldExportData();

    const blob = new Blob([JSON.stringify(exportData)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hytale_clone_world_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('btn-save-server')?.addEventListener('click', async () => {
    if (document.activeElement) document.activeElement.blur();
    qMenu.classList.add('hidden');
    qMenuOpen = false;
    controls.lock();

    const exportData = createWorldExportData();
    try {
        const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(exportData)
        });
        if (res.ok) appendChatMessage('System', "World saved to server successfully!");
        else appendChatMessage('System', "Failed to save to server.");
    } catch (e) {
        appendChatMessage('System', "Error connecting to server.");
    }
});

document.getElementById('btn-load-server')?.addEventListener('click', async () => {
    if (document.activeElement) document.activeElement.blur();
    qMenu.classList.add('hidden');
    qMenuOpen = false;
    controls.lock();

    try {
        const res = await fetch('/api/load');
        if (!res.ok) {
            appendChatMessage('System', "No saved world found on the server.");
            return;
        }
        const parsed = await res.json();
        loadWorldData(parsed);
        appendChatMessage('System', "World loaded from server successfully!");
    } catch (e) {
        appendChatMessage('System', "Error connecting to server.");
    }
});

document.getElementById('input-load-world')?.addEventListener('change', (e) => {
    if (e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            if (document.activeElement) document.activeElement.blur();
            qMenu.classList.add('hidden');
            qMenuOpen = false;
            overlay.classList.remove('hidden');
            loadWorldData(parsed);
            appendChatMessage('System', 'World loaded from file successfully!');
        } catch (err) {
            console.error(err);
            appendChatMessage('System', "Error parsing world file.");
        }
    };
    reader.readAsText(file);
});

// Fireworks System
class Firework {
    constructor(scene, startPos, color) {
        this.scene = scene;
        this.particles = [];
        this.color = color;
        this.state = 'launching'; // 'launching', 'exploding', 'dead'
        this.age = 0;
        this.launchVelocity = new THREE.Vector3((Math.random() - 0.5) * 5, 20 + Math.random() * 10, (Math.random() - 0.5) * 5);
        this.position = startPos.clone();

        // Launcher particle
        const geom = new THREE.BoxGeometry(0.2, 0.4, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        this.rocket = new THREE.Mesh(geom, mat);
        this.rocket.position.copy(this.position);
        this.scene.add(this.rocket);

        playSound('firework_launch');
    }

    update(delta) {
        this.age += delta;
        if (this.state === 'launching') {
            this.position.addScaledVector(this.launchVelocity, delta);
            this.rocket.position.copy(this.position);
            this.launchVelocity.y -= 15 * delta; // Gravity

            if (this.launchVelocity.y <= 0 || this.age > 2) {
                this.explode();
            }
        } else if (this.state === 'exploding') {
            const positions = this.particleMesh.geometry.attributes.position.array;

            for (let i = 0; i < this.particleCount; i++) {
                this.particleData[i].velocity.y -= 10 * delta; // particle gravity
                this.particleData[i].pos.addScaledVector(this.particleData[i].velocity, delta);

                positions[i * 3] = this.particleData[i].pos.x;
                positions[i * 3 + 1] = this.particleData[i].pos.y;
                positions[i * 3 + 2] = this.particleData[i].pos.z;
            }
            this.particleMesh.geometry.attributes.position.needsUpdate = true;
            this.particleMesh.material.opacity = Math.max(0, 1.0 - (this.age - this.explodeTime) / 1.5);

            if (this.age - this.explodeTime > 1.5) {
                this.state = 'dead';
                this.scene.remove(this.particleMesh);
                this.particleMesh.geometry.dispose();
                this.particleMesh.material.dispose();
            }
        }
    }

    explode() {
        this.state = 'exploding';
        this.explodeTime = this.age;
        this.scene.remove(this.rocket);
        this.rocket.geometry.dispose();
        this.rocket.material.dispose();

        playSound('firework_explode');

        this.particleCount = 100;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        this.particleData = [];

        for (let i = 0; i < this.particleCount; i++) {
            positions[i * 3] = this.position.x;
            positions[i * 3 + 1] = this.position.y;
            positions[i * 3 + 2] = this.position.z;

            // Spherical explosion
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const speed = 5 + Math.random() * 15;

            this.particleData.push({
                pos: this.position.clone(),
                velocity: new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta) * speed,
                    Math.cos(phi) * speed,
                    Math.sin(phi) * Math.sin(theta) * speed
                )
            });
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: this.color,
            size: 0.5,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending
        });

        this.particleMesh = new THREE.Points(geometry, material);
        this.scene.add(this.particleMesh);
    }
}

const activeFireworks = [];
let nextFireworkTime = performance.now() + 2000;

// Animation Loop
const clock = new THREE.Clock();

function getTopBlockFast(wx, wz) {
    const fwz = Math.floor(wz);
    const fwx = Math.floor(wx);
    const cx = Math.floor(fwx / chunkSize);
    const cz = Math.floor(fwz / chunkSize);
    const cKey = `${cx},${cz}`;
    if (!chunks.has(cKey)) return { type: 0, h: 0 };
    const chunk = chunks.get(cKey);
    const lx = fwx - cx * chunkSize;
    const lz = fwz - cz * chunkSize;

    for (let h = chunkHeight - 1; h >= 0; h--) {
        const type = chunk.data[lx][h][lz];
        if (type !== 0) return { type, h };
    }
    return { type: 0, h: 0 };
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (controls.isLocked) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        const isWalkable = (b) => b === 0 || b === 81 || b === 82 || b === 84 || (b >= 93 && b <= 95);

        if (isFlying) {
            const flightMult = flightSlider ? parseFloat(flightSlider.value) / 10 : 1.5;
            const flightSpeed = playerVelocity * flightMult;
            velocity.y -= velocity.y * 10.0 * delta;

            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
            direction.y = Number(moveUp) - Number(moveDown);
            if (moveForward || moveBackward) velocity.z -= direction.z * flightSpeed * delta;
            if (moveLeft || moveRight) velocity.x -= direction.x * flightSpeed * delta;
            if (moveUp || moveDown) velocity.y += direction.y * flightSpeed * delta;

            const nextX = camera.position.x + velocity.x * delta;
            const nextY = camera.position.y + velocity.y * delta;
            const nextZ = camera.position.z + velocity.z * delta;

            if (isWalkable(getBlock(Math.floor(nextX), Math.floor(camera.position.y), Math.floor(camera.position.z))) &&
                isWalkable(getBlock(Math.floor(nextX), Math.floor(camera.position.y - 1), Math.floor(camera.position.z)))) {
                controls.moveRight(-velocity.x * delta);
            } else { velocity.x = 0; }

            if (isWalkable(getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(nextZ))) &&
                isWalkable(getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y - 1), Math.floor(nextZ)))) {
                controls.moveForward(-velocity.z * delta);
            } else { velocity.z = 0; }

            if (isWalkable(getBlock(Math.floor(camera.position.x), Math.floor(nextY), Math.floor(camera.position.z))) &&
                isWalkable(getBlock(Math.floor(camera.position.x), Math.floor(nextY - 1.5), Math.floor(camera.position.z)))) {
                camera.position.y += velocity.y * delta;
            } else { velocity.y = 0; }

        } else {
            velocity.y += gravity * delta;

            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
            direction.normalize();

            if (moveForward || moveBackward) velocity.z -= direction.z * playerVelocity * delta;
            if (moveLeft || moveRight) velocity.x -= direction.x * playerVelocity * delta;

            const pX = camera.position.x;
            const pY = camera.position.y;
            const pZ = camera.position.z;

            const nextX = pX + velocity.x * delta;
            const nextY = pY + velocity.y * delta - 1.5;
            const nextZ = pZ + velocity.z * delta;

            const blockBelow = getBlock(Math.floor(pX), Math.floor(nextY), Math.floor(pZ));
            let hitSurface = false;
            let surfaceY = Math.floor(nextY) + 1;

            if (blockBelow !== 0 && blockBelow !== 81 && blockBelow !== 82 && blockBelow !== 84) {
                if (blockBelow >= 93 && blockBelow <= 95) {
                    const lx = pX - Math.floor(pX);
                    const lz = pZ - Math.floor(pZ);
                    const cx = Math.floor(Math.floor(pX) / chunkSize);
                    const cz = Math.floor(Math.floor(pZ) / chunkSize);
                    const chunkKey = `${cx},${cz}`;
                    let rot = 0;
                    if (chunks.has(chunkKey)) {
                        const chunk = chunks.get(chunkKey);
                        const bx = Math.floor(pX) - cx * chunkSize;
                        const bz = Math.floor(pZ) - cz * chunkSize;
                        const dataKey = `${bx},${Math.floor(nextY)},${bz}`;
                        if (chunk.customData.has(dataKey)) {
                            rot = chunk.customData.get(dataKey).rot || 0;
                        }
                    }
                    const R = rot + Math.PI;
                    const z_geom = -Math.sin(R) * (lx - 0.5) + Math.cos(R) * (lz - 0.5);
                    const y_geom = -0.8 * z_geom + 0.1;
                    surfaceY = Math.floor(nextY) + 0.5 + y_geom;
                }

                if (nextY <= surfaceY) {
                    hitSurface = true;
                }
            }

            if (hitSurface) {
                velocity.y = Math.max(0, velocity.y);
                canJump = true;
                camera.position.y = surfaceY + 1.5;
            } else {
                camera.position.y += velocity.y * delta;
            }

            const blockXFeet = getBlock(Math.floor(nextX), Math.floor(camera.position.y - 1.4), Math.floor(pZ));
            const blockX = getBlock(Math.floor(nextX), Math.floor(camera.position.y - 0.5), Math.floor(pZ));
            const blockXTop = getBlock(Math.floor(nextX), Math.floor(camera.position.y), Math.floor(pZ));
            if (isWalkable(blockX) && isWalkable(blockXTop) && isWalkable(blockXFeet)) {
                controls.moveRight(-velocity.x * delta);
            } else {
                velocity.x = 0;
            }

            const blockZFeet = getBlock(Math.floor(pX), Math.floor(camera.position.y - 1.4), Math.floor(nextZ));
            const blockZ = getBlock(Math.floor(pX), Math.floor(camera.position.y - 0.5), Math.floor(nextZ));
            const blockZTop = getBlock(Math.floor(pX), Math.floor(camera.position.y), Math.floor(nextZ));
            if (isWalkable(blockZ) && isWalkable(blockZTop) && isWalkable(blockZFeet)) {
                controls.moveForward(-velocity.z * delta);
            } else {
                velocity.z = 0;
            }
        }

        if (camera.position.y < -10) {
            velocity.y = 0;
            camera.position.y = 40;
        }
    }

    updateChunks();

    // Update fireworks
    for (let i = activeFireworks.length - 1; i >= 0; i--) {
        activeFireworks[i].update(delta);
        if (activeFireworks[i].state === 'dead') {
            activeFireworks.splice(i, 1);
        }
    }

    // Dummy Bot Logic
    if (isPublicServer) {
        if (Math.random() < 0.005 && dummyBots.size < 6) {
            const botNames = ['CraftyFox', 'Miner24', 'HytaleFan', 'VoidWalker', 'PixelHero', 'BlockBuster', 'Notch', 'Steve'];
            const bX = camera.position.x + (Math.random() - 0.5) * 40;
            const bZ = camera.position.z + (Math.random() - 0.5) * 40;
            const bY = getTopBlockFast(bX, bZ).h + 2;
            const botId = 'fake_' + Math.floor(Math.random() * 99999);
            const bn = botNames[Math.floor(Math.random() * botNames.length)];
            const newBot = {
                playerName: bn,
                x: bX, y: bY, z: bZ,
                targetX: bX, targetZ: bZ,
                ry: Math.random() * Math.PI * 2,
                jumpTimer: 0
            };
            dummyBots.set(botId, newBot);
            if (typeof onPlayerUpdate === 'function') onPlayerUpdate(botId, newBot);
        }
        // randomly disconnect
        if (Math.random() < 0.001 && dummyBots.size > 0) {
            const keys = Array.from(dummyBots.keys());
            const remId = keys[Math.floor(Math.random() * keys.length)];
            if (typeof onPlayerDisconnect === 'function') onPlayerDisconnect(remId);
            dummyBots.delete(remId);
        }
        // move active bots
        for (let [id, bot] of dummyBots) {
            const dx = bot.targetX - bot.x;
            const dz = bot.targetZ - bot.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 1.0 || Math.random() < 0.01) {
                bot.targetX = bot.x + (Math.random() - 0.5) * 20;
                bot.targetZ = bot.z + (Math.random() - 0.5) * 20;
            }
            const speed = 4.0;
            if (dist > 0.1) {
                bot.x += (dx / dist) * speed * delta;
                bot.z += (dz / dist) * speed * delta;
                bot.ry = Math.atan2(dx, dz) + Math.PI; // point towards direction
            }

            bot.y -= 25.0 * delta; // basic gravity
            const tb = getTopBlockFast(bot.x, bot.z);
            if (bot.y < tb.h + 1) {
                bot.y = tb.h + 1;
                if (Math.random() < 0.05 && bot.jumpTimer <= 0) bot.jumpTimer = 0.4;
            }
            if (bot.jumpTimer > 0) {
                bot.y += 12.0 * delta;
                bot.jumpTimer -= delta;
            }
            if (typeof onPlayerUpdate === 'function') onPlayerUpdate(id, bot);
        }
    }

    if (window.networkManager && controls.isLocked) {
        window.networkManager.broadcast('playerUpdate', {
            x: camera.position.x,
            y: camera.position.y - 0.9,
            z: camera.position.z,
            rx: camera.rotation.x,
            ry: camera.rotation.y,
            rz: camera.rotation.z,
            playerName: window.playerName
        });
    }

    // Render minimap functionally in real-time (~60fps target via 16ms loop throttle)
    if (showMinimap && minimapCtx && performance.now() - (window.lastMinimapUpdate || 0) > 16) {
        window.lastMinimapUpdate = performance.now();
        const pX = camera.position.x;
        const pZ = camera.position.z;
        minimapCtx.clearRect(0, 0, 200, 200);

        const R = 32;
        const size = 200 / (R * 2);
        for (let x = -R; x <= R; x++) {
            for (let z = -R; z <= R; z++) {
                const wx = Math.floor(pX + x);
                const wz = Math.floor(pZ + z);

                const { type, h } = getTopBlockFast(wx, wz);
                if (type === 0) continue;

                if (type <= 12) {
                    minimapCtx.fillStyle = `hsl(${(type * 40) % 360}, 60%, 50%)`;
                } else {
                    minimapCtx.fillStyle = `hsl(${((type * 17) % 360)}, 60%, 50%)`;
                }

                minimapCtx.globalAlpha = Math.min(1.0, 0.3 + (h / chunkHeight));
                minimapCtx.fillRect((x + R) * size, (z + R) * size, size + 1.2, size + 1.2); // Adding padding fix gap bleeding
            }
        }

        // Player dot
        minimapCtx.fillStyle = 'white';
        minimapCtx.globalAlpha = 1.0;
        minimapCtx.beginPath();
        minimapCtx.arc(100, 100, 4, 0, Math.PI * 2);
        minimapCtx.fill();

        // Rotated direction cone
        minimapCtx.save();
        minimapCtx.translate(100, 100);
        minimapCtx.rotate(Math.atan2(-camera.getWorldDirection(new THREE.Vector3()).x, -camera.getWorldDirection(new THREE.Vector3()).z));
        minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        minimapCtx.beginPath();
        minimapCtx.moveTo(0, 0);
        minimapCtx.lineTo(-10, -20);
        minimapCtx.lineTo(10, -20);
        minimapCtx.fill();
        minimapCtx.restore();
    }

    renderer.render(scene, camera);
}

// Network Initialization
const otherPlayers = new Map();

function createNameplate(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(0, 0, 512, 128, 20);
        ctx.fill();
    } else {
        ctx.fillRect(0, 0, 512, 128);
    }
    ctx.font = 'bold 50px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2.5, 0.6, 1);
    sprite.position.y = 1.4;
    sprite.renderOrder = 999;
    return sprite;
}

function onPlayerUpdate(peerId, data) {
    if (!otherPlayers.has(peerId)) {
        const g = new THREE.BoxGeometry(0.8, 1.8, 0.8);
        const m = new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff });
        const mesh = new THREE.Mesh(g, m);
        mesh.castShadow = true;

        const plate = createNameplate(data.playerName || 'Unknown');
        plate.name = "nameplate";
        mesh.add(plate);
        mesh.playerNameString = data.playerName || 'Unknown';

        scene.add(mesh);
        otherPlayers.set(peerId, mesh);
        if (typeof updatePlayerListUI === 'function') updatePlayerListUI();
    }
    const mesh = otherPlayers.get(peerId);

    if (data.playerName && data.playerName !== mesh.playerNameString) {
        const oldPlate = mesh.getObjectByName("nameplate");
        if (oldPlate) mesh.remove(oldPlate);

        const newPlate = createNameplate(data.playerName);
        newPlate.name = "nameplate";
        mesh.add(newPlate);
        mesh.playerNameString = data.playerName;
        if (typeof updatePlayerListUI === 'function') updatePlayerListUI();
    }

    mesh.position.set(data.x, data.y + 0.9, data.z);
    mesh.rotation.set(0, data.ry, 0); // Only rotate around Y axis
}

function onBlockUpdate(msg) {
    if (msg.customBlockData && msg.customBlockData.color) {
        msg.customBlockData.color = new THREE.Color(msg.customBlockData.color.r, msg.customBlockData.color.g, msg.customBlockData.color.b);
    }
    if (msg.customData && msg.customData.color) {
        msg.customData.color = new THREE.Color(msg.customData.color.r, msg.customData.color.g, msg.customData.color.b);
    }
    if (msg.colorData && msg.colorData.color) {
        msg.colorData.color = new THREE.Color(msg.colorData.color.r, msg.colorData.color.g, msg.colorData.color.b);
    }

    if (msg.action === 'setBlock') {
        setBlock(msg.x, msg.y, msg.z, msg.type, msg.customBlockData, true);
        updateNeighbors(msg.x, msg.z);
    } else if (msg.action === 'setOffsetBlock') {
        setOffsetBlock(msg.x, msg.y, msg.z, msg.type, msg.customData, true);
    } else if (msg.action === 'paintFace') {
        applyPaintFace(msg.x, msg.y, msg.z, msg.faceIdx, msg.colorData, true);
    } else if (msg.action === 'interactDoor') {
        interactDoor(msg.cx, msg.cz, msg.chunkX, msg.chunkZ, msg.key, true);
    } else if (msg.action === 'chat') {
        appendChatMessage(msg.playerName || 'Unknown', msg.text);
    }
}

function onPlayerDisconnect(peerId) {
    if (otherPlayers.has(peerId)) {
        scene.remove(otherPlayers.get(peerId));
        otherPlayers.get(peerId).geometry.dispose();
        otherPlayers.get(peerId).material.dispose();
        otherPlayers.delete(peerId);
    }
}

window.networkManager = new NetworkManager(onPlayerUpdate, onBlockUpdate, onPlayerDisconnect);

function updatePlayerListUI() {
    const list = document.getElementById('player-list');
    if (!list) return;

    if (otherPlayers.size === 0) {
        list.innerHTML = '<div style="opacity: 0.5;">No other players connected.</div>';
        return;
    }

    list.innerHTML = '';
    otherPlayers.forEach((mesh, id) => {
        const btn = document.createElement('button');
        btn.innerText = `Teleport to ${mesh.playerNameString || id}`;
        btn.style.padding = '8px 12px';
        btn.style.background = '#3b82f6';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '6px';
        btn.style.cursor = 'pointer';
        btn.onclick = () => {
            camera.position.copy(mesh.position);
            qMenu.classList.add('hidden');
            controls.lock();
            qMenuOpen = false;
        };
        list.appendChild(btn);
    });
}

animate();

// Sign Text Writer UI
let signTypewriterInterval = null;
let signHideTimeout = null;

function showSignText(text) {
    const ui = document.getElementById('sign-ui');
    const span = document.getElementById('sign-text');
    if (!ui || !span) return;

    clearInterval(signTypewriterInterval);
    clearTimeout(signHideTimeout);

    span.innerText = '';
    ui.classList.remove('hide');
    ui.classList.add('show');

    let index = 0;
    signTypewriterInterval = setInterval(() => {
        if (index < text.length) {
            span.innerText += text.charAt(index);
            index++;
        } else {
            clearInterval(signTypewriterInterval);
            signHideTimeout = setTimeout(() => {
                ui.classList.remove('show');
                ui.classList.add('hide');
            }, 5000);
        }
    }, 50);
}
