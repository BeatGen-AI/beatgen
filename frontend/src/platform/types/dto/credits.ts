/* tslint:disable */
/* eslint-disable */
/**
/* This file was automatically generated from pydantic models by running pydantic2ts.
/* Do not modify it by hand - just update the pydantic models and then re-run the script
*/

export type CreditTransactionType =
  | "monthly_allocation"
  | "rollover"
  | "usage"
  | "purchase"
  | "refund"
  | "subscription_upgrade"
  | "subscription_cancellation"
  | "admin_adjustment";

/**
 * Audit log of all credit transactions
 */
export interface CreditTransaction {
  id?: string;
  user_id: string;
  user_credits_id: string;
  transaction_type: CreditTransactionType;
  amount: number;
  balance_after: number;
  description?: string | null;
  model_provider?: string | null;
  model_name?: string | null;
  request_tokens?: number | null;
  response_tokens?: number | null;
  total_tokens?: number | null;
  request_id?: string | null;
  generation_type?: string | null;
  prompt_preview?: string | null;
  transaction_metadata?: {
    [k: string]: unknown;
  };
  created_at?: string;
}
export interface SQLModel {}
/**
 * Tracks user's current credit balance and monthly allocation
 */
export interface UserCredits {
  id?: string;
  user_id: string;
  balance?: number;
  monthly_allocation?: number;
  last_allocation_date?: string;
  total_allocated?: number;
  total_used?: number;
  subscription_tier?: string | null;
  has_rollover?: boolean;
  created_at?: string;
  updated_at?: string;
}
