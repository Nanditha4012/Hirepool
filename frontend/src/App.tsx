import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/lib/authStore'
import { ThemeProvider } from '@/lib/themeStore'
import { APP_NAME } from '@/lib/config'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import ProtectedRoute from '@/components/ProtectedRoute'
import SessionTimeout from '@/components/SessionTimeout'
import BottomNav from '@/components/layout/BottomNav'

import LandingPage from '@/pages/LandingPage'
import SignupPage from '@/pages/SignupPage'
import LoginPage from '@/pages/LoginPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import VerifierLoginPage from '@/pages/VerifierLoginPage'
import VerifierSignupPage from '@/pages/VerifierSignupPage'
import AdminLoginPage from '@/pages/AdminLoginPage'
import CategoryPage from '@/pages/onboarding/CategoryPage'
import TotpPage from '@/pages/onboarding/TotpPage'
import CandidateEntryPoint from '@/pages/candidate/CandidateEntryPoint'
import ProfileBuilderPage from '@/pages/candidate/ProfileBuilderPage'
import CandidateMessagesPage from '@/pages/candidate/MessagesPage'
import CandidatePaymentHistoryPage from '@/pages/candidate/PaymentHistoryPage'
import CompanyEntryPoint from '@/pages/company/CompanyEntryPoint'
import CompanyDashboardPage from '@/pages/company/DashboardPage'
import CompanySetupPage from '@/pages/company/CompanySetupPage'
import SearchPage from '@/pages/company/SearchPage'
import UnlockedCandidatesPage from '@/pages/company/UnlockedCandidatesPage'
import MessagesPage from '@/pages/company/MessagesPage'
import CompanyPaymentHistoryPage from '@/pages/company/PaymentHistoryPage'
import VerifierLayout from '@/pages/verifier/VerifierLayout'
import QueuePage from '@/pages/verifier/QueuePage'
import ProfileReviewPage from '@/pages/verifier/ProfileReviewPage'
import ProfilesManagementPage from '@/pages/verifier/ProfilesManagementPage'
import VerifierAccountPage from '@/pages/verifier/VerifierAccountPage'
import BadgeQueuePage from '@/pages/verifier/BadgeQueuePage'
import AchievementQueuePage from '@/pages/verifier/AchievementQueuePage'
import AnalyticsPage from '@/pages/verifier/AnalyticsPage'
import AdminLayout from '@/pages/admin/AdminLayout'
import AdminDashboardPage from '@/pages/admin/DashboardPage'
import AdminCandidatesPage from '@/pages/admin/CandidatesPage'
import AdminCandidateDetailPage from '@/pages/admin/CandidateDetailPage'
import AdminCompaniesPage from '@/pages/admin/CompaniesPage'
import AdminCompanyDetailPage from '@/pages/admin/CompanyDetailPage'
import AdminVerifiersPage from '@/pages/admin/VerifiersPage'
import AdminCompanyRequestsPage from '@/pages/admin/CompanyRequestsPage'
import AdminMasterDataPage from '@/pages/admin/MasterDataPage'
import AdminSiteSettingsPage from '@/pages/admin/SiteSettingsPage'
import AdminAnnouncementsPage from '@/pages/admin/AnnouncementsPage'
import AdminAuditLogPage from '@/pages/admin/AuditLogPage'
import AdminPaymentsPage from '@/pages/admin/AdminPaymentsPage'
import FeedPage from '@/pages/feed/FeedPage'
import CreatePostPage from '@/pages/feed/CreatePostPage'
import CommunityPage from '@/pages/community/CommunityPage'
import CommunityDetailPage from '@/pages/community/CommunityDetailPage'
import ContestHubPage from '@/pages/contests/ContestHubPage'
import ContestTypeRedirect from '@/pages/contests/ContestTypeRedirect'
import TestRunnerPage from '@/pages/contests/TestRunnerPage'
import TestResultPage from '@/pages/contests/TestResultPage'
import ContestLeaderboardPage from '@/pages/contests/LeaderboardPage'
import AdminContestsPage from '@/pages/admin/ContestsPage'
import PrivacyPolicyPage from '@/pages/PrivacyPolicyPage'
import TermsOfServicePage from '@/pages/TermsOfServicePage'
import NotFoundPage from '@/pages/NotFoundPage'

