const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const fs = require('fs');

// Enable CORS
fastify.register(cors, { 
  origin: '*', 
  methods: ['GET', 'POST']
});

// --- STATE MANAGEMENT ---
let sock;
let qrCodeData = null;
let connectionStatus = 'disconnected'; 
let deviceBattery = 0;
let deviceName = '';
let isConnecting = false;

// Campaign State (In-Memory for now)
let activeCampaign = null;
let campaignLogs = []; // Store last 50 logs
let workerStatus = 'idle'; // idle, running, paused
let processedIndex = 0;

// --- UTILS ---
function formatPhoneNumber(phone) {
    if (!phone) return null;
    // Remove all non-numeric characters
    let cleaned = phone.toString().replace(/\D/g, '');
    
    // Handle Moroccan numbers specific logic if needed, or generic international
    // Baileys needs [CountryCode][Number]@s.whatsapp.net
    if (!cleaned.includes('@s.whatsapp.net')) {
        cleaned = `${cleaned}@s.whatsapp.net`;
    }
    return cleaned;
}

function processTemplate(template, row, mapping) {
    let text = template;
    // 1. Spintax {Hello|Salut}
    text = text.replace(/\{([^{}]+)\}/g, (match, group) => {
        const options = group.split('|');
        return options[Math.floor(Math.random() * options.length)];
    });

    // 2. Variables {{Name}}
    if (mapping) {
        Object.entries(mapping).forEach(([header, variable]) => {
             if (variable !== 'ignore' && variable !== 'phone') {
                 const value = row[header] || '';
                 const regex = new RegExp(`{{${variable}}}`, 'g');
                 text = text.replace(regex, value);
             }
        });
    }
    return text;
}

function addLog(type, message) {
    const log = {
        id: Date.now().toString() + Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        type,
        message
    };
    campaignLogs.unshift(log);
    if (campaignLogs.length > 50) campaignLogs.pop();
    return log;
}

// --- WORKER LOOP ---
async function startWorker() {
    if (workerStatus === 'running') return;
    workerStatus = 'running';
    console.log("Worker started");

    while (workerStatus === 'running' && activeCampaign && processedIndex < activeCampaign.contacts.length) {
        
        // 1. Check Connection
        if (connectionStatus !== 'connected' || !sock) {
            addLog('error', 'Paused: WhatsApp Disconnected');
            workerStatus = 'paused';
            break;
        }

        const contact = activeCampaign.contacts[processedIndex];
        
        // 2. Find Phone Number
        let phoneRaw = null;
        if (activeCampaign.mapping) {
             const phoneKey = Object.keys(activeCampaign.mapping).find(key => activeCampaign.mapping[key] === 'phone');
             if (phoneKey) phoneRaw = contact[phoneKey];
        }
        
        // Fallback search
        if (!phoneRaw) {
             const keys = Object.keys(contact);
             const phoneKey = keys.find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('tele')) || keys[0];
             phoneRaw = contact[phoneKey];
        }

        const jid = formatPhoneNumber(phoneRaw);

        if (!jid) {
            addLog('warning', `Skipped invalid contact at row ${processedIndex + 1}`);
            activeCampaign.failedCount++;
            processedIndex++;
            continue;
        }

        // 3. Process Message
        const message = processTemplate(activeCampaign.template, contact, activeCampaign.mapping);

        try {
            // A. Check Presence (Optional but good for anti-ban)
            // await sock.presenceSubscribe(jid); 
            
            // B. Simulate Typing
            addLog('typing', `Typing for ${phoneRaw}...`);
            await sock.sendPresenceUpdate('composing', jid);
            await delay(2000 + Math.random() * 3000); // 2-5s typing
            await sock.sendPresenceUpdate('paused', jid);

            // C. Send Message
            await sock.sendMessage(jid, { text: message });
            
            addLog('success', `Message dispatched to ${phoneRaw}`);
            activeCampaign.sentCount++;
            
            // D. Wait Random Delay (Anti-Ban)
            const waitTime = 5000 + Math.random() * 10000; // 5s to 15s wait (keep short for demo, make longer in prod)
            await delay(waitTime);

        } catch (err) {
            console.error("Send Error:", err);
            addLog('error', `Failed to send to ${phoneRaw}: ${err.message}`);
            activeCampaign.failedCount++;
        }

        processedIndex++;

        // Check completion
        if (processedIndex >= activeCampaign.contacts.length) {
            addLog('info', 'Campaign Completed');
            activeCampaign.status = 'completed';
            workerStatus = 'idle';
        }
    }
}

