import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './components/PublicLayout';
import { NotFoundPage } from './pages/NotFoundPage';
import { AboutPage } from './pages/public/AboutPage';
import { BlogPage } from './pages/public/BlogPage';
import { ContactPage } from './pages/public/ContactPage';
import { CustomerLoginPage } from './pages/public/CustomerLoginPage';
import { HomePage } from './pages/public/HomePage';
import { ProfileSettingsPage } from './pages/public/ProfileSettingsPage';
import { ServicesPage } from './pages/public/ServicesPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/inquiry" element={<ServicesPage />} />
        <Route path="/inquiry/confirmation" element={<ServicesPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/settings" element={<ProfileSettingsPage />} />
      </Route>

      <Route path="/login" element={<CustomerLoginPage />} />
      <Route path="/admin/*" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