function AppShell() {
  useEffect(() => {
    document.title = APP_NAME
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      {/* Inside BrowserRouter (it navigates to /login on expiry) and inside
          AuthProvider; self-disables when nobody is signed in. */}
      <SessionTimeout />
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verifier/login" element={<VerifierLoginPage />} />
          <Route path="/verifier/signup" element={<VerifierSignupPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />

          <Route
            path="/onboarding/category"
            element={
              <ProtectedRoute allow={['candidate']}>
                <CategoryPage />
              </ProtectedRoute>
            }
          />
          <Route path="/onboarding/2fa" element={<TotpPage />} />

          <Route
            path="/candidate"
            element={
              <ProtectedRoute allow={['candidate']}>
                <CandidateEntryPoint />
              </ProtectedRoute>
            }
          />
          <Route
            path="/candidate/edit"
            element={
              <ProtectedRoute allow={['candidate']}>
                <ProfileBuilderPage />
              </ProtectedRoute>
            }
          />
          {/* The target of every "new message" notification — see the
              backend's companyMessageController. Verification-gated: a
              company can only message a candidate it found in search, and
              only approved candidates are searchable. */}
          <Route
            path="/candidate/messages"
            element={
              <ProtectedRoute allow={['candidate']} requireVerified>
                <CandidateMessagesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/candidate/payments"
            element={
              <ProtectedRoute allow={['candidate']}>
                <CandidatePaymentHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/company"
            element={
              <ProtectedRoute allow={['company']}>
                <CompanyEntryPoint />
              </ProtectedRoute>
            }
          />
          {/* The dashboard has its own path now that `/company` redirects a
              verified company straight to the candidate portal. */}
          <Route
            path="/company/dashboard"
            element={
              <ProtectedRoute allow={['company']} requireVerified>
                <CompanyDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/company/setup"
            element={
              <ProtectedRoute allow={['company']}>
                <CompanySetupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/company/search"
            element={
              <ProtectedRoute allow={['company']} requireVerified>
                <SearchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/company/unlocked"
            element={
              <ProtectedRoute allow={['company']} requireVerified>
                <UnlockedCandidatesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/company/messages"
            element={
              <ProtectedRoute allow={['company']} requireVerified>
                <MessagesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/company/payments"
            element={
              <ProtectedRoute allow={['company']}>
                <CompanyPaymentHistoryPage />
              </ProtectedRoute>
            }
          />
          {/* Walk-in Pedia, Job Book and Communities.
              Open to every signed-in role rather than gated per role: it is a
              shared noticeboard, and a company needs to post its own drives
              and see what is being said about it just as much as a candidate
              needs to read them. Verifiers and admins get read access for
              moderation. `requireVerified` is the orthogonal gate — a
              candidate or company still in review (or rejected) sees only its
              own submission until that clears; verifiers and admins are never
              locked by it. The literal '/feed/new' precedes nothing that could
              swallow it, but is declared first regardless — the ordering
              discipline used throughout this file. */}
          <Route
            path="/feed/new"
            element={
              <ProtectedRoute allow={['candidate', 'company', 'verifier', 'admin']} requireVerified>
                <CreatePostPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/feed"
            element={
              <ProtectedRoute allow={['candidate', 'company', 'verifier', 'admin']} requireVerified>
                <FeedPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/community"
            element={
              <ProtectedRoute allow={['candidate', 'company', 'verifier', 'admin']} requireVerified>
                <CommunityPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/community/:slug"
            element={
              <ProtectedRoute allow={['candidate', 'company', 'verifier', 'admin']} requireVerified>
                <CommunityDetailPage />
              </ProtectedRoute>
            }
          />

          {/* Contests — candidate-only, and only once verified: a contest
              score is published on the profile as proof, so it has to be
              earned by a live account.

              '/contests' is one tabbed screen (DSA / Domain / Quant), the
              same shape as the Walk-in Pedia + Job Book pairing at '/feed' —
              the tab lives in the query string, not the path. '/contests/:type'
              is kept only to bounce old links and bookmarks onto the matching
              tab, and is declared last so it cannot swallow the literal paths
              above it. */}
          <Route
            path="/contests"
            element={
              <ProtectedRoute allow={['candidate']} requireVerified>
                <ContestHubPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contests/leaderboard"
            element={
              <ProtectedRoute allow={['candidate']} requireVerified>
                <ContestLeaderboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contests/attempt/:attemptId"
            element={
              <ProtectedRoute allow={['candidate']} requireVerified>
                <TestRunnerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contests/result/:attemptId"
            element={
              <ProtectedRoute allow={['candidate']} requireVerified>
                <TestResultPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contests/:type"
            element={
              <ProtectedRoute allow={['candidate']} requireVerified>
                <ContestTypeRedirect />
              </ProtectedRoute>
            }
          />

          <Route
            path="/verify"
            element={
              <ProtectedRoute allow={['verifier']}>
                <VerifierLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<QueuePage />} />
            <Route path="queue" element={<QueuePage />} />
            {/* The literal /profiles list must precede /profiles/:id so the
                param route can't swallow it. */}
            <Route path="profiles" element={<ProfilesManagementPage />} />
            <Route path="profiles/:id" element={<ProfileReviewPage />} />
            <Route path="badges" element={<BadgeQueuePage />} />
            <Route path="achievements" element={<AchievementQueuePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="account" element={<VerifierAccountPage />} />
          </Route>
          <Route
            path="/admin"
            element={
              <ProtectedRoute allow={['admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            {/* The literal /candidates list must precede /candidates/:id so
                the param route can't swallow it — same ordering discipline
                as /verify's profiles routes below. */}
            <Route path="candidates" element={<AdminCandidatesPage />} />
            <Route path="candidates/:id" element={<AdminCandidateDetailPage />} />
            <Route path="companies" element={<AdminCompaniesPage />} />
            <Route path="companies/:id" element={<AdminCompanyDetailPage />} />
            <Route path="verifiers" element={<AdminVerifiersPage />} />
            <Route path="company-requests" element={<AdminCompanyRequestsPage />} />
            <Route path="masters" element={<AdminMasterDataPage />} />
            <Route path="settings" element={<AdminSiteSettingsPage />} />
            <Route path="announcements" element={<AdminAnnouncementsPage />} />
            <Route path="payments" element={<AdminPaymentsPage />} />
            <Route path="contests" element={<AdminContestsPage />} />
            <Route path="audit-log" element={<AdminAuditLogPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
      {/* Mobile bottom nav; self-disables for verifiers/admins and inside the
          full-screen test runner. Rendered after Footer (not just after
          Header) so its spacer reserves clearance at the true end of a page's
          content — placed earlier, the spacer only pushed the top of <main>
          down and left the fixed bar free to sit over the Footer. */}
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
