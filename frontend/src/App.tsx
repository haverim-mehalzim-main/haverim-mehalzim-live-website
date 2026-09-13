import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { DonateProvider } from './context/DonateContext';
import { AuthProvider } from './context/AuthContext';
import DashboardPage from './features/dashboard/DashboardPage';
import TacticalGlobe from './features/map/TacticalGlobe';
import FundOurTeamPage from './features/fund/FundOurTeamPage';
import CaseTrackerPage from './features/tracker/CaseTrackerPage';
import AdminFeedbackPage from './features/admin/AdminFeedbackPage';
import DonorImpactPage from './features/donor/DonorImpactPage';
import DonateResultPage from './features/donate/DonateResultPage';
import SignUpPage from './features/auth/SignUpPage';
import LoginPage from './features/auth/LoginPage';
import AccountPage from './features/auth/AccountPage';
// import LeaderboardPage from './features/leaderboard/LeaderboardPage';

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
        <Route path="/map"           element={<div style={{ width: '100dvw', height: '100dvh' }}><TacticalGlobe /></div>} />
        <Route path="/fund-our-team" element={<FundOurTeamPage />} />
        <Route path="/track/:caseId"   element={<CaseTrackerPage />} />
        <Route path="/admin/feedback"  element={<AdminFeedbackPage />} />
        <Route path="/my-impact/:token" element={<DonorImpactPage />} />
        <Route path="/donate/thanks"    element={<DonateResultPage variant="thanks" />} />
        <Route path="/donate/failed"    element={<DonateResultPage variant="failed" />} />
        <Route path="/signup"           element={<SignUpPage />} />
        <Route path="/login"            element={<LoginPage />} />
        <Route path="/account"          element={<AccountPage />} />
        {/* <Route path="/leaderboard"      element={<LeaderboardPage />} /> */}
      </Routes>
    </BrowserRouter>
    </DonateProvider>
    </AuthProvider>
  );
}
