// ... (keep existing imports)
const fastify = require('fastify')({ 
    logger: true,
    bodyLimit: 50 * 1024 * 1024 // LIMIT INCREASED TO 50MB for large CSV imports
});
const cors = require('@fastify/cors');
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, delay, BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://jccqciuptsyniaxcyfra.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjY3FjaXVwdHN5bmlheGN5ZnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MDY1MzMsImV4cCI6MjA4NjQ4MjUzM30.m-jqjhhnAR2L29lUN99hZOjRIOrj_wogkzJJII8bsU8';

// SAFETY CONFIGURATION (Anti-Ban STRICT & PARANOID)
const MIN_DELAY_MS = 30000; // 30 seconds min
const MAX_DELAY_MS = 60000; // 60 seconds max
const INTERACTIVE_PAUSE_MS = 120000; // 2 mins pause on reply
const STANDBY_CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 mins if new day started
const STOP_KEYWORDS = ['0', 'stop', 'arret', 'arrêt', 'unsubscribe', 'non', 'no', 'quitter'];
const DAILY_SAFETY_CAP = 250; // ⚠️ HARD LIMIT REVISED: 250 interactions (Sent OR Failed)

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

// Enable CORS
fastify.register(cors, { 
  origin: '*', 
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'HEAD']
});

// --- GLOBAL STATE ---
let sock;
let qrCodeData = null;
let connectionStatus = 'disconnected'; 
let workerStatus = 'idle'; // idle, running, paused
let activeCampaignId = null;
let lastInteractiveTime = 0; // Timestamp of last user reply
let isConnecting = false; // LOCK to prevent race conditions

// --- CUSTOM SUPABASE AUTH ADAPTER ---
const useSupabaseAuthState = async (supabase) => {
    const writeData = async (data, id) => {
        try {
            const { error } = await supabase
                .from('baileys_auth')
                .upsert({ key: id, value: JSON.stringify(data, BufferJSON.replacer) });
            if (error) console.error('Auth Write Error:', error.message);
        } catch (err) {
            console.error('Auth Write Exception:', err);
        }
    };

    const readData = async (id) => {
        try {
            const { data, error } = await supabase
                .from('baileys_auth')
                .select('value')
                .eq('key', id)
                .single();
            if (error && error.code !== 'PGRST116') return null; // PGRST116 is "not found"
            return data ? JSON.parse(data.value, BufferJSON.reviver) : null;
        } catch (err) {
            console.error('Auth Read Exception:', err);
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            await supabase.from('baileys_auth').delete().eq('key', id);
        } catch (err) {
            console.error('Auth Delete Exception:', err);
        }
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
                            if (value) {
                                tasks.push(writeData(value, key));
                            } else {
                                tasks.push(removeData(key));
                            }
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

// SECRET SAUCE #1: Polymorphic Invisible Noise V2 (Stronger)
function injectInvisibleNoise(text) {
    const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];
    let suffix = '';
    const suffixLen = Math.floor(Math.random() * 3) + 1; 
    for (let i = 0; i < suffixLen; i++) {
        suffix += zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
    }
    let prefix = '';
    const prefixLen = Math.floor(Math.random() * 2); 
    for (let i = 0; i < prefixLen; i++) {
        prefix += zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
    }
    return prefix + text + suffix;
}

// Spintax & Variable Processor
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
    return injectInvisibleNoise(text);
}

