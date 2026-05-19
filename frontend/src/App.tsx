import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/layouts/ProtectedRoute';
import AdminRoute from './components/layouts/AdminRoute';
import DashboardLayout from './components/layouts/DashboardLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Categories from './pages/Categories';
import NoteForm from './pages/NoteForm';
import Receipts from './pages/Receipts';
import AuditTrail from './pages/AuditTrail';
import Reports from './pages/Reports';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes wrapped with DashboardLayout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/receipts/new" element={<NoteForm />} />
            <Route path="/receipts/:id/edit" element={<NoteForm />} />
            <Route path="/reports" element={<Reports />} />

            {/* Admin Only Routes */}
            <Route element={<AdminRoute />}>
              <Route path="/users" element={<Users />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/audit" element={<AuditTrail />} />
            </Route>
          </Route>
        </Route>
        
        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
