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
  methods: ['GET', 'POST', 'DELETE', 'PUT']
});

// --- GLOBAL STATE ---
let sock;
let qrCodeData = null;
let connectionStatus = 'disconnected'; 
let workerStatus = 'idle'; // idle, running, paused
let activeCampaignId = null;
let lastInteractiveTime = 0; // Timestamp of last user reply

// --- CUSTOM SUPABASE AUTH ADAPTER ---
const useSupabaseAuthState = async (supabase) => {
    const writeData = async (data, id) => {
        const { error } = await supabase
            .from('baileys_auth')
            .upsert({ key: id, value: JSON.stringify(data, BufferJSON.replacer) });
        if (error) console.error('Auth Write Error:', error);
    };

    const readData = async (id) => {
        const { data, error } = await supabase
            .from('baileys_auth')
            .select('value')
            .eq('key', id)
            .single();
        if (error && error.code !== 'PGRST116') return null; // PGRST116 is "not found"
        return data ? JSON.parse(data.value, BufferJSON.reviver) : null;
    };

    const removeData = async (id) => {
        await supabase.from('baileys_auth').delete().eq('key', id);
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
// This injects random zero-width characters to alter the message HASH without altering visual appearance.
function injectInvisibleNoise(text) {
    const zeroWidthChars = [
        '\u200B', // Zero Width Space
        '\u200C', // Zero Width Non-Joiner
        '\u200D', // Zero Width Joiner
        '\u2060', // Word Joiner
        '\uFEFF'  // Zero Width No-Break Space
    ];
    
    // 1. Generate a random suffix string
    let suffix = '';
    const suffixLen = Math.floor(Math.random() * 3) + 1; 
    for (let i = 0; i < suffixLen; i++) {
        suffix += zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
    }

    // 2. Generate a random prefix string
    let prefix = '';
    const prefixLen = Math.floor(Math.random() * 2); // 0 or 1 char at start
    for (let i = 0; i < prefixLen; i++) {
        prefix += zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
    }

    // The result is visually identical but binary unique
    return prefix + text + suffix;
}

// Spintax & Variable Processor
function processTemplate(template, data) {
    let text = template;
    
    // 1. Variable Substitution
    if (data) {
        Object.entries(data).forEach(([key, value]) => {
             // Case insensitive replacement
             const regex = new RegExp(`{{${key}}}`, 'gi');
             text = text.replace(regex, value || '');
        });
    }

    // 2. Spintax Processing: {Option A|Option B|Option C}
    // We use a regex that handles nested spintax to a degree, or simple level
    text = text.replace(/\{([^{}]+)\}/g, (match, group) => {
        const options = group.split('|');
        return options[Math.floor(Math.random() * options.length)];
    });

    // 3. Final Polymorphic Coating
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

        // 2. SECRET SAUCE #2: AUTOMATIC DAILY STANDBY (The "Set & Forget" Feature)
        const todayStr = new Date().toISOString().split('T')[0];
        const { count: dailyTotal, error: countError } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .in('status', ['sent', 'failed', 'invalid', 'blacklisted']) 
            .gte('sent_at', `${todayStr}T00:00:00.000Z`);

        if (!countError && dailyTotal >= DAILY_SAFETY_CAP) {
            console.log(`⏳ DAILY LIMIT REACHED (${dailyTotal}/${DAILY_SAFETY_CAP}). Entering STANDBY MODE.`);
            console.log(`💤 Sleeping for 15 minutes before next date check...`);
            
            await delay(STANDBY_CHECK_INTERVAL_MS);
            continue; 
        }

        // 3. Get Active Campaign (RESILIENCE: Queries DB for any running campaign)
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
                console.log("No running campaigns found in DB. Going to sleep.");
                workerStatus = 'idle';
                break;
            }
        } else {
            // Check if status changed externally (e.g. stopped via UI)
            const { data: currentCamp } = await supabase.from('campaigns').select('status').eq('id', activeCampaignId).single();
            if (currentCamp && currentCamp.status !== 'running') {
                console.log(`Campaign status changed to ${currentCamp.status}. Stopping worker.`);
                workerStatus = 'idle';
                activeCampaignId = null;
                break;
            }
        }

        // 4. Connection Check (RESILIENT MODE)
        // CHANGE: Do NOT stop worker if disconnected. Wait for reconnection.
        if (connectionStatus !== 'connected' || !sock) {
            console.log("⚠️ WhatsApp Disconnected. Worker waiting for reconnection...");
            // We do NOT set workerStatus = 'paused' here anymore.
            // We just wait and retry.
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
            console.log(`🚫 Skipped Blacklisted: ${contact.phone}`);
            // Use current time for sent_at so it counts towards daily limit check immediately
            await supabase.from('contacts').update({ status: 'blacklisted', error_message: 'User is in blacklist', sent_at: new Date() }).eq('id', contact.id);
            await delay(2000); 
            continue;
        }

        // 7. Honeypot Check
        try {
            if (!jid) throw new Error("Format Invalide");
            const [result] = await sock.onWhatsApp(jid);
            if (!result || !result.exists) {
                console.log(`👻 Invalid WhatsApp Number: ${contact.phone}`);
                // Invalid attempts SHOULD count towards daily limit to protect reputation
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
            const typingDuration = Math.min(15000, Math.max(3000, message.length * 100));
            await delay(typingDuration);
            
            await sock.sendPresenceUpdate('paused', jid);
            await delay(1000 + Math.random() * 2000); 

            await sock.sendMessage(jid, { text: message });
            
            await supabase.from('contacts').update({ status: 'sent', sent_at: new Date() }).eq('id', contact.id);
            
            const currentDaily = (dailyTotal || 0) + 1;
            console.log(`✅ Sent to ${contact.phone} (Daily Impact: ${currentDaily}/${DAILY_SAFETY_CAP})`);
            
            const sleepTime = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1) + MIN_DELAY_MS);
            console.log(`💤 Sleeping for ${Math.round(sleepTime/1000)}s...`);
            await delay(sleepTime);

        } catch (err) {
            console.error("Send Error:", err);
            // Failed sends count towards limit too
            await supabase.from('contacts').update({ status: 'failed', error_message: err.message, sent_at: new Date() }).eq('id', contact.id);
            await delay(20000);
        }
    }
}

