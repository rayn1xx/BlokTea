export type FeedItem = {
  id: string;
  type: 'program' | 'product_update' | 'application_event' | 'industry' | 'tip';
  title: string;
  body: string;
  published_at: string;
  tags: string[];
  relevance_reason: string;
  cta: { label: string; route: string } | null;
};
