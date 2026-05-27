export enum Verdict {
  UP = "UP",
  DOWN = "DOWN",
  NEUTRAL = "NEUTRAL"
}

export interface AnalysisResult {
  verdict: Verdict;
  reason: string;
  confidence: number;
  analysisId: string;
}

export interface UserProfile {
  username: string;
  avatarUrl: string;
  isActivated: boolean;
  isTwoFactorEnabled?: boolean;
  twoFactorPin?: string;
}

export interface PaymentRequest {
  id: string;
  senderNumber: string;
  trxId: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}
