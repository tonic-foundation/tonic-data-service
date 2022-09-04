export interface Reward {
  // these fields have an audit purpose but don't need to show up in the
  // frontend
  // max_price_multiplier: number;
  // eligible_bp_distance: number;
  // time_divisor: number;

  account_id: string;
  reward: number;
  reward_date: Date;
  paid_in_tx_id: string | null;
}
