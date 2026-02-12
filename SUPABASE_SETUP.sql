-- 1. Activer l'extension UUID (si ce n'est pas déjà fait)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Table pour stocker la session WhatsApp (Auth Keys de Baileys)
-- C'est ici que la connexion est sauvegardée pour éviter de rescanner le QR code
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
    data jsonb DEFAULT '{}', -- Stocke les variables dynamiques {Nom: "Dr X", Ville: "Rabat"}
    status text DEFAULT 'pending', -- pending, sent, failed
    error_message text,
    sent_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- 5. Index pour accélérer le "Worker" (le robot d'envoi)
-- Permet de trouver rapidement le prochain contact "pending"
CREATE INDEX IF NOT EXISTS idx_contacts_campaign_status ON contacts(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);

-- 6. Sécurité (Optionnel pour le MVP, on ouvre tout pour que ton backend Node.js puisse écrire)
ALTER TABLE baileys_auth DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;

-- Vérification : Afficher un message de succès
SELECT 'Setup terminé avec succès. Les tables baileys_auth, campaigns et contacts sont prêtes.' as status;