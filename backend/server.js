// ... (keep existing imports)
const fastify = require('fastify')({ 
    logger: true,
    bodyLimit: 50 * 1024 * 1024 
});
const cors = require('@fastify/cors');
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, delay, BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto'); 

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://jccqciuptsyniaxcyfra.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjY3FjaXVwdHN5bmlheGN5ZnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MDY1MzMsImV4cCI6MjA4NjQ4MjUzM30.m-jqjhhnAR2L29lUN99hZOjRIOrj_wogkzJJII8bsU8';

// --- V9 HIGH VELOCITY CONFIGURATION ---
// AGGRESSIVE MARKETING MODE.
const BASE_STARTING_CAP = 200;  // START HIGH
const MAX_DAILY_LIMIT = 2000;   // GOAL
const DAILY_INCREMENT = 200;    // AGGRESSIVE SCALING

// BURST DELAYS (Fast but randomized)
let CURRENT_MIN_DELAY = 8000;   // 8 seconds (Fast human)
let CURRENT_MAX_DELAY = 25000;  // 25 seconds

// BURST LOGIC
const BURST_SIZE_MIN = 10;
const BURST_SIZE_MAX = 20;
const BURST_COOLDOWN_MS = 300000; // 5 minutes cool-down after a burst

const STOP_KEYWORDS = ['0', 'stop', 'arret', 'arrêt', 'unsubscribe', 'non', 'no', 'quitter', 'pas interessé'];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

// Enable CORS
fastify.register(cors, { 
  origin: '*', 
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'HEAD']
});

// --- GLOBAL STATE ---
const SERVER_INSTANCE_ID = crypto.randomUUID(); 
let sock;
let qrCodeData = null;
let connectionStatus = 'disconnected'; 
let workerStatus = 'idle'; 
let activeCampaignId = null;
let lastInteractiveTime = 0; 
let isConnecting = false; 
let consecutiveConflicts = 0; 
let consecutiveFailures = 0; 
let currentDailyCap = BASE_STARTING_CAP; 
let interruptSleep = false; 

// NEW: In-Memory System Logs
let systemLogs = [];
function addSystemLog(type, message) {
    const log = {
        id: 'sys_' + Date.now() + Math.random(),
        timestamp: new Date(),
        type: type, 
        message: message
    };
    systemLogs.unshift(log);
    if (systemLogs.length > 30) systemLogs.pop(); 
}

// --- DYNAMIC CAP CALCULATOR (V9 AGGRESSIVE) ---
async function calculateDailyLimit() {
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        
        const { count: yesterdaySent, error } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .in('status', ['sent', 'failed']) 
            .gte('sent_at', `${yStr}T00:00:00.000Z`)
            .lt('sent_at', `${yStr}T23:59:59.999Z`);

        if (error) return BASE_STARTING_CAP;

        // V9: Aggressive scaling. 
        // Even if yesterday was low, we allow a high start because the user wants volume.
        let calculated = (yesterdaySent || 0) + DAILY_INCREMENT;
        
        // Ensure minimum baseline is high
        if (calculated < BASE_STARTING_CAP) calculated = BASE_STARTING_CAP;
        if (calculated > MAX_DAILY_LIMIT) calculated = MAX_DAILY_LIMIT;

        console.log(`🔥 V9 VELOCITY: Yesterday=${yesterdaySent} | Today's Limit=${calculated}`);
        return calculated;
    } catch (e) {
        return BASE_STARTING_CAP;
    }
}

// --- BROWSER FINGERPRINT GENERATOR ---
function getRandomBrowserConfig() {
    const platforms = ['Windows', 'macOS']; 
    const browsers = ['Chrome', 'Firefox', 'Edge'];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const browserName = browsers[Math.floor(Math.random() * browsers.length)];
    const major = 122; 
    const minor = 0;
    const build = Math.floor(Math.random() * 9999);
    const version = `${major}.${minor}.${build}`;
    return [platform, browserName, version];
}

