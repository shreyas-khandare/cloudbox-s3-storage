import { useState } from "react";
import { Cloud, Eye, EyeOff, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import type { Page } from "../../App";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import { GoogleLogin } from "@react-oauth/google";

interface Props {
  navigate: (page: Page) => void;
}

export function RegisterPage({ navigate }: Props) {
  const { setUser } = useAuth();
  const { googleLogin } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const strength = password.length === 0 ? 0
    : password.length < 6 ? 1
      : password.length < 10 ? 2
        : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4 : 3;

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColor = ["", "#EF4444", "#F59E0B", "#10B981", "#059669"];

  const handleSubmit = async (
    e: React.FormEvent
  ) => {

    e.preventDefault();

    setError("");


    if (!name || !email || !password) {

      setError(
        "Please fill in all fields."
      );

      return;

    }


    try {

      setLoading(true);


      const res = await api.post(
        "/auth/register",
        {
          name,
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


    } catch (error) {


      setError(
        "Registration failed"
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
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute rounded-full"
            style={{ width: "500px", height: "500px", background: "radial-gradient(circle, rgba(61,56,245,0.2) 0%, transparent 70%)", top: "-150px", left: "-100px" }} />
          <div className="absolute rounded-full"
            style={{ width: "350px", height: "350px", background: "radial-gradient(circle, rgba(108,99,255,0.15) 0%, transparent 70%)", bottom: "0px", right: "0px" }} />
          <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid2)" />
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
          <h2 className="cloudbox-font-display mb-8" style={{ fontSize: "2rem", fontWeight: 800, color: "#fff", lineHeight: 1.3 }}>
            Everything you need to store your digital world
          </h2>

          <div className="space-y-5">
            {[
              { title: "1 GB Free Storage", desc: "Start immediately, no credit card needed" },
              { title: "AES-256 Encryption", desc: "Files encrypted at rest with Amazon S3" },
              { title: "Access Anywhere", desc: "Web, desktop, and mobile apps available" },
              { title: "Simple File Management", desc: "Upload, organize and access your files anytime" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(61,56,245,0.2)" }}>
                  <CheckCircle2 className="w-4 h-4 text-[#8B87FF]" />
                </div>
                <div>
                  <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#fff" }}>{item.title}</p>
                  <p style={{ fontSize: "0.8125rem", color: "#6B6B8A" }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <button onClick={() => navigate("landing")} className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl accent-gradient flex items-center justify-center">
            <Cloud className="w-4 h-4 text-white" />
          </div>
          <span className="cloudbox-font-display" style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1A1A2E" }}>CloudBox</span>
        </button>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="cloudbox-font-display mb-2" style={{ fontSize: "1.875rem", fontWeight: 800, color: "#1A1A2E" }}>
              Create your account
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#6B6B8A" }}>
              Start with 1 GB free  no credit card required
            </p>
          </div>

          <GoogleLogin
            onSuccess={async (credentialResponse) => {
              try {
                if (!credentialResponse.credential) return;

                const user = await googleLogin(
                  credentialResponse.credential
                );

                if (user.role === "ADMIN") {
                  navigate("admin");
                } else {
                  navigate("dashboard");
                }
              } catch {
                setError("Google registration failed");
              }
            }}
            onError={() => {
              setError("Google registration failed");
            }}
          />

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px" style={{ background: "#E8E8F0" }} />
            <span style={{ fontSize: "0.8125rem", color: "#9090A8" }}>or sign up with email</span>
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
              <label className="block mb-1.5" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1A1A2E" }}>Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Johnson"
                className="w-full px-4 py-3 rounded-xl border-2 outline-none transition-all"
                style={{ background: "#F0F0FF", border: "2px solid transparent", fontSize: "0.9375rem", color: "#1A1A2E" }}
                onFocus={(e) => (e.target.style.borderColor = "#3D38F5")}
                onBlur={(e) => (e.target.style.borderColor = "transparent")}
              />
            </div>

            <div>
              <label className="block mb-1.5" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1A1A2E" }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border-2 outline-none transition-all"
                style={{ background: "#F0F0FF", border: "2px solid transparent", fontSize: "0.9375rem", color: "#1A1A2E" }}
                onFocus={(e) => (e.target.style.borderColor = "#3D38F5")}
                onBlur={(e) => (e.target.style.borderColor = "transparent")}
              />
            </div>

            <div>
              <label className="block mb-1.5" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1A1A2E" }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full px-4 py-3 pr-12 rounded-xl border-2 outline-none transition-all"
                  style={{ background: "#F0F0FF", border: "2px solid transparent", fontSize: "0.9375rem", color: "#1A1A2E" }}
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

              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div key={level} className="flex-1 h-1 rounded-full transition-all"
                        style={{ background: strength >= level ? strengthColor[strength] : "#E8E8F0" }} />
                    ))}
                  </div>
                  <p style={{ fontSize: "0.75rem", color: strengthColor[strength] }}>
                    {strengthLabel[strength]} password
                  </p>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90 hover:shadow-lg hover:shadow-[#3D38F5]/30 disabled:opacity-60 accent-gradient">
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <>Create Account <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center mt-6" style={{ fontSize: "0.875rem", color: "#6B6B8A" }}>
            Already have an account?{" "}
            <button onClick={() => navigate("login")}
              className="font-semibold hover:underline" style={{ color: "#3D38F5" }}>
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
