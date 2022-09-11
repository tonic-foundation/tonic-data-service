import { Account, keyStores, Near } from 'near-api-js';
import { getNearConfig, NearEnv } from '@tonic-foundation/config';
import { getConfig } from './config';
import { Tonic } from '@tonic-foundation/tonic';

export function maybeDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

let _nobody: Account | undefined;

export async function getNearNobodyAccount() {
  if (_nobody) {
    return _nobody;
  }
  const nearEnv = getConfig().NEAR_ENV as NearEnv;
  const near = new Near({
    ...getNearConfig(nearEnv),
    keyStore: new keyStores.InMemoryKeyStore(),
  });
  _nobody = await near.account('nobody');
  return _nobody;
}

let _tonic: Tonic | undefined;
export async function getTonicClient() {
  if (_tonic) {
    return _tonic;
  }

  _tonic = new Tonic(await getNearNobodyAccount(), getConfig().TONIC_CONTRACT_ID);
  return _tonic;
}