// --- WORKER LOOP (PARANOID MODE) ---
async function startWorker() {
    if (workerStatus === 'running') return;
    workerStatus = 'running';
    console.log("🛡️ Intelligent Worker started (Paranoid Mode)");

    while (workerStatus === 'running') {
        
        // 1. Interactive Pause
        const timeSinceReply = Date.now() - lastInteractiveTime;
        if (timeSinceReply < INTERACTIVE_PAUSE_MS) {
            console.log(`💬 Conversation active. Campaign paused.`);
            await delay(10000); 
            continue;
        }

        // 2. DAILY STANDBY
        const todayStr = new Date().toISOString().split('T')[0];
        const { count: dailyTotal, error: countError } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .in('status', ['sent', 'failed', 'invalid', 'blacklisted']) 
            .gte('sent_at', `${todayStr}T00:00:00.000Z`);

        if (!countError && dailyTotal >= DAILY_SAFETY_CAP) {
            console.log(`⏳ DAILY LIMIT REACHED (${dailyTotal}/${DAILY_SAFETY_CAP}). Entering STANDBY MODE.`);
            await delay(STANDBY_CHECK_INTERVAL_MS);
            continue; 
        }

        // 3. Get Active Campaign
        if (!activeCampaignId) {
            const { data: campaigns } = await supabase
                .from('campaigns')
                .select('id')
                .eq('status', 'running')
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (campaigns && campaigns.length > 0) {
                activeCampaignId = campaigns[0].id;
                console.log(`🔄 Resuming Campaign ID: ${activeCampaignId}`);
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

        // 4. Connection Check
        if (connectionStatus !== 'connected' || !sock) {
            console.log("⚠️ WhatsApp Disconnected. Worker waiting...");
            await delay(5000); 
            continue;
        }

        // 5. Fetch Contact
        const { data: contact, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('campaign_id', activeCampaignId)
            .eq('status', 'pending')
            .limit(1)
            .single();

        if (error || !contact) {
            console.log(`Campaign ${activeCampaignId} finished.`);
            await supabase.from('campaigns').update({ status: 'completed', completed_at: new Date() }).eq('id', activeCampaignId);
            activeCampaignId = null; 
            continue; 
        }

        const jid = formatPhoneNumber(contact.phone);

        // 6. Blacklist Check
        const { data: blacklistEntry } = await supabase.from('blacklist').select('phone').eq('phone', contact.phone).single();
        if (blacklistEntry) {
            await supabase.from('contacts').update({ status: 'blacklisted', error_message: 'User is in blacklist', sent_at: new Date() }).eq('id', contact.id);
            await delay(2000); 
            continue;
        }

        // 7. Honeypot Check
        try {
            if (!jid) throw new Error("Format Invalide");
            const [result] = await sock.onWhatsApp(jid);
            if (!result || !result.exists) {
                await supabase.from('contacts').update({ status: 'invalid', error_message: 'Not on WhatsApp', sent_at: new Date() }).eq('id', contact.id);
                await delay(5000); 
                continue;
            }
        } catch (e) {
            console.error("Check OnWhatsApp failed:", e);
            await delay(10000); 
            continue; 
        }

        // 8. Process Message
        const { data: campaignData } = await supabase.from('campaigns').select('template').eq('id', activeCampaignId).single();
        if (!campaignData) { activeCampaignId = null; continue; }
        const message = processTemplate(campaignData.template, contact.data);

        // 9. Sending Sequence
        try {
            await sock.sendPresenceUpdate('composing', jid);
            await delay(Math.min(15000, Math.max(3000, message.length * 100)));
            await sock.sendPresenceUpdate('paused', jid);
            await delay(1000 + Math.random() * 2000); 
            await sock.sendMessage(jid, { text: message });
            
            await supabase.from('contacts').update({ status: 'sent', sent_at: new Date() }).eq('id', contact.id);
            
            const currentDaily = (dailyTotal || 0) + 1;
            console.log(`✅ Sent to ${contact.phone} (Daily: ${currentDaily})`);
            
            await delay(Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1) + MIN_DELAY_MS));
        } catch (err) {
            console.error("Send Error:", err);
            await supabase.from('contacts').update({ status: 'failed', error_message: err.message, sent_at: new Date() }).eq('id', contact.id);
            await delay(20000);
        }
    }
}

// --- WHATSAPP CONNECTION ---
async function connectToWhatsApp() {
    // 1. PREVENT RACE CONDITIONS
    if (isConnecting) return;
    if (connectionStatus === 'connected') return;

    isConnecting = true;

    try {
        // 2. CLEANUP PREVIOUS LISTENERS (Crucial for stability)
        if (sock) {
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('creds.update');
            sock.ev.removeAllListeners('messages.upsert');
            sock.end(undefined);
            sock = null;
        }

        const { state, saveCreds } = await useSupabaseAuthState(supabase);
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            // UPDATED BROWSER TO AVOID OLD VERSION BAN
            browser: ["Smartdoc Agent", "Chrome", "125.0.6422.141"], 
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 2000, // Retry failed requests
            keepAliveIntervalMs: 10000, // Keep WebSockets alive on Render
            markOnlineOnConnect: false 
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            for (const m of messages) {
                if (!m.key.fromMe && m.message) {
                    const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
                    const cleanText = text.trim().toLowerCase();
                    const senderPhone = m.key.remoteJid.split('@')[0];

                    if (STOP_KEYWORDS.includes(cleanText)) {
                        console.log(`🛑 OPT-OUT: ${senderPhone}`);
                        await supabase.from('blacklist').upsert({ phone: senderPhone, reason: 'user_opt_out' });
                        await supabase.from('contacts').update({ status: 'blacklisted' }).eq('phone', senderPhone).eq('status', 'pending');
                    } else {
                        console.log(`📩 Reply from ${senderPhone}. Pausing.`);
                        lastInteractiveTime = Date.now();
                    }
                }
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log("⚡ QR Code generated. Waiting for scan...");
                qrCodeData = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'M', type: 'image/png', margin: 4, scale: 10 });
                connectionStatus = 'pairing';
            }

            if (connection === 'close') {
                const error = lastDisconnect.error;
                const statusCode = error?.output?.statusCode || error?.data?.status || 0;
                
                console.log(`Connection closed. Status: ${statusCode}, Reason: ${error?.message}`);

                const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403;
                
                if (isLoggedOut) {
                    console.log("🛑 FATAL ERROR (401/403). Session invalidated. Wiping DB...");
                    
                    // 1. Wipe Supabase Auth
                    await supabase.from('baileys_auth').delete().neq('key', 'keep_safe');
                    
                    // 2. Reset Local State
                    if(sock) { try { sock.end(undefined); } catch(e){} sock = null; }
                    qrCodeData = null;
                    connectionStatus = 'disconnected';
                    isConnecting = false; // Unlock

                    // 3. Restart immediately to generate new QR
                    await delay(2000);
                    connectToWhatsApp();
                } else {
                    console.log("⚠️ Connection dropped. Reconnecting in 5s...");
                    if(sock) { try { sock.end(undefined); } catch(e){} sock = null; }
                    qrCodeData = null;
                    connectionStatus = 'disconnected';
                    isConnecting = false; // Unlock
                    
                    await delay(5000);
                    connectToWhatsApp();
                }
            } else if (connection === 'open') {
                console.log("✅ Connection Opened Successfully");
                connectionStatus = 'connected';
                qrCodeData = null;
                isConnecting = false; // Unlock
                startWorker();
            }
        });
    } catch (e) {
        console.error("Fatal Error in connectToWhatsApp:", e);
        isConnecting = false;
        await delay(5000);
        connectToWhatsApp();
    }
}

