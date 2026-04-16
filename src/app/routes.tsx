import { createBrowserRouter } from "react-router";
import { DashboardLayout } from "./components/DashboardLayout";
import { Dashboard } from "./components/Dashboard";
import { LiveMessages } from "./components/LiveMessages";
import { LeadInbox } from "./components/LeadInbox";
import { LeadDetail } from "./components/LeadDetail";
import { Accounts } from "./components/Accounts";
import { Rules } from "./components/Rules";
import { LiveSessions } from "./components/LiveSessions";
import { Settings } from "./components/Settings";
import { SessionReport } from "./components/SessionReport";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: DashboardLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "live-sessions", Component: LiveSessions },
      { path: "live-sessions/:id", Component: SessionReport },
      { path: "messages", Component: LiveMessages },
      { path: "leads", Component: LeadInbox },
      { path: "leads/:id", Component: LeadDetail },
      { path: "accounts", Component: Accounts },
      { path: "rules", Component: Rules },
      { path: "settings", Component: Settings },
    ],
  },
]);
