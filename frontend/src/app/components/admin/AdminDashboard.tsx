import { useEffect, useState } from "react";

import { Cloud, Users, Files, HardDrive, Search, LogOut, Bell, ChevronDown, FolderOpen, BarChart3 } from "lucide-react";
import type { Page } from "../../App";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";


interface Props {
  navigate: (page: Page) => void;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  storageUsed: string;
  createdAt: string;
  _count: {
    files: number;
  };
}


interface AdminFile {
  id: string;
  name: string;
  size: string;
  createdAt: string;
  user: {
    name: string;
    email: string;
  };
}


interface AdminStats {
  totalUsers: number;
  totalFiles: number;
  storageUsed: string;
}

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  ADMIN: {
    color: "#3D38F5",
    bg: "#EEF0FF"
  },
  USER: {
    color: "#6B7280",
    bg: "#F3F4F6"
  }
};

export function AdminDashboard({ navigate }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeNav, setActiveNav] = useState("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [files, setFiles] = useState<AdminFile[]>([]);
  const { user } = useAuth();
  useEffect(() => {
    fetchAdminData();
  }, []);



  const fetchAdminData = async () => {
    try {
      const statsRes =
        await api.get(
          "/admin/stats"
        );
      const usersRes =
        await api.get(
          "/admin/users"
        );
      const filesRes =
        await api.get(
          "/admin/files"
        );
      setStats(
        statsRes.data
      );
      setUsers(
        usersRes.data.users
      );
      setFiles(
        filesRes.data.files
      );
    } catch (error) {
      console.log(
        error
      );
    }
  };

  const filtered = users.filter((u) => {
    const matchSearch = (u.name || "").toLowerCase().includes(search.toLowerCase())
      ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role.toLowerCase() === roleFilter.toLowerCase();
    return matchSearch && matchRole;
  });

  const ADMIN_STATS = [

    {
      label: "Total Users",
      value: stats?.totalUsers || 0,
      icon: Users,
      color: "#3D38F5",
      bg: "#EEF0FF"
    },

    {
      label: "Total Files",
      value: stats?.totalFiles || 0,
      icon: Files,
      color: "#8B5CF6",
      bg: "#F5F3FF"
    },

    {
      label: "Storage Used",
      value:
        `${(
          Number(stats?.storageUsed || 0)
          /
          1024 /
          1024
        ).toFixed(2)} MB`,
      icon: HardDrive,
      color: "#F59E0B",
      bg: "#FFFBEB"
    }

  ];

  return (
    <div className="flex h-screen overflow-hidden cloudbox-font-body" style={{ background: "#F4F4FF" }}>
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 flex-shrink-0" style={{ background: "#2C2C2C" }}>
        <div className="flex items-center gap-2.5 px-5 h-16 border-b flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <button onClick={() => navigate("landing")} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg accent-gradient flex items-center justify-center">
              <Cloud className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="cloudbox-font-display" style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>CloudBox</span>
          </button>
        </div>

        <div className="px-3 py-3 border-b flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="px-3 py-1.5 rounded-lg" style={{ background: "rgba(61,56,245,0.15)", border: "1px solid rgba(61,56,245,0.3)" }}>
            <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#8B87FF", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Admin Panel
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {[
            { id: "overview", label: "Overview", icon: BarChart3 },
            { id: "users", label: "Users", icon: Users },
            { id: "files", label: "All Files", icon: FolderOpen },
          ].map((item) => (
            <button key={item.id} onClick={() => setActiveNav(item.id)}
              className={`sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left ${activeNav === item.id ? "active" : ""}`}>
              <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: activeNav === item.id ? "#fff" : "rgba(255,255,255,0.5)" }} />
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: activeNav === item.id ? "#fff" : "rgba(255,255,255,0.7)" }}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 px-4 py-3.5 border-t flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #EF4444, #EC4899)" }}>
            {user?.name
              ?.charAt(0)
              .toUpperCase()
              || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#fff",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {user?.name || "Admin"}
            </p>
            <p
              style={{
                fontSize: "0.6875rem",
                color: "rgba(255,255,255,0.4)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {user?.email}
            </p>
          </div>
          <button onClick={() => navigate("landing")} className="p-1 rounded-lg hover:bg-[#3A3A4A] transition-colors">
            <LogOut className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-4 px-6 h-16 border-b flex-shrink-0"
          style={{ background: "#fff", borderColor: "#E8E8F0" }}>
          <div>
            <h1 className="cloudbox-font-display" style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1A1A2E" }}>Admin Dashboard</h1>
            <p style={{ fontSize: "0.75rem", color: "#9090A8" }}>June 19, 2026</p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => navigate("dashboard")}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-[#6B6B8A] hover:bg-[#EEF0FF] hover:text-[#3D38F5] transition-all">
              User View
            </button>
            <button className="relative p-2 rounded-xl hover:bg-[#EEF0FF] transition-colors">
              <Bell className="w-5 h-5 text-[#6B6B8A]" />
              <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EF4444]" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E8E8F0]"
              style={{ background: "#F9F9FF" }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: "linear-gradient(135deg, #EF4444, #EC4899)" }}>
                SA
              </div>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1A1A2E" }}>Super Admin</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#9090A8]" />
            </div>
          </div>
        </header>


        <main className="flex-1 overflow-y-auto p-6">

          {activeNav === "files" && (
            <div
              className="rounded-2xl border border-[#E8E8F0] overflow-hidden"
              style={{
                background: "#fff"
              }}
            >
              <div
                className="px-6 py-4 border-b"
                style={{
                  borderColor: "#F0F0FF"
                }}
              >
                <h2
                  className="cloudbox-font-display"
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700
                  }}
                >
                  All Files
                </h2>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "#9090A8"
                  }}
                >
                  {files.length} files
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left">
                        File
                      </th>
                      <th className="px-4 py-3 text-left">
                        Owner
                      </th>
                      <th className="px-4 py-3 text-left">
                        Size
                      </th>
                      <th className="px-4 py-3 text-left">
                        Uploaded
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr
                        key={file.id}
                        className="border-t"
                      >
                        <td className="px-6 py-4">
                          {file.name}
                        </td>
                        <td className="px-4 py-4">
                          {file.user.email}
                        </td>
                        <td className="px-4 py-4">
                          {(
                            Number(file.size)
                            /
                            1024
                            /
                            1024
                          ).toFixed(2)} MB
                        </td>
                        <td className="px-4 py-4">
                          {
                            new Date(
                              file.createdAt
                            ).toLocaleDateString()
                          }
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stats grid */}
          {activeNav === "overview" && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {ADMIN_STATS.map((stat) => (
                <div key={stat.label} className="p-5 rounded-2xl border border-[#E8E8F0] hover:border-[#3D38F5]/20 hover:shadow-lg hover:shadow-[#3D38F5]/05 transition-all"
                  style={{ background: "#fff" }}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: stat.bg }}>
                      <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                    </div>
                  </div>
                  <p className="cloudbox-font-display mb-0.5" style={{ fontSize: "1.625rem", fontWeight: 800, color: "#1A1A2E" }}>
                    {stat.value}
                  </p>
                  <p style={{ fontSize: "0.8125rem", color: "#9090A8" }}>{stat.label}</p>
                </div>
              ))}
            </div>
          )}


          {/* User management */}
          {activeNav === "users" && (
            <div className="rounded-2xl border border-[#E8E8F0] overflow-hidden" style={{ background: "#fff" }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4 border-b" style={{ borderColor: "#F0F0FF" }}>
                <div>
                  <h2 className="cloudbox-font-display" style={{ fontSize: "1rem", fontWeight: 700, color: "#1A1A2E" }}>User Management</h2>
                  <p style={{ fontSize: "0.8125rem", color: "#9090A8" }}>{filtered.length} of {users.length} users</p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9090A8]" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search users…"
                      className="pl-8 pr-4 py-2 rounded-xl border-2 border-transparent outline-none transition-all"
                      style={{ background: "#F4F4FF", fontSize: "0.8125rem", color: "#1A1A2E", minWidth: "180px" }}
                      onFocus={(e) => (e.target.style.borderColor = "#3D38F5")}
                      onBlur={(e) => (e.target.style.borderColor = "transparent")}
                    />
                  </div>

                  <div className="relative">
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-[#E8E8F0] outline-none cursor-pointer hover:border-[#3D38F5]/30 transition-colors"
                      style={{ background: "#fff", fontSize: "0.8125rem", color: "#1A1A2E" }}>
                      <option value="all">All Roles</option>
                      <option value="ADMIN">Admin</option>
                      <option value="USER">User</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9090A8] pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F0F0FF" }}>
                      <th className="px-6 py-3 text-left" style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#9090A8", textTransform: "uppercase", letterSpacing: "0.06em" }}>User</th>
                      <th className="px-4 py-3 text-left hidden md:table-cell" style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#9090A8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Email</th>
                      <th className="px-4 py-3 text-left" style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#9090A8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Role</th>
                      <th className="px-4 py-3 text-left hidden lg:table-cell" style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#9090A8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Storage</th>
                      <th className="px-4 py-3 text-left hidden xl:table-cell" style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#9090A8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((user) => {
                      const role = ROLE_COLORS[user.role] || ROLE_COLORS.USER;
                      return (
                        <tr key={user.id} className="group border-t hover:bg-[#FAFAFF] transition-colors"
                          style={{ borderColor: "#F0F0FF" }}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{
                                  background: "#3D38F5"
                                }}
                              >

                                {user.name
                                  ?.charAt(0)
                                  .toUpperCase()
                                }

                              </div>
                              <div>
                                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1A1A2E" }}>{user.name}</p>
                                <p className="md:hidden" style={{ fontSize: "0.75rem", color: "#9090A8" }}>{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 hidden md:table-cell" style={{ fontSize: "0.875rem", color: "#6B6B8A" }}>
                            {user.email}
                          </td>
                          <td className="px-4 py-4">
                            <span className="px-2.5 py-1 rounded-full" style={{ fontSize: "0.75rem", fontWeight: 600, color: role.color, background: role.bg }}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-4 hidden lg:table-cell">

                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "#6B6B8A"
                              }}
                            >

                              {(
                                Number(user.storageUsed)
                                /
                                1024 /
                                1024
                              ).toFixed(2)} MB

                            </span>

                          </td>
                          <td className="px-4 py-4 hidden xl:table-cell" style={{ fontSize: "0.875rem", color: "#6B6B8A" }}>
                            {new Date(
                              user.createdAt
                            ).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filtered.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Users className="w-10 h-10 text-[#D4D4F0] mb-3" />
                    <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#1A1A2E", marginBottom: "4px" }}>No users found</p>
                    <p style={{ fontSize: "0.875rem", color: "#9090A8" }}>Try adjusting your search or filter</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