// --- MUTEX LOGIC ---
const enforceInstanceUniqueness = async () => {
    try {
        const { error } = await supabase
            .from('baileys_auth')
            .upsert({ key: 'active_instance_owner', value: SERVER_INSTANCE_ID });
        if (error) console.error("Mutex Error:", error.message);
    } catch (e) {
        console.error("Mutex Exception:", e);
    }
};

const checkInstanceIntegrity = async () => {
    try {
        const { data } = await supabase
            .from('baileys_auth')
            .select('value')
            .eq('key', 'active_instance_owner')
            .single();
        if (data && data.value && data.value !== SERVER_INSTANCE_ID) {
            console.error(`💀 FATAL: Detected another active instance. Shutting down.`);
            if (sock) sock.end(undefined);
            process.exit(0);
        }
    } catch (e) {}
};
setInterval(checkInstanceIntegrity, 10000);

// --- AUTH ADAPTER ---
const useSupabaseAuthState = async (supabase) => {
    const writeData = async (data, id) => {
        try {
            const { error } = await supabase
                .from('baileys_auth')
                .upsert({ key: id, value: JSON.stringify(data, BufferJSON.replacer) });
            if (error) console.error('Auth Write Error:', error.message);
        } catch (err) { console.error('Auth Write Exception:', err); }
    };

    const readData = async (id) => {
        try {
            const { data, error } = await supabase
                .from('baileys_auth')
                .select('value')
                .eq('key', id)
                .single();
            if (error && error.code !== 'PGRST116') return null;
            return data ? JSON.parse(data.value, BufferJSON.reviver) : null;
        } catch (err) { return null; }
    };

    const removeData = async (id) => {
        try { await supabase.from('baileys_auth').delete().eq('key', id); } 
        catch (err) { console.error('Auth Delete Exception:', err); }
    };

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) tasks.push(writeData(value, key));
                            else tasks.push(removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};

// --- UTILS ---
function formatPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/\D/g, '');
    if (!cleaned.includes('@s.whatsapp.net')) {
        cleaned = `${cleaned}@s.whatsapp.net`;
    }
    return cleaned;
}

// V9: Return to Invisible Noise to bypass Hash Checking
// Since we want volume, we need to make sure every message has a unique hash
function injectInvisibleNoise(text) {
    const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];
    let suffix = '';
    const suffixLen = Math.floor(Math.random() * 5) + 2; 
    for (let i = 0; i < suffixLen; i++) {
        suffix += zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
    }
    return text + suffix;
}

function processTemplate(template, data) {
    let text = template;
    if (data) {
        Object.entries(data).forEach(([key, value]) => {
             const regex = new RegExp(`{{${key}}}`, 'gi');
             text = text.replace(regex, value || '');
        });
    }
    text = text.replace(/\{([^{}]+)\}/g, (match, group) => {
        const options = group.split('|');
        return options[Math.floor(Math.random() * options.length)];
    });
    // In V9 we use both Spintax AND Noise for maximum safety at speed
    return injectInvisibleNoise(text);
}

