/**
 * Given a symbol from CoinMarketCap, eg, ETH_USDC, return the canonical
 * symbol used in our DB, ie, eth/usdc.
 */
export function toInternalSymbol(s: string) {
  return s.replace('_', '/').toLowerCase();
}

/**
 * Given a canonical symbol from our DB, eg, eth/usdc, return the symbol
 * used by CoinMarketCap, ie, ETH_USDC.
 */
export function toExternalSymbol(s: string) {
  return s.replace('/', '_').toUpperCase();
}