// --- WHATSAPP CONNECTION ---
async function connectToWhatsApp() {
    if (connectionStatus === 'pairing' || connectionStatus === 'connected') return;

    const { state, saveCreds } = await useSupabaseAuthState(supabase);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["Smartdoc Agent", "Chrome", "121.0.6167.140"], 
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        markOnlineOnConnect: false 
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const m of messages) {
            if (!m.key.fromMe && m.message) {
                const readDelay = Math.floor(Math.random() * 10000) + 5000;
                setTimeout(async () => {
                    if(sock) await sock.readMessages([m.key]);
                }, readDelay);

                const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
                const cleanText = text.trim().toLowerCase();
                const senderPhone = m.key.remoteJid.split('@')[0];

                if (STOP_KEYWORDS.includes(cleanText)) {
                    console.log(`🛑 OPT-OUT: ${senderPhone}`);
                    await supabase.from('blacklist').upsert({ phone: senderPhone, reason: 'user_opt_out' });
                    // Only update campaign contacts, don't change historic sent status to avoid messing up stats
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
            qrCodeData = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'M', type: 'image/png', margin: 4, scale: 10 });
            connectionStatus = 'pairing';
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            // IMPORTANT: If connection failure (401/403/515), we might want to force reconnect, 
            // but if it is a Loop, we rely on the manual reset.
            console.log('Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            
            if (!shouldReconnect) {
                connectionStatus = 'disconnected';
                qrCodeData = null;
                // DO NOT DELETE AUTH HERE AUTOMATICALLY - IT CAUSES LOOPS
            } else {
                await delay(5000);
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            qrCodeData = null;
            startWorker(); // Resume work on reconnect
        }
    });
}

// --- ROUTES ---

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

// NEW: HARD RESET ROUTE (Fix for Stuck Sessions)
fastify.post('/instance/reset', async () => {
    console.log("HARD RESET: Wiping session data from Supabase...");
    
    // 1. Force close socket if exists
    if (sock) {
        try { sock.end(undefined); } catch(e) {}
        sock = null;
    }
    
    // 2. Wipe DB
    const { error } = await supabase.from('baileys_auth').delete().neq('key', 'keep_safe');
    
    // 3. Reset internal state
    connectionStatus = 'disconnected';
    qrCodeData = null;
    workerStatus = 'idle';
    
    // 4. Restart Logic (Clean slate)
    await delay(2000);
    connectToWhatsApp();

    return { success: true, error };
});