// --- WORKER LOOP (V9 HIGH VELOCITY) ---
async function startWorker() {
    if (workerStatus === 'running') return;
    workerStatus = 'running';
    interruptSleep = false;
    consecutiveFailures = 0;
    
    // RECALCULATE CAP ON START
    currentDailyCap = await calculateDailyLimit();
    console.log(`🔥 V9 HIGH VELOCITY ENGAGED.`);
    addSystemLog('info', `🔥 PROTOCOLE V9 ACTIVÉ. Mode Haute Performance.`);

    let messagesSentInBurst = 0;
    let currentBurstTarget = Math.floor(Math.random() * (BURST_SIZE_MAX - BURST_SIZE_MIN + 1)) + BURST_SIZE_MIN;

    while (workerStatus === 'running') {
        
        // 1. Interactive Pause (Shortened for V9)
        const timeSinceReply = Date.now() - lastInteractiveTime;
        if (timeSinceReply < 120000) { // Only 2 mins pause for replies in V9
            console.log(`💬 Reply detected. Short pause.`);
            addSystemLog('warning', `💬 Réponse reçue. Pause courte (2min).`);
            await delay(10000); 
            continue;
        }

        // 2. CHECK DYNAMIC CAP
        const todayStr = new Date().toISOString().split('T')[0];
        const { count: dailyTotal, error: countError } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .in('status', ['sent', 'failed', 'invalid', 'blacklisted']) 
            .gte('sent_at', `${todayStr}T00:00:00.000Z`);

        if (!countError && dailyTotal >= currentDailyCap) {
            console.log(`⏳ DAILY LIMIT REACHED (${dailyTotal}/${currentDailyCap}).`);
            addSystemLog('warning', `⏳ Limite Volumétrique (${currentDailyCap}). En attente...`);
            
            // Interruptible sleep
            const checkInterval = 2000;
            const maxWait = 10 * 60 * 1000; // Check every 10 mins
            let waited = 0;
            while (waited < maxWait && workerStatus === 'running' && !interruptSleep) {
                await delay(checkInterval);
                waited += checkInterval;
            }
            if (interruptSleep) { 
                console.log("⚡ FORCE CONTINUE");
                addSystemLog('success', "⚡ Reprise forcée par l'admin.");
                interruptSleep = false; 
            }
            continue; 
        }

        // 3. BURST & COOL-DOWN LOGIC
        if (messagesSentInBurst >= currentBurstTarget) {
            const cooldownMins = Math.floor(BURST_COOLDOWN_MS / 60000);
            console.log(`❄️ COOL-DOWN: ${cooldownMins}m after ${messagesSentInBurst} msgs.`);
            addSystemLog('info', `❄️ Refroidissement Algo : ${cooldownMins} min.`);
            
            try {
                if (sock) await sock.sendPresenceUpdate('unavailable');
            } catch(e) {}

            const increments = 100;
            const stepMs = BURST_COOLDOWN_MS / increments;
            for (let i = 0; i < increments; i++) {
                if (workerStatus !== 'running' || interruptSleep) break;
                await delay(stepMs);
            }
            
            if (interruptSleep) {
                 addSystemLog('info', "⚡ Cool-down sauté !");
                 interruptSleep = false;
            }

            messagesSentInBurst = 0;
            currentBurstTarget = Math.floor(Math.random() * (BURST_SIZE_MAX - BURST_SIZE_MIN + 1)) + BURST_SIZE_MIN;
            console.log(`🚀 STARTING NEW BURST.`);
            addSystemLog('info', `🚀 Nouvelle Salve (Burst) de ${currentBurstTarget} messages.`);
            continue; 
        }

        if (!activeCampaignId) {
            const { data: campaigns } = await supabase.from('campaigns').select('id').eq('status', 'running').order('created_at', { ascending: false }).limit(1);
            if (campaigns && campaigns.length > 0) {
                activeCampaignId = campaigns[0].id;
                console.log(`🔄 Processing: ${activeCampaignId}`);
            } else {
                workerStatus = 'idle';
                break;
            }
        } else {
            const { data: currentCamp } = await supabase.from('campaigns').select('status').eq('id', activeCampaignId).single();
            if (currentCamp && currentCamp.status !== 'running') {
                workerStatus = 'idle';
                activeCampaignId = null;
                break;
            }
        }

        if (connectionStatus !== 'connected' || !sock) {
            console.log("⚠️ Waiting for connectivity...");
            await delay(5000); 
            continue;
        }

        const { data: contact, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('campaign_id', activeCampaignId)
            .eq('status', 'pending')
            .limit(1)
            .single();

        if (error || !contact) {
            console.log(`Campaign finished.`);
            addSystemLog('success', 'Campagne terminée.');
            await supabase.from('campaigns').update({ status: 'completed', completed_at: new Date() }).eq('id', activeCampaignId);
            activeCampaignId = null; 
            continue; 
        }

        const jid = formatPhoneNumber(contact.phone);

        // Security Checks
        const { data: blacklistEntry } = await supabase.from('blacklist').select('phone').eq('phone', contact.phone).single();
        if (blacklistEntry) {
            await supabase.from('contacts').update({ status: 'blacklisted', error_message: 'Blacklisted', sent_at: new Date() }).eq('id', contact.id);
            continue;
        }

        try {
            if (!jid) throw new Error("Invalid Phone");
            const [result] = await sock.onWhatsApp(jid);
            if (!result || !result.exists) {
                await supabase.from('contacts').update({ status: 'invalid', error_message: 'Not on WA', sent_at: new Date() }).eq('id', contact.id);
                await delay(1000);
                continue;
            }
        } catch (e) {
            await delay(3000);
        }

        const { data: campaignData } = await supabase.from('campaigns').select('template').eq('id', activeCampaignId).single();
        if (!campaignData) { activeCampaignId = null; continue; }
        const message = processTemplate(campaignData.template, contact.data);

        // --- SENDING LOGIC (V9 FAST) ---
        try {
            // Minimal Presence Update for Speed
            await sock.sendPresenceUpdate('composing', jid);
            
            // Fast typing: 2-5 seconds only
            const typingTime = Math.random() * 3000 + 2000;
            await delay(typingTime);
            
            // Send
            await sock.sendMessage(jid, { text: message });
            
            await supabase.from('contacts').update({ status: 'sent', sent_at: new Date() }).eq('id', contact.id);
            
            messagesSentInBurst++;
            consecutiveFailures = 0;
            console.log(`✅ SENT to ${contact.phone}`);
            
            // Very short post-send delay in V9
            await delay(1000);

            // Short interval between messages in a burst
            const nextDelay = Math.floor(Math.random() * (CURRENT_MAX_DELAY - CURRENT_MIN_DELAY + 1)) + CURRENT_MIN_DELAY;
            console.log(`⚡ Next in: ${Math.round(nextDelay/1000)}s`);
            await delay(nextDelay);

        } catch (err) {
            console.error("Send Error:", err);
            consecutiveFailures++;
            await supabase.from('contacts').update({ status: 'failed', error_message: err.message, sent_at: new Date() }).eq('id', contact.id);
            
            if (consecutiveFailures >= 5) { // More tolerant in V9
                 addSystemLog('error', "🚨 Trop d'échecs. Pause 5 min.");
                 await delay(300000); 
                 consecutiveFailures = 0;
            } else {
                 await delay(5000);
            }
        }
    }
}

// --- WHATSAPP CONNECTION ---
async function connectToWhatsApp() {
    if (isConnecting) return;
    if (connectionStatus === 'connected') return;

    isConnecting = true;

    try {
        await enforceInstanceUniqueness();

        if (sock) {
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('creds.update');
            sock.ev.removeAllListeners('messages.upsert');
            sock.end(undefined);
            sock = null;
        }

        const { state, saveCreds } = await useSupabaseAuthState(supabase);
        const { version } = await fetchLatestBaileysVersion();
        
        const browserConfig = getRandomBrowserConfig();

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: browserConfig, 
            syncFullHistory: false, 
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 2000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: false 
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const m of messages) {
                if (!m.key.fromMe) {
                    // In V9 we read messages quickly to look like an active agent
                    if (Math.random() > 0.2) {
                        try {
                            await delay(2000);
                            await sock.readMessages([m.key]);
                        } catch(e) {}
                    }
                    
                    if (m.message) {
                        const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
                        const cleanText = text.trim().toLowerCase();
                        const senderPhone = m.key.remoteJid.split('@')[0];

                        if (STOP_KEYWORDS.some(kw => cleanText.includes(kw))) {
                            console.log(`🛑 OPT-OUT: ${senderPhone}`);
                            addSystemLog('warning', `🛑 Désinscription : ${senderPhone}`);
                            await supabase.from('blacklist').upsert({ phone: senderPhone, reason: 'user_opt_out' });
                            await supabase.from('contacts').update({ status: 'blacklisted' }).eq('phone', senderPhone).eq('status', 'pending');
                        } else {
                            console.log(`📩 Reply from ${senderPhone}.`);
                            addSystemLog('warning', `📩 Réponse de ${senderPhone}.`);
                            lastInteractiveTime = Date.now();
                        }
                    }
                }
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log("⚡ QR Code generated.");
                qrCodeData = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'M', type: 'image/png', margin: 4, scale: 10 });
                connectionStatus = 'pairing';
            }

            if (connection === 'close') {
                const error = lastDisconnect.error;
                const statusCode = error?.output?.statusCode || error?.data?.status || 0;
                
                console.log(`Connection closed. Status: ${statusCode}`);

                const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403;
                const isConflict = statusCode === 440; 

                if (isLoggedOut) {
                    addSystemLog('error', 'Session déconnectée (Log out).');
                    await supabase.from('baileys_auth').delete().neq('key', 'keep_safe');
                    if(sock) { try { sock.end(undefined); } catch(e){} sock = null; }
                    qrCodeData = null;
                    connectionStatus = 'disconnected';
                    isConnecting = false;
                    await delay(2000);
                    connectToWhatsApp();
                } else if (isConflict) {
                    addSystemLog('error', 'Conflit de session (WhatsApp ouvert ailleurs).');
                    consecutiveConflicts++;
                    
                    if (consecutiveConflicts >= 3) process.exit(1); 

                    if(sock) { try { sock.end(undefined); } catch(e){} sock = null; }
                    qrCodeData = null;
                    connectionStatus = 'disconnected';
                    isConnecting = false;
                    
                    await delay(5000);
                    connectToWhatsApp();
                } else {
                    console.log("⚠️ Connection dropped. Reconnecting...");
                    if(sock) { try { sock.end(undefined); } catch(e){} sock = null; }
                    qrCodeData = null;
                    connectionStatus = 'disconnected';
                    isConnecting = false;
                    await delay(5000);
                    connectToWhatsApp();
                }
            } else if (connection === 'open') {
                console.log("✅ Connection Opened Successfully");
                addSystemLog('success', 'Connexion WhatsApp établie.');
                connectionStatus = 'connected';
                qrCodeData = null;
                isConnecting = false; 
                consecutiveConflicts = 0; 
                enforceInstanceUniqueness();
                startWorker();
            }
        });
    } catch (e) {
        console.error("Fatal Error:", e);
        isConnecting = false;
        await delay(5000);
        connectToWhatsApp();
    }
}

