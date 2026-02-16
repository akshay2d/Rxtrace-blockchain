-- Create TokenStatus enum
CREATE TYPE  TokenStatus AS ENUM ('ACTIVE','DISABLED');

-- Create user-owned token registry
CREATE TABLE Token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  userId text NOT NULL,
  tokenNumber text NOT NULL UNIQUE,
  generatedAt timestamptz NOT NULL DEFAULT now(),
  expiry timestamptz NOT NULL,
  status TokenStatus NOT NULL DEFAULT 'ACTIVE',
  activationCount integer NOT NULL DEFAULT 0,
  maxActivations integer NOT NULL DEFAULT 10
);

CREATE TABLE Handset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  userId text NOT NULL,
  deviceName text NOT NULL,
  tokenId uuid NOT NULL,
  activatedAt timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT Handset_tokenId_fkey FOREIGN KEY (tokenId) REFERENCES Token(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_tokens_user_id ON Token (userId);
CREATE INDEX idx_handsets_user_id ON Handset (userId);
CREATE INDEX idx_handsets_token_id ON Handset (tokenId);
