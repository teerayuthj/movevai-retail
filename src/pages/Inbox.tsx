import InboxFeaturePage, { InboxPage as InboxFeatureInboxPage } from '../features/inbox/Inbox';

export function InboxPage({
  locationSearch,
  onOpenQueue,
  onOpenPlanning,
}: {
  locationSearch?: string;
  onOpenQueue?: (search?: string) => void;
  onOpenPlanning?: (search?: string) => void;
}) {
  return (
    <InboxFeatureInboxPage
      locationSearch={locationSearch}
      onOpenQueue={onOpenQueue}
      onOpenPlanning={onOpenPlanning}
    />
  );
}

export default function InboxPageRoute() {
  return <InboxFeaturePage />;
}