// --- ROUTES ---
fastify.get('/', async () => ({ status: 'online', service: 'WhatsApp Gateway' }));
fastify.head('/', async () => ({ status: 'online' }));

fastify.get('/instance/status', async () => ({
    status: connectionStatus,
    qrCode: qrCodeData,
    batteryLevel: 100
}));

fastify.post('/instance/init', async () => {
    connectToWhatsApp();
    return { status: 'pairing' };
});

fastify.post('/instance/logout', async () => {
    if (sock) await sock.logout();
    return { message: 'Logged out' };
});

fastify.post('/instance/reset', async () => {
    if (sock) { try { sock.end(undefined); } catch(e) {} sock = null; }
    await supabase.from('baileys_auth').delete().neq('key', 'keep_safe');
    connectionStatus = 'disconnected';
    qrCodeData = null;
    workerStatus = 'idle';
    isConnecting = false; 
    await delay(1000);
    connectToWhatsApp();
    return { success: true };
});

fastify.post('/campaigns', async (req) => {
    const { name, contacts, template, mapping } = req.body;
    const { data: camp, error: errCamp } = await supabase.from('campaigns').insert({ name, template, status: 'running' }).select().single();
    if (errCamp) throw errCamp;

    const hasMapping = mapping && Object.keys(mapping).length > 0;
    const contactRows = contacts.map(c => {
        let phoneRaw = null;
        if (hasMapping) { 
            const phoneKey = Object.keys(mapping).find(key => mapping[key] === 'phone'); 
            if (phoneKey) phoneRaw = c[phoneKey]; 
        }
        if (!phoneRaw) { phoneRaw = c.phone || c.numero || Object.values(c)[0]; }
        
        const metaData = {};
        if (hasMapping) { 
            Object.entries(mapping).forEach(([csvHeader, varName]) => { 
                if (varName !== 'ignore' && varName !== 'phone') { metaData[varName] = c[csvHeader]; } 
            }); 
        } else { 
            Object.keys(c).forEach(k => { if (k !== 'phone' && k !== 'numero') metaData[k] = c[k]; }); 
        }
        return { campaign_id: camp.id, phone: phoneRaw, data: metaData, status: 'pending' };
    });

    for (let i = 0; i < contactRows.length; i += 500) {
        const chunk = contactRows.slice(i, i + 500);
        await supabase.from('contacts').insert(chunk);
    }
    activeCampaignId = camp.id;
    startWorker();
    return camp;
});

