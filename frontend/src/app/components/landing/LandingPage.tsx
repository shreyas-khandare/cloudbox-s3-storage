import { useState } from "react";
import {
  Cloud, Shield, FolderOpen, ArrowRight, CheckCircle2,
  Upload, Download, Star, Menu, X,
  Lock, FileText, Image, Film, Music, Archive, ChevronRight
} from "lucide-react";
import type { Page } from "../../App";
import { useAuth } from "../../../context/AuthContext";

interface Props {
  navigate: (page: Page) => void;
}

const FEATURES = [
  {
    icon: Shield,
    title: "Private file access",
    desc: "Your files belong to your account. CloudBox generates time-limited links when you preview or download them.",
    color: "#3D38F5",
    bg: "#EEF0FF",
  },
  {
    icon: Upload,
    title: "Direct S3 uploads",
    desc: "Send files directly to Amazon S3 and follow the real transfer progress while each upload completes.",
    color: "#6C63FF",
    bg: "#F0EEFF",
  },
  {
    icon: FolderOpen,
    title: "Practical file management",
    desc: "Search, sort, preview, download, and delete files from one focused dashboard.",
    color: "#4F46E5",
    bg: "#EEF0FF",
  },
  {
    icon: Lock,
    title: "Protected account access",
    desc: "Create an account with verified email or sign in with Google. Your files are isolated to your account.",
    color: "#7C3AED",
    bg: "#F3EEFF",
  },
];

const FLOATING_FILES = [
  { icon: FileText, name: "Q4 Report.pdf", size: "2.4 MB", color: "#EF4444", delay: "0s", x: "-80px", y: "-40px" },
  { icon: Image, name: "brand-assets.zip", size: "18 MB", color: "#3D38F5", delay: "1.5s", x: "220px", y: "20px" },
  { icon: Film, name: "intro-video.mp4", size: "142 MB", color: "#8B5CF6", delay: "2.8s", x: "-40px", y: "160px" },
  { icon: Music, name: "soundtrack.mp3", size: "8.1 MB", color: "#10B981", delay: "0.8s", x: "200px", y: "180px" },
];

const STATS = [
  { value: "1 GB", label: "Free Storage" },
  { value: "100 MB", label: "Free File Limit" },
  { value: "S3", label: "Direct Uploads" },
  { value: "2", label: "Devices on Free" },
];

