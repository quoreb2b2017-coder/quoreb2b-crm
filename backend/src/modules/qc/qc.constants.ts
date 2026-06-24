export const QC_CAMPAIGN_CHANNELS = ['voip', 'gps', 'email', 'other'] as const;
export type QcCampaignChannel = (typeof QC_CAMPAIGN_CHANNELS)[number];

export const QC_ENTRY_STATES = ['pending', 'merged', 'rejected'] as const;
export type QcEntryState = (typeof QC_ENTRY_STATES)[number];

export const QC_DECISIONS = ['qualified', 'tbd', 'disqualified'] as const;
export type QcDecision = (typeof QC_DECISIONS)[number];

export const QC_DECISION_LABELS: Record<QcDecision, string> = {
  qualified: 'Qualified',
  tbd: 'TBD',
  disqualified: 'Disqualified',
};

export const QC_CHANNEL_LABELS: Record<QcCampaignChannel, string> = {
  voip: 'VOIP',
  gps: 'GPS',
  email: 'Email',
  other: 'Other',
};
