import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { DonateProvider } from './context/DonateContext';
import { AuthProvider } from './context/AuthContext';
import DashboardPage from './features/dashboard/DashboardPage';
import FundOurTeamPage from './features/fund/FundOurTeamPage';
import CaseTrackerPage from './features/tracker/CaseTrackerPage';
import AdminFeedbackPage from './features/admin/AdminFeedbackPage';
import StaffIncidentsPage from './features/staff/StaffIncidentsPage';
import StaffOverviewPage from './features/staff/StaffOverviewPage';
import StaffIncidentQueuePage from './features/staff/StaffIncidentQueuePage';
import MondayIncidentDetailPage from './features/staff/MondayIncidentDetailPage';
import DonorImpactPage from './features/donor/DonorImpactPage';
import PaymentResultPage from './components/PaymentResultPage';
import SignUpPage from './features/auth/SignUpPage';
import LoginPage from './features/auth/LoginPage';
import AccountPage from './features/auth/AccountPage';
import PremiumPage from './features/premium/PremiumPage';
import OpenCallPage from './features/account/OpenCallPage';
import IncidentDetailPage from './features/account/IncidentDetailPage';
import JoinIncidentPage from './features/account/JoinIncidentPage';
// import LeaderboardPage from './features/leaderboard/LeaderboardPage';

// Lazy: this page alone pulls in three.js + react-globe.gl (~46MB of source,
// the entire cause of the "chunk larger than 500kB" build warning) — nobody
// should download that just to see the dashboard, only people who visit /map.
const TacticalGlobe = lazy(() => import('./features/map/TacticalGlobe'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
    <DonateProvider>
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/"              element={<DashboardPage />} />
        <Route path="/map" element={
          <Suspense fallback={
            <div style={{
              width: '100dvw', height: '100dvh', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-void)', color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.05em',
            }}>
              Loading map…
            </div>
          }>
            <div style={{ width: '100dvw', height: '100dvh' }}><TacticalGlobe /></div>
          </Suspense>
        } />
        <Route path="/fund-our-team" element={<FundOurTeamPage />} />
        <Route path="/track/:caseId"   element={<CaseTrackerPage />} />
        <Route path="/admin/feedback"  element={<AdminFeedbackPage />} />
        <Route path="/staff/incidents" element={<StaffIncidentsPage />} />
        <Route path="/staff/overview"  element={<StaffOverviewPage />} />
        <Route path="/staff/requests" element={<StaffIncidentQueuePage status="New Request by User" title="New Requests Awaiting Approval" triage />} />
        <Route path="/staff/in-progress" element={<StaffIncidentQueuePage status="Working on it" title="In Progress" />} />
        <Route path="/staff/monday/:mondayItemId" element={<MondayIncidentDetailPage />} />
        <Route path="/my-impact/:token" element={<DonorImpactPage />} />
        <Route path="/donate/thanks"    element={<PaymentResultPage variant="thanks" kind="donation" />} />
        <Route path="/donate/failed"    element={<PaymentResultPage variant="failed" kind="donation" />} />
        <Route path="/premium"          element={<PremiumPage />} />
        <Route path="/premium/thanks"   element={<PaymentResultPage variant="thanks" kind="premium" />} />
        <Route path="/premium/failed"   element={<PaymentResultPage variant="failed" kind="premium" />} />
        <Route path="/signup"           element={<SignUpPage />} />
        <Route path="/login"            element={<LoginPage />} />
        <Route path="/account"          element={<AccountPage />} />
        <Route path="/account/open-call" element={<OpenCallPage />} />
        <Route path="/incidents/:id"         element={<IncidentDetailPage />} />
        <Route path="/join/:token"           element={<JoinIncidentPage />} />
        {/* <Route path="/leaderboard"      element={<LeaderboardPage />} /> */}
      </Routes>
    </BrowserRouter>
    </DonateProvider>
    </AuthProvider>
  );
}