export function LandingPage({ navigate }: Props) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen hero-bg cloudbox-font-body overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-white/30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate("landing")} className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl accent-gradient flex items-center justify-center shadow-lg shadow-[#3D38F5]/30">
              <Cloud className="w-4 h-4 text-white" />
            </div>
            <span className="cloudbox-font-display" style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1A1A2E" }}>
              CloudBox
            </span>
          </button>

          <div className="hidden md:flex items-center gap-8">
            {["Features", "Plans"].map((item) => item === "Features" ? (
              <a key={item} href="#features" className="text-sm font-medium text-[#6B6B8A] hover:text-[#1A1A2E] transition-colors">{item}</a>
            ) : (
              <button key={item} onClick={() => navigate("plans")} className="text-sm font-medium text-[#6B6B8A] hover:text-[#1A1A2E] transition-colors">{item}</button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate(user ? "dashboard" : "login")}
              className="px-4 py-2 text-sm font-medium text-[#3D38F5] hover:bg-[#EEF0FF] rounded-xl transition-all">
              {user ? "Dashboard" : "Login"}
            </button>
            <button onClick={() => navigate(user ? "plans" : "register")}
              className="px-5 py-2 text-sm font-medium text-white rounded-xl transition-all hover:opacity-90 hover:shadow-lg hover:shadow-[#3D38F5]/30 accent-gradient">
              {user ? "View Plans" : "Get Started"}
            </button>
          </div>

          <button className="md:hidden p-2 rounded-lg hover:bg-[#EEF0FF] transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden px-6 pb-4 flex flex-col gap-3 border-t border-white/30 pt-4">
            {["Features", "Plans"].map((item) => item === "Features" ? (
              <a key={item} href="#features" onClick={() => setMobileOpen(false)} className="text-sm font-medium text-[#6B6B8A] hover:text-[#1A1A2E] transition-colors">{item}</a>
            ) : (
              <button key={item} onClick={() => { setMobileOpen(false); navigate("plans"); }} className="text-left text-sm font-medium text-[#6B6B8A] hover:text-[#1A1A2E] transition-colors">{item}</button>
            ))}
            <div className="flex gap-3 mt-2">
              <button onClick={() => navigate(user ? "dashboard" : "login")}
                className="flex-1 py-2 text-sm font-medium text-[#3D38F5] border border-[#3D38F5]/30 rounded-xl transition-all hover:bg-[#EEF0FF]">
                {user ? "Dashboard" : "Login"}
              </button>
              <button onClick={() => navigate(user ? "plans" : "register")}
                className="flex-1 py-2 text-sm font-medium text-white rounded-xl accent-gradient">
                {user ? "View Plans" : "Get Started"}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div className="animate-slide-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
              style={{ background: "#EEF0FF", color: "#3D38F5", border: "1px solid rgba(61,56,245,0.2)" }}>
              <Star className="w-3 h-3" fill="currentColor" />
              Cloud storage, without the clutter
            </div>

            <h1 className="cloudbox-font-display mb-6 leading-tight"
              style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)", fontWeight: 800, color: "#1A1A2E", lineHeight: 1.15 }}>
              Secure Cloud Storage{" "}
              <span className="gradient-text">Built For Your</span>{" "}
              Digital World
            </h1>

            <p className="mb-8 max-w-lg" style={{ fontSize: "1.0625rem", color: "#6B6B8A", lineHeight: 1.75 }}>
              A straightforward place to upload, find, preview, download, and manage your files.
              Start with 1 GB of free storage, then choose a paid plan when you need more room.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <button onClick={() => navigate(user ? "dashboard" : "register")}
                className="flex items-center gap-2 px-6 py-3 text-white rounded-xl font-semibold text-sm accent-gradient shadow-lg shadow-[#3D38F5]/30 hover:opacity-90 transition-all hover:-translate-y-0.5">
                {user ? "Open Dashboard" : "Start Free Today"}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigate("plans")}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm border-2 border-[#3D38F5]/20 text-[#3D38F5] hover:border-[#3D38F5]/40 hover:bg-[#EEF0FF] transition-all">
                Compare Plans
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-4">
              {["No credit card needed", "1 GB free forever", "Cancel anytime"].map((item) => (
                <div key={item} className="flex items-center gap-1.5 text-xs font-medium text-[#6B6B8A]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#3D38F5]" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Right - Dashboard Mockup */}
          <div className="relative flex justify-center items-center min-h-[480px] hidden lg:flex">
            {/* Main mockup card */}
            <div className="relative w-full max-w-md">
              <div className="rounded-2xl shadow-2xl shadow-[#3D38F5]/20 overflow-hidden border border-white/60"
                style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(20px)" }}>
                {/* Mockup topbar */}
                <div className="px-4 py-3 border-b border-[#F0F0FF] flex items-center gap-3"
                  style={{ background: "#2C2C2C" }}>
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  </div>
                  <div className="flex-1 mx-3 h-5 rounded-md flex items-center px-2"
                    style={{ background: "rgba(255,255,255,0.1)", fontSize: "9px", color: "rgba(255,255,255,0.4)" }}>
                    app.cloudstorageplatform
                  </div>
                </div>

                <div className="flex" style={{ minHeight: "320px" }}>
                  {/* Sidebar */}
                  <div className="w-14 flex flex-col items-center py-4 gap-3" style={{ background: "#2C2C2C" }}>
                    <div className="w-7 h-7 rounded-lg accent-gradient flex items-center justify-center mb-2">
                      <Cloud className="w-3.5 h-3.5 text-white" />
                    </div>
                    {[FolderOpen, Upload, Download, Shield].map((Icon, i) => (
                      <div key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${i === 0 ? "bg-[#3D38F5]" : "hover:bg-[#3A3A4A]"}`}>
                        <Icon className="w-3.5 h-3.5" style={{ color: i === 0 ? "#fff" : "rgba(255,255,255,0.4)" }} />
                      </div>
                    ))}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 p-3" style={{ background: "#F8F8FF" }}>
                    {/* Storage bar */}
                    <div className="rounded-xl p-3 mb-3 border border-[#EEF0FF]" style={{ background: "#fff" }}>
                      <div className="flex justify-between items-center mb-2">
                        <span style={{ fontSize: "9px", fontWeight: 600, color: "#1A1A2E" }}>Storage</span>
                        <span style={{ fontSize: "8px", color: "#6B6B8A" }}>350MB / 1GB</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: "#EEF0FF" }}>
                        <div className="h-full rounded-full accent-gradient" style={{ width: "35%" }} />
                      </div>
                    </div>

                    {/* File grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { icon: FileText, name: "Report.pdf", color: "#EF4444" },
                        { icon: Image, name: "Photo.jpg", color: "#3D38F5" },
                        { icon: Archive, name: "Assets.zip", color: "#F59E0B" },
                        { icon: Film, name: "Video.mp4", color: "#8B5CF6" },
                        { icon: Music, name: "Audio.mp3", color: "#10B981" },
                        { icon: FileText, name: "Notes.doc", color: "#6B7280" },
                      ].map((file, i) => (
                        <div key={i} className="rounded-lg p-2 text-center border border-[#EEF0FF] hover:border-[#3D38F5]/30 transition-colors cursor-pointer"
                          style={{ background: "#fff" }}>
                          <div className="w-6 h-6 rounded-md flex items-center justify-center mx-auto mb-1"
                            style={{ background: file.color + "15" }}>
                            <file.icon className="w-3 h-3" style={{ color: file.color }} />
                          </div>
                          <p style={{ fontSize: "7px", color: "#6B6B8A", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                            {file.name}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Glow */}
              <div className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ boxShadow: "0 0 80px rgba(61,56,245,0.15)", zIndex: -1 }} />
            </div>

            {/* Floating file cards */}
            {FLOATING_FILES.map((file, i) => (
              <div key={i}
                className={`absolute glass-card rounded-2xl p-3 flex items-center gap-3 shadow-lg pointer-events-none ${i % 2 === 0 ? "animate-float" : "animate-float-delayed"}`}
                style={{
                  animationDelay: file.delay,

                  left:
                    i === 0
                      ? "-20px"
                      : i === 1
                        ? "calc(100% - 140px)"
                        : i === 2
                          ? "-30px"
                          : "calc(100% - 130px)",

                  top:
                    i === 0
                      ? "30px"
                      : i === 1
                        ? "80px"
                        : i === 2
                          ? "calc(100% - 100px)"
                          : "calc(100% - 80px)",

                  minWidth: "140px",

                  zIndex: 10,
                }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: file.color + "20" }}>
                  <file.icon className="w-4 h-4" style={{ color: file.color }} />
                </div>
                <div>
                  <p style={{ fontSize: "11px", fontWeight: 600, color: "#1A1A2E", lineHeight: 1.3 }}>{file.name}</p>
                  <p style={{ fontSize: "9px", color: "#6B6B8A" }}>{file.size}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-12 border-y border-[#3D38F5]/08">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="cloudbox-font-display gradient-text mb-1" style={{ fontSize: "1.875rem", fontWeight: 800 }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "#6B6B8A", fontWeight: 500 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: "#EEF0FF", color: "#3D38F5" }}>
            Why CloudBox
          </div>
          <h2 className="cloudbox-font-display mb-4" style={{ fontSize: "clamp(1.875rem, 4vw, 2.5rem)", fontWeight: 800, color: "#1A1A2E" }}>
            Everything you need to{" "}
            <span className="gradient-text">manage your files</span>
          </h2>
          <p className="max-w-xl mx-auto" style={{ fontSize: "1rem", color: "#6B6B8A", lineHeight: 1.75 }}>
            Built for individuals who want a clear, reliable way to keep their files organized and accessible.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feat) => (
            <div key={feat.title}
              className="group p-6 rounded-2xl border border-transparent hover:border-[#3D38F5]/15 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#3D38F5]/08 cursor-default"
              style={{ background: "#fff" }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110"
                style={{ background: feat.bg }}>
                <feat.icon className="w-6 h-6" style={{ color: feat.color }} />
              </div>
              <h3 className="cloudbox-font-display mb-3" style={{ fontSize: "1rem", fontWeight: 700, color: "#1A1A2E" }}>
                {feat.title}
              </h3>
              <p style={{ fontSize: "0.875rem", color: "#6B6B8A", lineHeight: 1.7 }}>{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing overview */}
      <section id="pricing" className="py-24 px-6" style={{ background: "linear-gradient(135deg, #1A1A2E 0%, #2C2C2C 100%)" }}>
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold mb-4" style={{ background: "rgba(61,56,245,0.2)", color: "#A7A3FF" }}>
            Flexible storage
          </div>
          <h2 className="cloudbox-font-display mb-4" style={{ fontSize: "clamp(1.875rem, 4vw, 2.5rem)", fontWeight: 800, color: "#fff" }}>
            Start free. Upgrade when you need more space.
          </h2>
          <p className="mx-auto mb-9 max-w-2xl" style={{ fontSize: "1rem", color: "#B0B0C8", lineHeight: 1.75 }}>
            Compare the actual storage quotas, per-file limits, device limits, and monthly prices on the dedicated plans page.
          </p>
          <div className="mb-9 grid gap-3 text-left sm:grid-cols-3">
            {[
              { name: "Free", storage: "1 GB", price: "₹0" },
              { name: "Pro", storage: "100 GB", price: "₹149 / month" },
              { name: "Business", storage: "1 TB", price: "₹399 / month" },
            ].map((plan) => (
              <div key={plan.name} className="rounded-2xl border p-5" style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" }}>
                <p className="text-sm font-semibold text-white">{plan.name}</p>
                <p className="cloudbox-font-display mt-2 text-2xl font-bold text-white">{plan.storage}</p>
                <p className="mt-1 text-xs" style={{ color: "#B0B0C8" }}>{plan.price}</p>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("plans")} className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold text-white accent-gradient">
            Compare all plans <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-12 rounded-3xl border border-[#3D38F5]/15 relative overflow-hidden"
            style={{ background: "#fff" }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 60% 60% at 50% 100%, rgba(61,56,245,0.08) 0%, transparent 70%)" }} />
            <Cloud className="w-14 h-14 mx-auto mb-6 p-3 rounded-2xl text-white accent-gradient" style={{ padding: "12px" }} />
            <h2 className="cloudbox-font-display mb-4" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", fontWeight: 800, color: "#1A1A2E" }}>
              Ready to secure your digital life?
            </h2>
            <p className="mb-8" style={{ fontSize: "1rem", color: "#6B6B8A", lineHeight: 1.75 }}>
              Securely store, organize, and access your files from anywhere.
              Get started with 1 GB of free storage no credit card required.
            </p>
            <button onClick={() => navigate(user ? "dashboard" : "register")}
              className="inline-flex items-center gap-2 px-8 py-3.5 text-white rounded-xl font-semibold text-sm accent-gradient shadow-lg shadow-[#3D38F5]/30 hover:opacity-90 transition-all hover:-translate-y-0.5">
              {user ? "Open Dashboard" : "Create Free Account"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: "#1A1A2E" }} className="pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl accent-gradient flex items-center justify-center">
                  <Cloud className="w-4 h-4 text-white" />
                </div>
                <span className="cloudbox-font-display" style={{ fontSize: "1.125rem", fontWeight: 700, color: "#fff" }}>CloudBox</span>
              </div>
              <p className="mb-5" style={{ fontSize: "0.875rem", color: "#6B6B8A", lineHeight: 1.7, maxWidth: "240px" }}>
                A straightforward place to keep personal files organized and easy to access.
              </p>
              <div className="flex gap-3">
                {["in"].map((item, i) => (
                  <a
                    key={i}
                    href="https://www.linkedin.com/in/shreyas-khandare-7b6413322/"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[#3D38F5]/20"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <span
                      style={{
                        color: "#9090A8",
                        fontSize: "12px",
                        fontWeight: 700
                      }}
                    >
                      {item}
                    </span>
                  </a>
                ))}
              </div>
            </div>

            {[
              { title: "Product", links: ["Features", "Plans"] },
              { title: "Account", links: ["Login", "Create account"] },
            ].map((col) => (
              <div key={col.title}>
                <p className="mb-4" style={{ fontSize: "0.75rem", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {col.title}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href={link === "Features" ? "#features" : link === "Plans" ? "/plans" : link === "Login" ? "/login" : "/register"} style={{ fontSize: "0.875rem", color: "#6B6B8A" }}
                        className="hover:text-white transition-colors">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t pt-8 flex flex-col sm:flex-row justify-between items-center gap-4"
            style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <p style={{ fontSize: "0.8125rem", color: "#6B6B8A" }}>
              © 2026 CloudBox.
            </p>
            {/* <div className="flex gap-6">
              {["Privacy Policy", "Terms of Service", "Cookie Policy"].map((item) => (
                <a key={item} href="#" style={{ fontSize: "0.8125rem", color: "#6B6B8A" }}
                  className="hover:text-white transition-colors">{item}</a>
              ))}
            </div> */}
          </div>
        </div>
      </footer>
    </div>
  );
}
