import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/lib/authStore'
import { ThemeProvider } from '@/lib/themeStore'
import { APP_NAME } from '@/lib/config'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import ProtectedRoute from '@/components/ProtectedRoute'

import LandingPage from '@/pages/LandingPage'
import SignupPage from '@/pages/SignupPage'
import LoginPage from '@/pages/LoginPage'
import VerifierLoginPage from '@/pages/VerifierLoginPage'
import AdminLoginPage from '@/pages/AdminLoginPage'
import CategoryPage from '@/pages/onboarding/CategoryPage'
import TotpPage from '@/pages/onboarding/TotpPage'
import CandidateEntryPoint from '@/pages/candidate/CandidateEntryPoint'
import ProfileBuilderPage from '@/pages/candidate/ProfileBuilderPage'
import CandidatePaymentHistoryPage from '@/pages/candidate/PaymentHistoryPage'
import CompanyEntryPoint from '@/pages/company/CompanyEntryPoint'
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
import NotFoundPage from '@/pages/NotFoundPage'

function AppShell() {
  useEffect(() => {
    document.title = APP_NAME
  }, [])

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verifier/login" element={<VerifierLoginPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />

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
              <ProtectedRoute allow={['company']}>
                <SearchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/company/unlocked"
            element={
              <ProtectedRoute allow={['company']}>
                <UnlockedCandidatesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/company/messages"
            element={
              <ProtectedRoute allow={['company']}>
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
            <Route path="audit-log" element={<AdminAuditLogPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
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