// --- ROUTES ---

// NEW: Root route and HEAD to prevent 404 logs from Health Checks
fastify.get('/', async () => ({ status: 'online', service: 'WhatsApp Gateway' }));
fastify.head('/', async () => ({ status: 'online' }));

fastify.get('/instance/status', async () => ({
    status: connectionStatus,
    qrCode: qrCodeData,
    batteryLevel: 100
}));

fastify.post('/instance/init', async () => {
    // Manually trigger connection if not already connecting
    connectToWhatsApp();
    return { status: 'pairing' };
});

fastify.post('/instance/logout', async () => {
    if (sock) await sock.logout();
    return { message: 'Logged out' };
});

fastify.post('/instance/reset', async () => {
    console.log("HARD RESET TRIGGERED");
    if (sock) {
        try { sock.end(undefined); } catch(e) {}
        sock = null;
    }
    await supabase.from('baileys_auth').delete().neq('key', 'keep_safe');
    connectionStatus = 'disconnected';
    qrCodeData = null;
    workerStatus = 'idle';
    isConnecting = false; // Unlock
    await delay(1000);
    connectToWhatsApp();
    return { success: true };
});

fastify.post('/campaigns', async (req) => {
    const { name, contacts, template, mapping } = req.body;
    const { data: camp, error: errCamp } = await supabase.from('campaigns').insert({ name, template, status: 'running' }).select().single();
    if (errCamp) throw errCamp;

    // FIX FOR RE-RUN MAPPING LOGIC
    // We strictly check if mapping exists AND has keys. If not, we fall back to direct key usage.
    const hasMapping = mapping && Object.keys(mapping).length > 0;

    const contactRows = contacts.map(c => {
        let phoneRaw = null;
        if (hasMapping) { 
            const phoneKey = Object.keys(mapping).find(key => mapping[key] === 'phone'); 
            if (phoneKey) phoneRaw = c[phoneKey]; 
        }
        // Fallback for phone: If no mapping, assume 'phone' key exists in object
        if (!phoneRaw) { phoneRaw = c.phone || c.numero || Object.values(c)[0]; }
        
        const metaData = {};
        if (hasMapping) { 
            Object.entries(mapping).forEach(([csvHeader, varName]) => { 
                if (varName !== 'ignore' && varName !== 'phone') { metaData[varName] = c[csvHeader]; } 
            }); 
        } else { 
            // DIRECT MAPPING (For Rerun)
            Object.keys(c).forEach(k => { 
                if (k !== 'phone' && k !== 'numero') metaData[k] = c[k]; 
            }); 
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

// GET CURRENT STATUS WITH COCKPIT DATA
fastify.get('/campaigns/current', async () => {
    const { data: campaign } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(1).single();
    const todayStr = new Date().toISOString().split('T')[0];
    const { count: dailySent } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).in('status', ['sent', 'failed', 'invalid', 'blacklisted']).gte('sent_at', `${todayStr}T00:00:00.000Z`);

    if (!campaign) return { active: false, dailySent: dailySent || 0, dailyCap: DAILY_SAFETY_CAP };

    const { count: sent } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'sent');
    const { count: failed } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).in('status', ['failed', 'invalid', 'blacklisted']);
    const { count: pending } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'pending');
    const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id);

    const { data: recentContacts } = await supabase.from('contacts').select('phone, status, sent_at, error_message').eq('campaign_id', campaign.id).neq('status', 'pending').order('sent_at', { ascending: false }).limit(10);

    const logs = recentContacts.map(c => ({
        id: c.phone,
        timestamp: c.sent_at ? new Date(c.sent_at).toLocaleTimeString() : '',
        type: c.status === 'sent' ? 'success' : 'error',
        message: c.status === 'sent' ? `Message sent to ${c.phone}` : `${c.status.toUpperCase()} ${c.phone}: ${c.error_message}`
    }));

    if (Date.now() - lastInteractiveTime < INTERACTIVE_PAUSE_MS) {
        logs.unshift({ id: 'pause_sys', timestamp: new Date().toLocaleTimeString(), type: 'warning', message: "⚠️ PAUSED: User replied." });
    }

    if (connectionStatus !== 'connected' && workerStatus === 'running') {
        logs.unshift({ id: 'warn_conn', timestamp: new Date().toLocaleTimeString(), type: 'warning', message: "⚠️ Connection unstable. Waiting for WhatsApp..." });
    }

    return {
        active: true,
        workerStatus: campaign.status === 'completed' ? 'idle' : workerStatus,
        dailySent: dailySent || 0,
        dailyCap: DAILY_SAFETY_CAP,
        campaign: { ...campaign, totalContacts: total, sentCount: sent, failedCount: failed, pendingCount: pending },
        logs
    };
});

