import { useState } from "react";
import {
  Cloud, Zap, Shield, FolderOpen, ArrowRight, CheckCircle2,
  Upload, Download, Star, Menu, X,
  Lock, FileText, Image, Film, Music, Archive, ChevronRight
} from "lucide-react";
import type { Page } from "../../App";

interface Props {
  navigate: (page: Page) => void;
}

const FEATURES = [
  {
    icon: Shield,
    title: "Secure Private Storage",
    desc: "Military-grade AES-256 encryption ensures your files stay completely private. Zero-knowledge architecture means even we can't see your data.",
    color: "#3D38F5",
    bg: "#EEF0FF",
  },
  {
    icon: Zap,
    title: "Lightning Fast Uploads",
    desc: "Multi-threaded upload engine delivers blazing speeds up to 1 Gbps. Chunked transfers resume automatically after any interruption.",
    color: "#6C63FF",
    bg: "#F0EEFF",
  },
  {
    icon: Lock,
    title: "Encrypted Access",
    desc: "Two-factor authentication, SSO support, and granular permission controls keep every access point secured and auditable.",
    color: "#4F46E5",
    bg: "#EEF0FF",
  },
  {
    icon: FolderOpen,
    title: "Smart File Management",
    desc: "AI-powered organization, instant full-text search across all files, version history, and smart tags that adapt to your workflow.",
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
  { value: "500K+", label: "Active Users" },
  { value: "2PB+", label: "Data Stored" },
  { value: "99.99%", label: "Uptime SLA" },
  { value: "150ms", label: "Avg Latency" },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    storage: "1 GB",
    features: ["1 GB secure storage", "File sharing links", "Basic encryption", "Web & mobile access", "5 file versions"],
    accent: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/month",
    storage: "100 GB",
    features: ["100 GB secure storage", "Advanced sharing controls", "AES-256 encryption", "All platforms + API", "Unlimited versions", "Priority support"],
    accent: true,
  },
  {
    name: "Business",
    price: "$29",
    period: "/month",
    storage: "2 TB",
    features: ["2 TB secure storage", "Team collaboration", "Admin controls", "SSO + SAML", "Audit logs", "Dedicated support", "Custom branding"],
    accent: false,
  },
];