fastify.get('/campaigns/current', async () => {
    const { data: campaign } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(1).single();
    const todayStr = new Date().toISOString().split('T')[0];
    const { count: dailySent } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).in('status', ['sent', 'failed', 'invalid', 'blacklisted']).gte('sent_at', `${todayStr}T00:00:00.000Z`);

    if (!campaign) return { active: false, dailySent: dailySent || 0, dailyCap: currentDailyCap };

    const { count: sent } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'sent');
    const { count: failed } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).in('status', ['failed', 'invalid', 'blacklisted']);
    const { count: pending } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'pending');
    const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id);

    // FETCH DATABASE LOGS
    const { data: recentContacts } = await supabase.from('contacts').select('phone, status, sent_at, error_message').eq('campaign_id', campaign.id).neq('status', 'pending').order('sent_at', { ascending: false }).limit(10);

    const contactLogs = recentContacts.map(c => ({
        id: c.phone,
        timestamp: c.sent_at, // Keep as date object for sorting
        type: c.status === 'sent' ? 'success' : 'error',
        message: c.status === 'sent' ? `Message sent to ${c.phone}` : `${c.status.toUpperCase()} ${c.phone}: ${c.error_message}`
    }));

    // MERGE WITH IN-MEMORY SYSTEM LOGS
    const combinedLogs = [...contactLogs, ...systemLogs]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 20)
        .map(l => ({
            ...l,
            timestamp: new Date(l.timestamp).toLocaleTimeString() // Format final string
        }));

    return {
        active: true,
        workerStatus: campaign.status === 'completed' ? 'idle' : workerStatus,
        dailySent: dailySent || 0,
        dailyCap: currentDailyCap,
        campaign: { ...campaign, totalContacts: total, sentCount: sent, failedCount: failed, pendingCount: pending },
        logs: combinedLogs
    };
});