fastify.post('/campaigns/toggle', async () => {
    if (!activeCampaignId) return { error: "No active" };
    if (workerStatus === 'running') {
        workerStatus = 'paused';
        await supabase.from('campaigns').update({ status: 'paused' }).eq('id', activeCampaignId);
    } else {
        workerStatus = 'running';
        await supabase.from('campaigns').update({ status: 'running' }).eq('id', activeCampaignId);
        startWorker();
    }
    return { workerStatus };
});

fastify.post('/campaigns/stop', async () => {
    // FORCE STOP: If no active variable, check DB for any running campaign and stop it
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
    
    workerStatus = 'idle';
    activeCampaignId = null;
    return { success: true };
});

fastify.post('/campaigns/test', async (req) => {
    const { phone, message } = req.body;
    if (!sock || connectionStatus !== 'connected') throw new Error('WhatsApp not connected');
    const jid = formatPhoneNumber(phone);
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

// NEW: GET CONTACTS FOR RERUN
fastify.get('/campaigns/:id/contacts', async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase
        .from('contacts')
        .select('phone, data')
        .eq('campaign_id', id);
    if(error) throw error;
    return data;
});

// List Routes
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

const start = async () => {
    try { 
        await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }); 
        // Initial connection start
        connectToWhatsApp(); 
    } catch (err) { 
        process.exit(1); 
    }
};
start();