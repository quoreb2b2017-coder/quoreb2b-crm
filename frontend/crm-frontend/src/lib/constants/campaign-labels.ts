/** User-facing product name (API routes stay `/batches`). */
export const CAMPAIGN_SINGULAR = 'Campaign';
export const CAMPAIGN_PLURAL = 'All campaigns';
export const MY_CAMPAIGN_PLURAL = 'My campaign';

export function defaultCampaignName(date = new Date()): string {
  return `${CAMPAIGN_SINGULAR} ${date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}