// NEW: Force Continue Endpoint
fastify.post('/campaigns/force_continue', async () => {
    if (workerStatus === 'running') {
        interruptSleep = true; // Signals the loop to break wait
        return { success: true, message: "Interrupt signal sent" };
    }
    return { success: false, message: "Worker not running" };
});

// ... (Rest of routes same as before)
fastify.post('/campaigns/toggle', async () => {
    if (!activeCampaignId) return { error: "No active" };
    if (workerStatus === 'running') {
        workerStatus = 'paused';
        interruptSleep = true; // Break loops
        addSystemLog('warning', 'Campagne mise en pause manuellement.');
        await supabase.from('campaigns').update({ status: 'paused' }).eq('id', activeCampaignId);
    } else {
        workerStatus = 'running';
        addSystemLog('info', 'Campagne reprise manuellement.');
        await supabase.from('campaigns').update({ status: 'running' }).eq('id', activeCampaignId);
        startWorker();
    }
    return { workerStatus };
});

fastify.post('/campaigns/stop', async () => {
    if (!activeCampaignId) {
        const { data: runningCamps } = await supabase.from('campaigns').select('id').eq('status', 'running');
        if (runningCamps && runningCamps.length > 0) {
            for (const c of runningCamps) {
                await supabase.from('campaigns').update({ status: 'stopped', completed_at: new Date() }).eq('id', c.id);
            }
        }
    } else {
        await supabase.from('campaigns').update({ status: 'stopped', completed_at: new Date() }).eq('id', activeCampaignId);
    }
    addSystemLog('error', 'Campagne stoppée définitivement.');
    workerStatus = 'idle';
    interruptSleep = true; 
    activeCampaignId = null;
    return { success: true };
});

fastify.post('/campaigns/test', async (req) => {
    const { phone, message } = req.body;
    if (!sock || connectionStatus !== 'connected') throw new Error('WhatsApp not connected');
    const jid = formatPhoneNumber(phone);
    // V9: USE INVISIBLE NOISE FOR SPEED
    const finalMessage = injectInvisibleNoise(message); 
    await sock.sendPresenceUpdate('composing', jid);
    await delay(1000); 
    await sock.sendMessage(jid, { text: finalMessage });
    return { success: true };
});

