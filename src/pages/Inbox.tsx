import InboxFeaturePage, { InboxPage as InboxFeatureInboxPage } from '../features/inbox/Inbox';

export function InboxPage() {
  return <InboxFeatureInboxPage />;
}

export default function InboxPageRoute() {
  return <InboxFeaturePage />;
}
