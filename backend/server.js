const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const fs = require('fs');

// Enable CORS so your React Frontend can talk to this server
fastify.register(cors, { 
  origin: '*', // In production, replace with your Vercel URL
  methods: ['GET', 'POST']
});

// State Management (In memory for simplicity, use Redis for prod)
let sock;
let qrCodeData = null;
let connectionStatus = 'disconnected'; // 'connected' | 'pairing' | 'disconnected'
let deviceBattery = 0;
let deviceName = '';

// Authentication storage
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        browser: ["Smartdoc Gateway", "Chrome", "1.0.0"],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code received');
            qrCodeData = await QRCode.toDataURL(qr); // Convert to Base64 for Frontend
            connectionStatus = 'pairing';
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            connectionStatus = 'disconnected';
            qrCodeData = null;
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('Logged out. Please request new QR.');
                // Clean up auth folder if needed
            }
        } else if (connection === 'open') {
            console.log('Opened connection');
            connectionStatus = 'connected';
            qrCodeData = null;
            
            // Fetch basic info simulation
            deviceName = sock.user?.name || 'WhatsApp User';
            deviceBattery = 100; // Baileys doesn't always give battery immediately
        }
    });

    sock.ev.on('messages.upsert', async m => {
        // Handle incoming messages logic here (Auto-reply / Soft Pause)
        console.log("New message:", JSON.stringify(m, undefined, 2));
    });
}

// --- API ROUTES ---

// 1. Status Check (Polled by Frontend)
fastify.get('/instance/status', async (request, reply) => {
    return {
        status: connectionStatus,
        qrCode: qrCodeData, // Will be null if connected
        batteryLevel: deviceBattery,
        phoneName: deviceName,
        phoneNumber: sock?.user?.id?.split(':')[0] || '',
        platform: 'Baileys'
    };
});

// 2. Init Session (User clicks "Connect")
fastify.post('/instance/init', async (request, reply) => {
    if (connectionStatus === 'connected') {
        return { message: 'Already connected' };
    }
    await connectToWhatsApp();
    return { message: 'Initialization started', status: 'pairing' };
});

// 3. Logout
fastify.post('/instance/logout', async (request, reply) => {
    if (sock) {
        await sock.logout();
        fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        connectionStatus = 'disconnected';
        qrCodeData = null;
        return { message: 'Logged out successfully' };
    }
    return { message: 'No active session' };
});

// 4. Send Campaign (The Worker Trigger)
fastify.post('/campaigns', async (request, reply) => {
    const { name, contacts, template } = request.body;
    
    // In a real app, you push this to BullMQ/Redis here
    console.log(`Received campaign "${name}" with ${contacts.length} contacts.`);
    
    // Simulating immediate dispatch for demo purposes (Don't do this in prod for 5000 contacts!)
    /*
    for (const contact of contacts) {
        const id = '212' + contact.phone.substring(1) + '@s.whatsapp.net';
        await sock.sendMessage(id, { text: parseTemplate(template, contact) });
        await new Promise(r => setTimeout(r, Math.random() * 5000 + 2000)); // Random delay
    }
    */

    return { 
        id: 'cmp_' + Date.now(), 
        status: 'queued', 
        message: 'Campaign ingested into BullMQ' 
    };
});

// Start Server
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