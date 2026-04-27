import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { OverviewPage } from "@/pages/Overview";
import { ChatIntakePage } from "@/pages/ChatIntake";
import { InboxPage } from "@/pages/Inbox";
import { QueuePage } from "@/pages/Queue";
import { PostalQueuePage } from "@/pages/PostalQueue";
import { DriversPage } from "@/pages/Drivers";
import { RetailProvider } from "@/state/retailStore";
import {
  getCanonicalPath,
  getPageFromPath,
  getPathForPage,
  type PageKey,
} from "@/lib/routes";

export default function App() {
  const [page, setPage] = useState<PageKey>(() =>
    getPageFromPath(window.location.pathname)
  );

  useEffect(() => {
    const syncPageWithLocation = () => {
      const nextPage = getPageFromPath(window.location.pathname);
      const canonicalPath = getCanonicalPath(window.location.pathname);

      if (window.location.pathname !== canonicalPath) {
        window.history.replaceState(window.history.state, "", canonicalPath);
      }

      setPage(nextPage);
    };

    syncPageWithLocation();
    window.addEventListener("popstate", syncPageWithLocation);

    return () => window.removeEventListener("popstate", syncPageWithLocation);
  }, []);

  const navigateToPage = (nextPage: PageKey) => {
    const nextPath = getPathForPage(nextPage);

    if (window.location.pathname !== nextPath) {
      window.history.pushState({ page: nextPage }, "", nextPath);
    }

    setPage(nextPage);
  };

  return (
    <RetailProvider>
      <AppShell page={page} onChangePage={navigateToPage}>
        {page === "overview" && <OverviewPage />}
        {page === "chat" && <ChatIntakePage onOpenInbox={() => navigateToPage("inbox")} />}
        {page === "inbox" && <InboxPage />}
        {page === "queue" && <QueuePage />}
        {page === "postal" && <PostalQueuePage />}
        {page === "drivers" && <DriversPage />}
      </AppShell>
    </RetailProvider>
  );
}
