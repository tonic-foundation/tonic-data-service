-- Your SQL goes here
ALTER TABLE market ADD CONSTRAINT unique_symbol UNIQUE (symbol);
