-- 1. Activer l'extension UUID (si ce n'est pas déjà fait)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Table pour stocker la session WhatsApp (Auth Keys de Baileys)
CREATE TABLE IF NOT EXISTS baileys_auth (
    key text PRIMARY KEY,
    value text
);

-- 3. Table des Campagnes
CREATE TABLE IF NOT EXISTS campaigns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    status text DEFAULT 'draft', -- draft, running, paused, completed, stopped
    template text,
    created_at timestamptz DEFAULT now(),
    completed_at timestamptz
);

-- 4. Table des Contacts (Leads)
CREATE TABLE IF NOT EXISTS contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
    phone text NOT NULL,
    data jsonb DEFAULT '{}', 
    status text DEFAULT 'pending', -- pending, sent, failed, invalid, blacklisted
    error_message text,
    sent_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- 5. Table des Listes de contacts (pour réutilisation)
CREATE TABLE IF NOT EXISTS contact_lists (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    total_contacts int DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- 6. Items des listes
CREATE TABLE IF NOT EXISTS list_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    list_id uuid REFERENCES contact_lists(id) ON DELETE CASCADE,
    phone text NOT NULL,
    data jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- 7. BLACKLIST (Anti-Ban & RGPD)
-- Les numéros ici ne seront PLUS JAMAIS contactés, peu importe la campagne.
CREATE TABLE IF NOT EXISTS blacklist (
    phone text PRIMARY KEY,
    reason text DEFAULT 'user_opt_out', -- user_opt_out, manual, bounce
    created_at timestamptz DEFAULT now()
);

-- Index pour la performance
CREATE INDEX IF NOT EXISTS idx_contacts_campaign_status ON contacts(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);

-- Désactivation RLS (Mode API Serveur)
ALTER TABLE baileys_auth DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE contact_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE list_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist DISABLE ROW LEVEL SECURITY;

SELECT 'Setup complet avec Blacklist terminé.' as status;