fastify.get('/campaigns/history', async () => {
    const { data: campaigns } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(20);
    if (!campaigns) return [];
    return Promise.all(campaigns.map(async (c) => {
        const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', c.id);
        const { count: sent } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'sent');
        const { count: failed } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', c.id).in('status', ['failed', 'invalid', 'blacklisted']);
        return { ...c, totalContacts: total || 0, sentCount: sent || 0, failedCount: failed || 0 };
    }));
});

fastify.delete('/campaigns/:id', async (req) => {
    const { id } = req.params;
    await supabase.from('campaigns').delete().eq('id', id);
    if (activeCampaignId === id) { activeCampaignId = null; workerStatus = 'idle'; }
    return { success: true };
});

fastify.get('/campaigns/:id/contacts', async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('contacts').select('phone, data').eq('campaign_id', id);
    if(error) throw error;
    return data;
});

// Lists Routes (keep same)
fastify.post('/lists', async (req) => {
    const { name, contacts, mapping } = req.body;
    const { data: list, error: errList } = await supabase.from('contact_lists').insert({ name, total_contacts: contacts.length }).select().single();
    if (errList) throw errList;
    const items = contacts.map(c => {
        let phoneRaw = null;
        if (mapping) { const phoneKey = Object.keys(mapping).find(key => mapping[key] === 'phone'); if (phoneKey) phoneRaw = c[phoneKey]; }
        if (!phoneRaw) { phoneRaw = c.phone || c.numero || Object.values(c)[0]; }
        return { list_id: list.id, phone: phoneRaw, data: { ...c } };
    });
    for (let i = 0; i < items.length; i += 500) { await supabase.from('list_items').insert(items.slice(i, i + 500)); }
    return list;
});
fastify.get('/lists', async () => { const { data } = await supabase.from('contact_lists').select('*').order('created_at', { ascending: false }); return data; });
fastify.delete('/lists/:id', async (req) => { await supabase.from('contact_lists').delete().eq('id', req.params.id); return { success: true }; });
fastify.get('/lists/:id/items', async (req) => {
    const { id } = req.params;
    let allItems = [], from = 0, limit = 1000, fetchMore = true;
    while (fetchMore) {
        const { data } = await supabase.from('list_items').select('*').eq('list_id', id).range(from, from + limit - 1);
        if (data && data.length > 0) { allItems = allItems.concat(data); from += limit; if (data.length < limit) fetchMore = false; } else { fetchMore = false; }
    }
    return allItems;
});
fastify.post('/lists/:id/items', async (req) => {
    const { id } = req.params; const { phone, data } = req.body;
    const { data: newItem } = await supabase.from('list_items').insert({ list_id: id, phone, data }).select().single();
    const { count } = await supabase.from('list_items').select('*', { count: 'exact', head: true }).eq('list_id', id);
    await supabase.from('contact_lists').update({ total_contacts: count }).eq('id', id);
    return newItem;
});
fastify.put('/lists/items/:itemId', async (req) => {
    const { itemId } = req.params; const { phone, data } = req.body;
    const { data: updated } = await supabase.from('list_items').update({ phone, data }).eq('id', itemId).select().single();
    return updated;
});
fastify.delete('/lists/items/:itemId', async (req) => {
    const { itemId } = req.params;
    const { data: item } = await supabase.from('list_items').select('list_id').eq('id', itemId).single();
    await supabase.from('list_items').delete().eq('id', itemId);
    if (item) { const { count } = await supabase.from('list_items').select('*', { count: 'exact', head: true }).eq('list_id', item.list_id); await supabase.from('contact_lists').update({ total_contacts: count }).eq('id', item.list_id); }
    return { success: true };
});

const shutdown = async () => {
    console.log('🛑 Shutting down gracefully...');
    if (sock) { try { sock.end(undefined); } catch (e) {} }
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const start = async () => {
    try { 
        await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }); 
        connectToWhatsApp(); 
    } catch (err) { process.exit(1); }
};
start();