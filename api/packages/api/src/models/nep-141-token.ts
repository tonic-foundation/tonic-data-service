/**
 * Represents a token supported by the API
 */
export interface Nep141Token {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  spec: 'ft-1.0.0';
  reference: string | null;
  reference_hash: string | null;
}
