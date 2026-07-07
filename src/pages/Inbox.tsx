import InboxFeaturePage, { InboxPage as InboxFeatureInboxPage } from '../features/inbox/Inbox';

export function InboxPage({
  onOpenQueue,
  onOpenPlanning,
}: {
  onOpenQueue?: (search?: string) => void;
  onOpenPlanning?: (search?: string) => void;
}) {
  return <InboxFeatureInboxPage onOpenQueue={onOpenQueue} onOpenPlanning={onOpenPlanning} />;
}

export default function InboxPageRoute() {
  return <InboxFeaturePage />;
}
