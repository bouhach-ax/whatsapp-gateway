const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const fs = require('fs');

// Enable CORS
fastify.register(cors, { 
  origin: '*', 
  methods: ['GET', 'POST']
});

// State Management
let sock;
let qrCodeData = null;
let connectionStatus = 'disconnected'; 
let deviceBattery = 0;
let deviceName = '';
let isConnecting = false; // Prevent double init

async function connectToWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // Turn off terminal QR to save logs
        browser: ["Smartdoc Gateway", "Chrome", "1.0.0"],
        syncFullHistory: false,
        connectTimeoutMs: 60000, // Increase timeout
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code received');
            // Generate High Quality QR for WhatsApp
            qrCodeData = await QRCode.toDataURL(qr, {
                errorCorrectionLevel: 'M', // Medium matches WhatsApp standard
                type: 'image/png',
                margin: 4, // Whitespace border is MANDATORY for scanning
                scale: 10, // High resolution
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            connectionStatus = 'pairing';
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            
            // If logged out, clear data
            if (!shouldReconnect) {
                console.log('Session logged out. Clearing data.');
                connectionStatus = 'disconnected';
                qrCodeData = null;
                // Optional: Clear auth folder here if you want auto-reset
            } else {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Connection OPEN');
            connectionStatus = 'connected';
            qrCodeData = null;
            isConnecting = false;
            
            deviceName = sock.user?.name || 'Smartdoc User';
            deviceBattery = 100; 
        }
    });

    // Reset lock if setup fails immediately
    setTimeout(() => { isConnecting = false; }, 5000);

    sock.ev.on('messages.upsert', async m => {
        console.log("New message:", JSON.stringify(m, undefined, 2));
    });
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
    // Force reset if requested
    if (request.body && request.body.force) {
         if (sock) await sock.logout();
         try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); } catch(e) {}
         connectionStatus = 'disconnected';
         qrCodeData = null;
    }

    if (connectionStatus === 'connected') {
        return { message: 'Already connected' };
    }
    
    // Start connection logic
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

fastify.post('/campaigns', async (request, reply) => {
    const { name, contacts, template } = request.body;
    console.log(`Received campaign "${name}"`);
    return { 
        id: 'cmp_' + Date.now(), 
        status: 'queued', 
        message: 'Campaign ingested' 
    };
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