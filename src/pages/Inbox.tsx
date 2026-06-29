import InboxFeaturePage, { InboxPage as InboxFeatureInboxPage } from '../features/inbox/Inbox';

export function InboxPage({ onOpenQueue }: { onOpenQueue?: (search?: string) => void }) {
  return <InboxFeatureInboxPage onOpenQueue={onOpenQueue} />;
}

export default function InboxPageRoute() {
  return <InboxFeaturePage />;
}