export function LandingPage({ navigate }: Props) {
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
            {["Features", "Pricing", "About"].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`}
                className="text-sm font-medium text-[#6B6B8A] hover:text-[#1A1A2E] transition-colors cursor-pointer">
                {item}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate("login")}
              className="px-4 py-2 text-sm font-medium text-[#3D38F5] hover:bg-[#EEF0FF] rounded-xl transition-all">
              Login
            </button>
            <button onClick={() => navigate("register")}
              className="px-5 py-2 text-sm font-medium text-white rounded-xl transition-all hover:opacity-90 hover:shadow-lg hover:shadow-[#3D38F5]/30 accent-gradient">
              Get Started
            </button>
          </div>

          <button className="md:hidden p-2 rounded-lg hover:bg-[#EEF0FF] transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden px-6 pb-4 flex flex-col gap-3 border-t border-white/30 pt-4">
            {["Features", "Pricing", "About"].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`}
                className="text-sm font-medium text-[#6B6B8A] hover:text-[#1A1A2E] transition-colors"
                onClick={() => setMobileOpen(false)}>
                {item}
              </a>
            ))}
            <div className="flex gap-3 mt-2">
              <button onClick={() => navigate("login")}
                className="flex-1 py-2 text-sm font-medium text-[#3D38F5] border border-[#3D38F5]/30 rounded-xl transition-all hover:bg-[#EEF0FF]">
                Login
              </button>
              <button onClick={() => navigate("register")}
                className="flex-1 py-2 text-sm font-medium text-white rounded-xl accent-gradient">
                Get Started
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
              Trusted by 50+ users worldwide
            </div>

            <h1 className="cloudbox-font-display mb-6 leading-tight"
              style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)", fontWeight: 800, color: "#1A1A2E", lineHeight: 1.15 }}>
              Secure Cloud Storage{" "}
              <span className="gradient-text">Built For Your</span>{" "}
              Digital World
            </h1>

            <p className="mb-8 max-w-lg" style={{ fontSize: "1.0625rem", color: "#6B6B8A", lineHeight: 1.75 }}>
              Fast, private file storage powered by enterprise-grade cloud infrastructure.
              Protect what matters most with zero-knowledge encryption and instant global access.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <button onClick={() => navigate("register")}
                className="flex items-center gap-2 px-6 py-3 text-white rounded-xl font-semibold text-sm accent-gradient shadow-lg shadow-[#3D38F5]/30 hover:opacity-90 transition-all hover:-translate-y-0.5">
                Start Free Today
                <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigate("dashboard")}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm border-2 border-[#3D38F5]/20 text-[#3D38F5] hover:border-[#3D38F5]/40 hover:bg-[#EEF0FF] transition-all">
                View Dashboard
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
                    app.Storeme.io/dashboard
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
            Everything you need to store,{" "}
            <span className="gradient-text">share, and sync</span>
          </h2>
          <p className="max-w-xl mx-auto" style={{ fontSize: "1rem", color: "#6B6B8A", lineHeight: 1.75 }}>
            Built for individuals and teams who demand privacy, speed, and reliability from their cloud storage.
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

      {/* Storage / Pricing Section */}
      <section id="pricing" className="py-24 px-6" style={{ background: "linear-gradient(135deg, #1A1A2E 0%, #2C2C2C 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
              style={{ background: "rgba(61,56,245,0.2)", color: "#8B87FF" }}>
              Simple Pricing
            </div>
            <h2 className="cloudbox-font-display mb-4" style={{ fontSize: "clamp(1.875rem, 4vw, 2.5rem)", fontWeight: 800, color: "#fff" }}>
              Start free. Scale as you grow.
            </h2>
            <p style={{ fontSize: "1rem", color: "#9090A8", lineHeight: 1.75 }}>
              No hidden fees. No surprise bills. Just transparent, fair pricing.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.name}
                className={`relative p-7 rounded-2xl transition-transform hover:-translate-y-1 ${plan.accent ? "accent-gradient shadow-2xl shadow-[#3D38F5]/40" : ""}`}
                style={!plan.accent ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" } : {}}>
                {plan.accent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold"
                    style={{ background: "#fff", color: "#3D38F5" }}>
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <p className="mb-1" style={{ fontSize: "0.75rem", fontWeight: 600, color: plan.accent ? "rgba(255,255,255,0.7)" : "#9090A8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1">
                    <span className="cloudbox-font-display" style={{ fontSize: "2.5rem", fontWeight: 800, color: "#fff" }}>{plan.price}</span>
                    <span className="mb-2" style={{ fontSize: "0.875rem", color: plan.accent ? "rgba(255,255,255,0.6)" : "#9090A8" }}>{plan.period}</span>
                  </div>
                  <p style={{ fontSize: "0.875rem", color: plan.accent ? "rgba(255,255,255,0.8)" : "#9090A8" }}>
                    {plan.storage} storage
                  </p>
                </div>

                <ul className="space-y-3 mb-7">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: plan.accent ? "#fff" : "#3D38F5" }} />
                      <span style={{ fontSize: "0.875rem", color: plan.accent ? "rgba(255,255,255,0.9)" : "#B8B8D0" }}>{f}</span>
                    </li>
                  ))}
                </ul>

                <button onClick={() => navigate("register")}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                  style={{
                    background: plan.accent ? "#fff" : "rgba(61,56,245,0.2)",
                    color: plan.accent ? "#3D38F5" : "#8B87FF",
                    border: plan.accent ? "none" : "1px solid rgba(61,56,245,0.3)",
                  }}>
                  Get Started
                </button>
              </div>
            ))}
          </div>
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
              Join over 500,000 users who trust CloudBox with their most important files.
              Get 1 GB free — no credit card required.
            </p>
            <button onClick={() => navigate("register")}
              className="inline-flex items-center gap-2 px-8 py-3.5 text-white rounded-xl font-semibold text-sm accent-gradient shadow-lg shadow-[#3D38F5]/30 hover:opacity-90 transition-all hover:-translate-y-0.5">
              Create Free Account
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
                Enterprise-grade cloud storage for modern teams and individuals.
              </p>
              <div className="flex gap-3">
                {["X", "G", "in"].map((item, i) => (
                  <a
                    key={i}
                    href="#"
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
              { title: "Product", links: ["Features", "Security", "Integrations", "Changelog"] },
              { title: "Company", links: ["About", "Blog", "Careers", "Press"] },
              { title: "Support", links: ["Help Center", "Community", "Status", "Contact"] },
            ].map((col) => (
              <div key={col.title}>
                <p className="mb-4" style={{ fontSize: "0.75rem", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {col.title}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" style={{ fontSize: "0.875rem", color: "#6B6B8A" }}
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
              © 2026 CloudBox Inc. All rights reserved.
            </p>
            <div className="flex gap-6">
              {["Privacy Policy", "Terms of Service", "Cookie Policy"].map((item) => (
                <a key={item} href="#" style={{ fontSize: "0.8125rem", color: "#6B6B8A" }}
                  className="hover:text-white transition-colors">{item}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