// --- WHATSAPP CONNECTION ---

async function connectToWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["Smartdoc Gateway", "Chrome", "1.0.0"],
        syncFullHistory: false,
        connectTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'M', type: 'image/png', margin: 4, scale: 10 });
            connectionStatus = 'pairing';
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (!shouldReconnect) {
                connectionStatus = 'disconnected';
                qrCodeData = null;
            } else {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            qrCodeData = null;
            isConnecting = false;
            deviceName = sock.user?.name || 'Smartdoc User';
            deviceBattery = 100; // Baileys doesn't easily give battery level without more logic
        }
    });

    setTimeout(() => { isConnecting = false; }, 5000);
}

// --- API ROUTES ---

fastify.get('/instance/status', async (request, reply) => {
    return {
        status: connectionStatus,
        qrCode: qrCodeData,
        batteryLevel: deviceBattery,
        phoneName: deviceName,
        phoneNumber: sock?.user?.id?.split(':')[0] || '',
        platform: 'Baileys'
    };
});

fastify.post('/instance/init', async (request, reply) => {
    if (request.body && request.body.force) {
         if (sock) await sock.logout();
         try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); } catch(e) {}
         connectionStatus = 'disconnected';
         qrCodeData = null;
    }
    if (connectionStatus === 'connected') return { message: 'Already connected' };
    connectToWhatsApp();
    return { message: 'Initialization started', status: 'pairing' };
});

fastify.post('/instance/logout', async (request, reply) => {
    if (sock) {
        await sock.logout();
        try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); } catch(e) {}
        connectionStatus = 'disconnected';
        qrCodeData = null;
        return { message: 'Logged out successfully' };
    }
    return { message: 'No active session' };
});

// Create Campaign
fastify.post('/campaigns', async (request, reply) => {
    const { name, contacts, template, mapping } = request.body;
    
    // Initialize global state
    activeCampaign = { 
        id: 'cmp_' + Date.now(), 
        name: name || 'Untitled Campaign',
        status: 'running', 
        contacts: contacts || [],
        mapping: mapping || {},
        template: template,
        totalContacts: contacts ? contacts.length : 0,
        sentCount: 0,
        failedCount: 0,
        replyCount: 0,
        createdAt: new Date().toISOString()
    };
    
    processedIndex = 0;
    campaignLogs = [];
    addLog('info', `Campaign "${name}" initialized with ${contacts.length} contacts.`);
    
    // Start the worker
    startWorker();

    return activeCampaign;
});

// Get Current Campaign Status & Logs
fastify.get('/campaigns/current', async (request, reply) => {
    if (!activeCampaign) return { active: false };
    
    return {
        active: true,
        campaign: activeCampaign,
        logs: campaignLogs,
        workerStatus: workerStatus,
        progress: processedIndex
    };
});

// Pause/Resume
fastify.post('/campaigns/toggle', async (request, reply) => {
    if (!activeCampaign) return { error: "No active campaign" };
    
    if (workerStatus === 'running') {
        workerStatus = 'paused';
        activeCampaign.status = 'paused';
        addLog('warning', 'Campaign paused by user');
    } else {
        workerStatus = 'running';
        activeCampaign.status = 'running';
        addLog('info', 'Campaign resumed');
        startWorker();
    }
    return { status: activeCampaign.status };
});

const start = async () => {
    try {
        await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
        console.log(`Server listening on ${fastify.server.address().port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();