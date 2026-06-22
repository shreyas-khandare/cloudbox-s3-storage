import { useState } from "react";
import { Cloud, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import type { Page } from "../../App";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";

interface Props {
  navigate: (page: Page) => void;
}

export function LoginPage({ navigate }: Props) {
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (
    e: React.FormEvent
  ) => {

    e.preventDefault();

    setError("");

    if (!email || !password) {

      setError(
        "Please fill in all fields."
      );

      return;

    }

    try {

      setLoading(true);

      const res =
        await api.post(
          "/auth/login",
          {
            email,
            password
          }
        );


      setUser(
        res.data.user
      );


      navigate(
        "dashboard"
      );

    } catch (err: any) {

      setError(
        err?.response?.data?.message ||
        "Invalid email or password"
      );

    } finally {

      setLoading(false);

    }

  };

  return (
    <div className="min-h-screen flex cloudbox-font-body" style={{ background: "#F4F4FF" }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #1A1A2E 0%, #2C2C2C 60%, #1E1A4E 100%)" }}>
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute rounded-full"
            style={{ width: "400px", height: "400px", background: "radial-gradient(circle, rgba(61,56,245,0.25) 0%, transparent 70%)", top: "-100px", right: "-100px" }} />
          <div className="absolute rounded-full"
            style={{ width: "300px", height: "300px", background: "radial-gradient(circle, rgba(61,56,245,0.15) 0%, transparent 70%)", bottom: "100px", left: "-80px" }} />
          {/* Grid pattern */}
          <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10">
          <button onClick={() => navigate("landing")} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl accent-gradient flex items-center justify-center shadow-lg shadow-[#3D38F5]/40">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <span className="cloudbox-font-display" style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>CloudBox</span>
          </button>
        </div>

        <div className="relative z-10">
          <blockquote className="mb-8">
            <p className="cloudbox-font-display mb-4" style={{ fontSize: "1.75rem", fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
              "CloudBox has completely transformed how our team manages files. Fast, secure, and incredibly reliable."
            </p>
            <footer className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ background: "linear-gradient(135deg, #3D38F5, #6C63FF)" }}>
                SJ
              </div>
              <div>
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#fff" }}>Sarah Johnson</p>
                <p style={{ fontSize: "0.75rem", color: "#9090A8" }}>CTO at Axiom Labs</p>
              </div>
            </footer>
          </blockquote>

          <div className="flex gap-6">
            {[["500K+", "Users"], ["99.99%", "Uptime"], ["2PB+", "Stored"]].map(([val, label]) => (
              <div key={label}>
                <p className="cloudbox-font-display" style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>{val}</p>
                <p style={{ fontSize: "0.75rem", color: "#6B6B8A" }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <button onClick={() => navigate("landing")} className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl accent-gradient flex items-center justify-center">
            <Cloud className="w-4 h-4 text-white" />
          </div>
          <span className="cloudbox-font-display" style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1A1A2E" }}>CloudBox</span>
        </button>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="cloudbox-font-display mb-2" style={{ fontSize: "1.875rem", fontWeight: 800, color: "#1A1A2E" }}>
              Welcome back
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#6B6B8A" }}>
              Sign in to your CloudBox account
            </p>
          </div>

          {/* Google button */}
          <button className="w-full flex items-center justify-center gap-3 py-3 mb-6 rounded-xl border-2 border-[#E8E8F0] hover:border-[#3D38F5]/30 hover:bg-[#EEF0FF] transition-all"
            style={{ background: "#fff" }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span style={{ fontSize: "0.9375rem", fontWeight: 500, color: "#1A1A2E" }}>Continue with Google</span>
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px" style={{ background: "#E8E8F0" }} />
            <span style={{ fontSize: "0.8125rem", color: "#9090A8" }}>or continue with email</span>
            <div className="flex-1 h-px" style={{ background: "#E8E8F0" }} />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4"
              style={{ background: "#FEE2E2", border: "1px solid #FECACA" }}>
              <AlertCircle className="w-4 h-4 text-[#EF4444] flex-shrink-0" />
              <span style={{ fontSize: "0.875rem", color: "#B91C1C" }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block mb-1.5" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1A1A2E" }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border-2 outline-none transition-all"
                style={{
                  background: "#F0F0FF",
                  border: "2px solid transparent",
                  fontSize: "0.9375rem",
                  color: "#1A1A2E",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3D38F5")}
                onBlur={(e) => (e.target.style.borderColor = "transparent")}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1A1A2E" }}>Password</label>
                <a href="#" style={{ fontSize: "0.8125rem", color: "#3D38F5", fontWeight: 500 }}
                  className="hover:underline">Forgot password?</a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 pr-12 rounded-xl border-2 outline-none transition-all"
                  style={{
                    background: "#F0F0FF",
                    border: "2px solid transparent",
                    fontSize: "0.9375rem",
                    color: "#1A1A2E",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#3D38F5")}
                  onBlur={(e) => (e.target.style.borderColor = "transparent")}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-[#EEF0FF] transition-colors">
                  {showPassword
                    ? <EyeOff className="w-4 h-4 text-[#6B6B8A]" />
                    : <Eye className="w-4 h-4 text-[#6B6B8A]" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90 hover:shadow-lg hover:shadow-[#3D38F5]/30 disabled:opacity-60 accent-gradient">
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center mt-6" style={{ fontSize: "0.875rem", color: "#6B6B8A" }}>
            Don't have an account?{" "}
            <button onClick={() => navigate("register")}
              className="font-semibold hover:underline" style={{ color: "#3D38F5" }}>
              Create account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