fastify.post('/campaigns', async (req) => {
    const { name, contacts, template, mapping } = req.body;
    const { data: camp, error: errCamp } = await supabase.from('campaigns').insert({ name, template, status: 'running' }).select().single();
    if (errCamp) throw errCamp;

    const contactRows = contacts.map(c => {
        let phoneRaw = null;
        if (mapping) { const phoneKey = Object.keys(mapping).find(key => mapping[key] === 'phone'); if (phoneKey) phoneRaw = c[phoneKey]; }
        if (!phoneRaw) { phoneRaw = c.phone || c.numero || Object.values(c)[0]; }
        const metaData = {};
        if (mapping) { Object.entries(mapping).forEach(([csvHeader, varName]) => { if (varName !== 'ignore' && varName !== 'phone') { metaData[varName] = c[csvHeader]; } }); } 
        else { Object.keys(c).forEach(k => { if (k !== 'phone' && k !== 'numero') metaData[k] = c[k]; }); }
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
    // 1. Get Active Campaign
    const { data: campaign } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    // 2. Global Daily Stats (Warm-up) - STRICT COUNT
    const todayStr = new Date().toISOString().split('T')[0];
    const { count: dailySent } = await supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true })
            .in('status', ['sent', 'failed', 'invalid', 'blacklisted']) // Include all attempts
            .gte('sent_at', `${todayStr}T00:00:00.000Z`);

    if (!campaign) return { active: false, dailySent: dailySent || 0, dailyCap: DAILY_SAFETY_CAP };

    // 3. Campaign Specific Stats
    const { count: sent } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'sent');
    const { count: failed } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).in('status', ['failed', 'invalid', 'blacklisted']);
    const { count: pending } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'pending');
    const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id);

    // 4. Logs
    const { data: recentContacts } = await supabase
        .from('contacts')
        .select('phone, status, sent_at, error_message')
        .eq('campaign_id', campaign.id)
        .neq('status', 'pending')
        .order('sent_at', { ascending: false })
        .limit(10);

    const logs = recentContacts.map(c => ({
        id: c.phone,
        timestamp: c.sent_at ? new Date(c.sent_at).toLocaleTimeString() : '',
        type: c.status === 'sent' ? 'success' : 'error',
        message: c.status === 'sent' ? `Message sent to ${c.phone}` : `${c.status.toUpperCase()} ${c.phone}: ${c.error_message}`
    }));

    if (Date.now() - lastInteractiveTime < INTERACTIVE_PAUSE_MS) {
        logs.unshift({ id: 'pause_sys', timestamp: new Date().toLocaleTimeString(), type: 'warning', message: "⚠️ PAUSED: User replied." });
    }

    // Add explicit disconnection warning if applicable
    if (connectionStatus !== 'connected' && workerStatus === 'running') {
        logs.unshift({ 
            id: 'warn_conn', 
            timestamp: new Date().toLocaleTimeString(), 
            type: 'warning', 
            message: "⚠️ Connection unstable. Waiting for WhatsApp..." 
        });
    }

    return {
        active: true,
        workerStatus: campaign.status === 'completed' ? 'idle' : workerStatus,
        dailySent: dailySent || 0,
        dailyCap: DAILY_SAFETY_CAP,
        campaign: {
            ...campaign,
            totalContacts: total,
            sentCount: sent,
            failedCount: failed,
            pendingCount: pending
        },
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

// NEW: EMERGENCY STOP
fastify.post('/campaigns/stop', async () => {
    if (!activeCampaignId) return { error: "No active" };
    
    console.log(`🛑 EMERGENCY STOP for Campaign ${activeCampaignId}`);
    
    // 1. Update DB Status
    await supabase.from('campaigns').update({ status: 'stopped', completed_at: new Date() }).eq('id', activeCampaignId);
    
    // 2. Kill Worker
    workerStatus = 'idle';
    activeCampaignId = null;
    
    return { success: true };
});

// NEW: TEST MESSAGE ENDPOINT
fastify.post('/campaigns/test', async (req) => {
    const { phone, message } = req.body;
    if (!sock || connectionStatus !== 'connected') throw new Error('WhatsApp not connected');
    
    const jid = formatPhoneNumber(phone);
    // Note: We use the exact same processTemplate function to ensure the admin sees EXACTLY what the user sees (including noise)
    // We pass null for data because the test message usually has the variables already filled by the frontend preview, 
    // OR the admin wants to test the raw template.
    // However, to be safe, let's assume the frontend sends the "final rendered text" and we just add the invisible noise here.
    // Wait, processTemplate ADDS the noise. So we should pass the raw text and let processTemplate add noise.
    
    const finalMessage = injectInvisibleNoise(message);
    
    await sock.sendPresenceUpdate('composing', jid);
    await delay(1000); 
    await sock.sendMessage(jid, { text: finalMessage });
    
    return { success: true };
});

fastify.get('/campaigns/history', async () => {
    const { data: campaigns } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(20);
    if (!campaigns) return [];
    const enriched = await Promise.all(campaigns.map(async (c) => {
        const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', c.id);
        const { count: sent } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'sent');
        const { count: failed } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', c.id).in('status', ['failed', 'invalid', 'blacklisted']);
        return { ...c, totalContacts: total || 0, sentCount: sent || 0, failedCount: failed || 0 };
    }));
    return enriched;
});

fastify.delete('/campaigns/:id', async (req) => {
    const { id } = req.params;
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (error) throw error;
    if (activeCampaignId === id) { activeCampaignId = null; workerStatus = 'idle'; }
    return { success: true };
});

// List Routes (unchanged)
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
    try { await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }); connectToWhatsApp(); } catch (err) { process.exit(1); }
};
start();