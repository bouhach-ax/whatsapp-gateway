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

function processTemplate(template, data) {
    let text = template;
    // Spintax
    text = text.replace(/\{([^{}]+)\}/g, (match, group) => {
        const options = group.split('|');
        return options[Math.floor(Math.random() * options.length)];
    });
    // Variables
    if (data) {
        Object.entries(data).forEach(([key, value]) => {
             const regex = new RegExp(`{{${key}}}`, 'g');
             text = text.replace(regex, value || '');
        });
    }
    return text;
}

// --- WORKER LOOP (DATABASE DRIVEN) ---
async function startWorker() {
    if (workerStatus === 'running') return;
    workerStatus = 'running';
    console.log("Database Worker started");

    while (workerStatus === 'running') {
        
        // 1. Get Active Campaign ID
        if (!activeCampaignId) {
            const { data: campaigns } = await supabase
                .from('campaigns')
                .select('id')
                .eq('status', 'running')
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (campaigns && campaigns.length > 0) {
                activeCampaignId = campaigns[0].id;
            } else {
                console.log("No running campaigns found. Worker going to sleep.");
                workerStatus = 'idle';
                break;
            }
        }

        // 2. Check Connection
        if (connectionStatus !== 'connected' || !sock) {
            console.log("Paused: WhatsApp Disconnected");
            workerStatus = 'paused';
            break;
        }

        // 3. Fetch NEXT Pending Contact
        const { data: contact, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('campaign_id', activeCampaignId)
            .eq('status', 'pending')
            .limit(1)
            .single();

        if (error || !contact) {
            // No more contacts for this campaign
            console.log(`Campaign ${activeCampaignId} finished.`);
            await supabase.from('campaigns').update({ status: 'completed', completed_at: new Date() }).eq('id', activeCampaignId);
            activeCampaignId = null; // Reset to look for next campaign
            continue; 
        }

        // 4. Get Template
        const { data: campaignData } = await supabase.from('campaigns').select('template').eq('id', activeCampaignId).single();
        if (!campaignData) { activeCampaignId = null; continue; }

        const jid = formatPhoneNumber(contact.phone);
        const message = processTemplate(campaignData.template, contact.data);

        // 5. Send Process
        try {
            if (!jid) throw new Error("Invalid Phone Number");

            await sock.sendPresenceUpdate('composing', jid);
            await delay(2000 + Math.random() * 3000); 
            await sock.sendPresenceUpdate('paused', jid);

            await sock.sendMessage(jid, { text: message });
            
            // UPDATE DB: Success
            await supabase.from('contacts').update({ 
                status: 'sent', 
                sent_at: new Date() 
            }).eq('id', contact.id);

            console.log(`Sent to ${contact.phone}`);
            
            // Random Delay
            const waitTime = 5000 + Math.random() * 5000; 
            await delay(waitTime);

        } catch (err) {
            console.error("Send Error:", err);
            // UPDATE DB: Failed
            await supabase.from('contacts').update({ 
                status: 'failed', 
                error_message: err.message 
            }).eq('id', contact.id);
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
        browser: ["Smartdoc Cloud", "Chrome", "1.0.0"],
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
                await supabase.from('baileys_auth').delete().neq('key', 'keep_safe');
            } else {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            qrCodeData = null;
            startWorker();
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

// CREATE CAMPAIGN
fastify.post('/campaigns', async (req) => {
    const { name, contacts, template, mapping } = req.body;
    
    // 1. Create Campaign
    const { data: camp, error: errCamp } = await supabase
        .from('campaigns')
        .insert({ name, template, status: 'running' })
        .select()
        .single();
        
    if (errCamp) throw errCamp;

    // 2. Prepare Contacts
    const contactRows = contacts.map(c => {
        // Find Phone
        let phoneRaw = null;
        if (mapping) {
             const phoneKey = Object.keys(mapping).find(key => mapping[key] === 'phone');
             if (phoneKey) phoneRaw = c[phoneKey];
        }
        if (!phoneRaw) {
             // Fallback: look for 'phone', 'numero' or internal 'phone' key
             phoneRaw = c.phone || c.numero || Object.values(c)[0];
        }

        // Map Data for Variables
        const metaData = {};
        if (mapping) {
            Object.entries(mapping).forEach(([csvHeader, varName]) => {
                if (varName !== 'ignore' && varName !== 'phone') {
                    metaData[varName] = c[csvHeader];
                }
            });
        } else {
            // If no mapping provided (e.g. from saved list), dump everything except phone
            Object.keys(c).forEach(k => {
                if (k !== 'phone' && k !== 'numero') metaData[k] = c[k];
            });
        }

        return {
            campaign_id: camp.id,
            phone: phoneRaw,
            data: metaData,
            status: 'pending'
        };
    });

    // 3. Batch Insert Contacts (Chunked for safety)
    const chunkSize = 500;
    for (let i = 0; i < contactRows.length; i += chunkSize) {
        const chunk = contactRows.slice(i, i + chunkSize);
        const { error: errCont } = await supabase.from('contacts').insert(chunk);
        if (errCont) {
            console.error("Error inserting campaign contacts:", errCont);
            throw errCont;
        }
    }

    activeCampaignId = camp.id;
    startWorker();
    
    return camp;
});

// GET CURRENT / STATUS
fastify.get('/campaigns/current', async () => {
    const { data: campaign } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!campaign) return { active: false };

    const { count: sent } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'sent');
    const { count: failed } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'failed');
    const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('campaign_id', campaign.id);

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
        message: c.status === 'sent' ? `Message sent to ${c.phone}` : `Failed ${c.phone}: ${c.error_message}`
    }));

    return {
        active: true,
        workerStatus: campaign.status === 'completed' ? 'idle' : workerStatus,
        campaign: {
            ...campaign,
            totalContacts: total,
            sentCount: sent,
            failedCount: failed,
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

fastify.get('/campaigns/history', async () => {
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(20);
    return data;
});

// --- LIST MANAGEMENT ROUTES ---

// Save List (Bulk with Batching)
fastify.post('/lists', async (req) => {
    const { name, contacts, mapping } = req.body;
    console.log(`Saving list "${name}" with ${contacts?.length} contacts`);

    // 1. Create List Header
    const { data: list, error: errList } = await supabase
        .from('contact_lists')
        .insert({ name, total_contacts: contacts.length })
        .select()
        .single();

    if (errList) {
        console.error("Error creating list header:", errList);
        throw errList;
    }

    // 2. Prepare Items
    const items = contacts.map(c => {
        let phoneRaw = null;
        if (mapping) {
             const phoneKey = Object.keys(mapping).find(key => mapping[key] === 'phone');
             if (phoneKey) phoneRaw = c[phoneKey];
        }
        if (!phoneRaw) {
             const keys = Object.keys(c);
             const phoneKey = keys.find(k => k.toLowerCase().includes('phone')) || keys[0];
             phoneRaw = c[phoneKey];
        }
        const metaData = { ...c };
        // Clean metadata? No, keep all for flexibility.
        return { list_id: list.id, phone: phoneRaw, data: metaData };
    });

    // 3. Batch Insert Items (Chunked)
    const chunkSize = 500;
    for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const { error: errItems } = await supabase.from('list_items').insert(chunk);
        if (errItems) {
             console.error(`Error inserting batch ${i}:`, errItems);
             // We continue trying other chunks or throw? Throwing is safer for data integrity awareness.
             throw errItems;
        }
    }

    return list;
});

// Get All Lists
fastify.get('/lists', async () => {
    const { data } = await supabase.from('contact_lists').select('*').order('created_at', { ascending: false });
    return data;
});

// Delete List
fastify.delete('/lists/:id', async (req) => {
    const { id } = req.params;
    const { error } = await supabase.from('contact_lists').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
});

// Get List Items
fastify.get('/lists/:id/items', async (req) => {
    const { id } = req.params;
    const { data } = await supabase.from('list_items').select('*').eq('list_id', id); // Select * to get ID for edits
    return data;
});

// Add Single Item to List
fastify.post('/lists/:id/items', async (req) => {
    const { id } = req.params;
    const { phone, data } = req.body;
    
    // Add Item
    const { data: newItem, error } = await supabase
        .from('list_items')
        .insert({ list_id: id, phone, data })
        .select()
        .single();
    if (error) throw error;
    
    // Increment Count
    const { count } = await supabase.from('list_items').select('*', { count: 'exact', head: true }).eq('list_id', id);
    await supabase.from('contact_lists').update({ total_contacts: count }).eq('id', id);

    return newItem;
});

// Update Single Item
fastify.put('/lists/items/:itemId', async (req) => {
    const { itemId } = req.params;
    const { phone, data } = req.body;
    const { data: updated, error } = await supabase
        .from('list_items')
        .update({ phone, data })
        .eq('id', itemId)
        .select()
        .single();
    if (error) throw error;
    return updated;
});

// Delete Single Item
fastify.delete('/lists/items/:itemId', async (req) => {
    const { itemId } = req.params;
    // Get list_id before deleting to update count
    const { data: item } = await supabase.from('list_items').select('list_id').eq('id', itemId).single();
    
    const { error } = await supabase.from('list_items').delete().eq('id', itemId);
    if (error) throw error;

    if (item) {
        const { count } = await supabase.from('list_items').select('*', { count: 'exact', head: true }).eq('list_id', item.list_id);
        await supabase.from('contact_lists').update({ total_contacts: count }).eq('id', item.list_id);
    }
    return { success: true };
});

const start = async () => {
    try {
        await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
        connectToWhatsApp(); 
    } catch (err) {
        process.exit(1);
    }
};
start();