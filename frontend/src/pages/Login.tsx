import { useState } from 'react';
import { useForm as useHookForm } from 'react-hook-form';
import { zodResolver } from '../lib/zodResolver';
import * as z from 'zod/v4';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import { Mail, Lock, Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useHookForm<LoginFormValues>({
    resolver: zodResolver<LoginFormValues>(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      setIsLoading(true);
      setError('');
      const response = await api.post('/auth/login', data);
      
      const { token, user } = response.data.data;
      setAuth(token, user);
      
      // Navigate to dashboard
      navigate('/');
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const error = err as any;
      setError(error.response?.data?.message || 'Failed to login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#eef2f6] min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background styling equivalent */}
      <div className="absolute inset-0 z-0 opacity-50" style={{
        backgroundImage: `
          radial-gradient(circle at 10% 20%, rgba(255,255,255,0.6) 0%, transparent 40%),
          radial-gradient(circle at 90% 80%, rgba(255,255,255,0.6) 0%, transparent 40%),
          radial-gradient(circle at 80% 10%, rgba(226,232,240,0.5) 0%, transparent 50%),
          radial-gradient(circle at 20% 90%, rgba(226,232,240,0.5) 0%, transparent 50%)
        `
      }} />

      <main className="w-full max-w-lg relative z-10">
        <div className="bg-white rounded-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] p-8 md:p-12 border border-transparent">
          {/* Logo Section */}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-4">
              <div className="inline-flex items-center justify-center">
                <img src="/Logo-Intek-RED.png" alt="Intek Logo" className="h-12 object-contain" />
              </div>
            </div>
            <h1 className="text-[32px] font-bold text-gray-800 mt-3">Welcome Back</h1>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm text-center">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email Input Group */}
            <div>
              <label className="block text-sm font-semibold text-[#334155] mb-1.5" htmlFor="email">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input 
                  {...register('email')}
                  type="email"
                  className={`block w-full pl-11 pr-4 py-2.5 bg-white border ${errors.email ? 'border-red-500' : 'border-gray-300'} rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                  placeholder="your.email@company.com" 
                />
              </div>
              {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>}
            </div>

            {/* Password Input Group */}
            <div>
              <label className="block text-sm font-semibold text-[#334155] mb-1.5" htmlFor="password">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input 
                  {...register('password')}
                  type="password"
                  className={`block w-full pl-11 pr-4 py-2.5 bg-white border ${errors.password ? 'border-red-500' : 'border-gray-300'} rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors`}
                  placeholder="********" 
                />
              </div>
              {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>}
            </div>

            {/* Options: Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input id="remember-me" type="checkbox" className="h-4 w-4 text-[#1e40af] focus:ring-[#1e40af] border-gray-300 rounded" />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">Remember me</label>
              </div>
              <div className="text-sm">
                <a href="#" className="font-semibold text-[#1e40af] hover:text-blue-500 transition-colors">Forgot Password?</a>
              </div>
            </div>

            {/* Sign In Button */}
            <div>
              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-semibold text-white bg-[#1e40af] hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Don't have an account? <a href="#" className="text-gray-600 hover:underline">Contact your administrator.</a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
