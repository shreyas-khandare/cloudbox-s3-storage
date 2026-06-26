import {
  useState,
  useRef,
  useEffect
} from "react";
import { api } from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";
import {
  Cloud, FolderOpen, Clock, HardDrive, LogOut, Search,
  Upload, Bell, Grid3X3, List, Download, Trash2,
  FileText, Image, Film, Music, Archive, Plus,
  ChevronDown, Check, Folder, Share2, Eye
} from "lucide-react";
import type { Page } from "../../App";

interface Props {
  navigate: (page: Page) => void;
}

type CloudFile = {
  id: string;
  name: string;
  type: string;
  size: string;
  s3Key: string;
  createdAt: string;
};

const NAV_ITEMS = [
  { id: "files", label: "My Files", icon: FolderOpen },
  { id: "recent", label: "Recent Files", icon: Clock },
];

type FileType = "pdf" | "doc" | "image" | "video" | "audio" | "archive" | "folder";

const FILE_ICONS: Record<FileType | string, { icon: React.ElementType; color: string; bg: string }> = {
  pdf: { icon: FileText, color: "#EF4444", bg: "#FEF2F2" },
  doc: { icon: FileText, color: "#3B82F6", bg: "#EFF6FF" },
  image: { icon: Image, color: "#8B5CF6", bg: "#F5F3FF" },
  video: { icon: Film, color: "#F59E0B", bg: "#FFFBEB" },
  audio: { icon: Music, color: "#10B981", bg: "#ECFDF5" },
  archive: { icon: Archive, color: "#6B7280", bg: "#F9FAFB" },
  folder: { icon: Folder, color: "#3D38F5", bg: "#EEF0FF" },
};

export function UserDashboard({ navigate }: Props) {
  const { user, logout } = useAuth();
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [activeNav, setActiveNav] = useState("files");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; progress: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {

    fetchFiles();

  }, []);


  const fetchFiles = async () => {

    try {

      const res =
        await api.get(
          "/files"
        );


      setFiles(
        res.data.files
      );


    } catch (error) {

      console.log(
        error
      );

    }

  };

  const filteredFiles = files
    .filter((f) =>
      f.name
        .toLowerCase()
        .includes(
          search.toLowerCase()
        )
    )
    .sort((a, b) => {
      if (activeNav !== "recent")
        return 0;
      return (
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
      );
    });

  const uploadFile = async (
    file: File
  ) => {

    try {

      setUploadProgress({
        name: file.name,
        progress: 20
      });


      const urlRes =
        await api.post(
          "/files/upload-url",
          {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size
          }
        );


      setUploadProgress({
        name: file.name,
        progress: 50
      });


      await fetch(
        urlRes.data.uploadUrl,
        {
          method: "PUT",

          headers: {
            "Content-Type": file.type
          },

          body: file
        }
      );


      setUploadProgress({
        name: file.name,
        progress: 80
      });


      await api.post(
        "/files/save",
        {
          name: file.name,
          type: file.type,
          size: file.size,
          s3Key: urlRes.data.key
        }
      );


      await fetchFiles();


      setUploadProgress({
        name: file.name,
        progress: 100
      });


      setTimeout(
        () => setUploadProgress(null),
        800
      );


    } catch (error) {

      console.log(error);
      setUploadProgress(null);
      alert(
        "Upload failed"
      );

    }

  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      uploadFile(droppedFiles[0]);
    }
  };

  const handleFileInput = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      e.target.files?.[0];
    if (file) {
      uploadFile(
        file
      );
    }
    e.target.value = "";
  };

  const deleteFile = async (
    id: string
  ) => {

    try {

      await api.delete(
        `/files/${id}`
      );


      setFiles(
        prev =>
          prev.filter(
            f => f.id !== id
          )
      );


    } catch (error) {

      console.log(error);

      alert(
        "Delete failed"
      );

    }

  };

  const downloadFile = async (
    id: string
  ) => {

    try {

      const res =
        await api.get(
          `/files/${id}/download`
        );


      window.location.href =
        res.data.downloadUrl;


    } catch (error) {

      console.log(
        error
      );


      alert(
        "Download failed"
      );

    }

  };

  const previewFile = async (
    id: string
  ) => {

    try {

      const res =
        await api.get(
          `/files/${id}/preview`
        );


      window.open(
        res.data.previewUrl,
        "_blank"
      );


    } catch (error) {

      console.log(
        error
      );


      alert(
        "Preview failed"
      );

    }

  };

  const getFileCategory = (
    type: string
  ) => {

    if (type.includes("image"))
      return "image";

    if (type.includes("video"))
      return "video";

    if (type.includes("audio"))
      return "audio";

    if (type.includes("pdf"))
      return "pdf";

    if (
      type.includes("zip") ||
      type.includes("rar")
    )
      return "archive";


    return "doc";

  };

  const formatSize = (bytes: string) => {
    return (
      Number(bytes)
      /
      1024
      /
      1024
    ).toFixed(2)
      + " MB";
  };


  const usedBytes = Number(user?.storageUsed || 0) / (1024 * 1024);

  const totalBytes = Number(user?.storageLimit || 1073741824) / (1024 * 1024);

  const usedPct = Math.min((usedBytes / totalBytes) * 100, 100);

  return (
    <div className="flex h-screen overflow-hidden cloudbox-font-body" style={{ background: "#F4F4FF" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto flex flex-col w-64 flex-shrink-0 transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ background: "#2C2C2C" }}>

        <div className="flex items-center gap-2.5 px-5 h-16 border-b flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <button onClick={() => navigate("landing")} className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg accent-gradient flex items-center justify-center">
              <Cloud className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="cloudbox-font-display" style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>CloudBox</span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="mb-2 px-3">
            <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Storage
            </p>
          </div>

          {NAV_ITEMS.map((item) => (
            <button key={item.id} onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}
              className={`sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-left ${activeNav === item.id ? "active" : ""}`}>
              <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: activeNav === item.id ? "#fff" : "rgba(255,255,255,0.5)" }} />
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: activeNav === item.id ? "#fff" : "rgba(255,255,255,0.7)" }}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        {/* Storage usage */}
        <div className="mx-3 mb-3 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex justify-between items-center mb-2">
            <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "#fff" }}>Storage</p>
            <p style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.4)" }}>{usedBytes.toFixed(2)} MB / {(totalBytes / 1024).toFixed(2)} GB</p>
          </div>
          <div className="h-1.5 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.1)" }}>
            <div className="h-full rounded-full accent-gradient transition-all" style={{ width: `${usedPct}%` }} />
          </div>
          <button onClick={() => navigate("register")}
            className="w-full py-2 rounded-lg text-white text-xs font-semibold transition-opacity hover:opacity-80 accent-gradient">
            Upgrade to Pro
          </button>
        </div>

        {/* User profile */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-t flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 accent-gradient">
            {user?.name?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</p>
            <p style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</p>
          </div>
          <button onClick={async () => {

            await logout();

            navigate(
              "landing"
            );

          }} className="p-1 rounded-lg hover:bg-[#3A3A4A] transition-colors">
            <LogOut className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top navbar */}
        <header className="flex items-center gap-4 px-6 h-16 border-b flex-shrink-0"
          style={{ background: "#fff", borderColor: "#E8E8F0" }}>
          <button className="lg:hidden p-2 rounded-lg hover:bg-[#EEF0FF] transition-colors"
            onClick={() => setSidebarOpen(true)}>
            <Grid3X3 className="w-5 h-5 text-[#6B6B8A]" />
          </button>

          <div className="flex-1 max-w-lg relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9090A8]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files and folders…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-transparent outline-none transition-all"
              style={{ background: "#F4F4FF", fontSize: "0.875rem", color: "#1A1A2E" }}
              onFocus={(e) => (e.target.style.borderColor = "#3D38F5")}
              onBlur={(e) => (e.target.style.borderColor = "transparent")}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {user?.role === "ADMIN" && (
              <button
                onClick={() =>
                  navigate("admin")
                }

                className="
    px-4 py-2 
    rounded-xl 
    text-sm 
    font-semibold 
    bg-[#EEF0FF]
    text-[#3D38F5]
    hover:bg-[#E0E0FF]
    transition
  "
              >

                Admin

              </button>
            )}

            <button className="relative p-2 rounded-xl hover:bg-[#EEF0FF] transition-colors">
              <Bell className="w-5 h-5 text-[#6B6B8A]" />
              <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#3D38F5]" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold accent-gradient hover:opacity-90 shadow-md shadow-[#3D38F5]/20 transition-all">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload</span>
            </button>

            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold cursor-pointer accent-gradient">
              {user?.name?.charAt(0)}
            </div>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* Upload progress toast */}
          {uploadProgress && (
            <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-xl min-w-[280px]"
              style={{ background: "#fff", border: "1px solid #EEF0FF" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#3D38F5]" />
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1A1A2E" }}>
                    {uploadProgress.progress < 100 ? "Uploading…" : "Upload complete!"}
                  </span>
                </div>
                {uploadProgress.progress < 100
                  ? <span style={{ fontSize: "0.75rem", color: "#3D38F5", fontWeight: 600 }}>{Math.round(uploadProgress.progress)}%</span>
                  : <Check className="w-4 h-4 text-[#10B981]" />}
              </div>
              <p style={{ fontSize: "0.75rem", color: "#6B6B8A", marginBottom: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {uploadProgress.name}
              </p>
              <div className="h-1.5 rounded-full" style={{ background: "#F0F0FF" }}>
                <div className="h-full rounded-full accent-gradient transition-all duration-200"
                  style={{ width: `${uploadProgress.progress}%` }} />
              </div>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Files", value: String(files.length), icon: FolderOpen, color: "#3D38F5", bg: "#EEF0FF" },
              { label: "Storage Used", value: `${usedBytes.toFixed(2)} MB`, icon: HardDrive, color: "#8B5CF6", bg: "#F5F3FF" },
              { label: "Shared", value: "0", icon: Share2, color: "#10B981", bg: "#ECFDF5" },
            ].map((stat) => (
              <div key={stat.label} className="p-4 rounded-2xl border border-[#E8E8F0] hover:border-[#3D38F5]/20 transition-all"
                style={{ background: "#fff" }}>
                <div className="flex items-center justify-between mb-3">
                  <p style={{ fontSize: "0.75rem", fontWeight: 500, color: "#6B6B8A" }}>{stat.label}</p>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: stat.bg }}>
                    <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                  </div>
                </div>
                <p className="cloudbox-font-display" style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1A1A2E" }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Storage card */}
          <div className="p-5 rounded-2xl mb-6 border border-[#EEF0FF] relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #3D38F5 0%, #6C63FF 100%)" }}>
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
              style={{ background: "#fff", transform: "translate(30%, -30%)" }} />
            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "4px" }}>
                  Storage Usage
                </p>
                <p className="cloudbox-font-display" style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", marginBottom: "2px" }}>
                  {usedBytes.toFixed(2)} MB <span style={{ fontSize: "1rem", fontWeight: 500 }}>used of {(totalBytes / 1024).toFixed(2)} GB</span>
                </p>
                <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>
                  {((usedBytes / totalBytes) * 100).toFixed(0)}% of free tier used
                </p>
              </div>
              <div className="sm:w-48 flex-shrink-0">
                <div className="flex justify-between mb-1.5">
                  <span style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)" }}>0 MB</span>
                  <span style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.6)" }}>{(totalBytes / 1024).toFixed(0)} GB</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${usedPct}%` }} />
                </div>
                {/* <button onClick={() => navigate("register")}
                  className="mt-3 w-full py-2 rounded-xl text-xs font-semibold text-[#3D38F5] hover:opacity-90 transition-opacity"
                  style={{ background: "#fff" }}>
                  Upgrade to Pro — 100 GB
                </button> */}
              </div>
            </div>
          </div>

          {/* Upload drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center py-8 mb-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all"
            style={{
              borderColor: isDragging ? "#3D38F5" : "#D4D4F0",
              background: isDragging ? "#EEF0FF" : "rgba(255,255,255,0.7)",
            }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-transform hover:scale-110"
              style={{ background: "#EEF0FF" }}>
              <Upload className="w-6 h-6 text-[#3D38F5]" />
            </div>
            <p style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#1A1A2E", marginBottom: "4px" }}>
              {isDragging ? "Drop files here" : "Drag & drop files here"}
            </p>
            <p style={{ fontSize: "0.8125rem", color: "#6B6B8A", marginBottom: "12px" }}>
              or click to browse your computer
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="px-5 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 accent-gradient text-white">
              Browse Files
            </button>
          </div>

          {/* Files section */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="cloudbox-font-display" style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1A1A2E" }}>
                {activeNav === "files" ? "My Files" : activeNav === "recent" ? "Recent Files" : "Files"}
              </h2>
              <p style={{ fontSize: "0.8125rem", color: "#6B6B8A" }}>
                {filteredFiles.length} item{filteredFiles.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode("grid")}
                className="p-2 rounded-lg transition-colors"
                style={{ background: viewMode === "grid" ? "#EEF0FF" : "transparent", color: viewMode === "grid" ? "#3D38F5" : "#9090A8" }}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("list")}
                className="p-2 rounded-lg transition-colors"
                style={{ background: viewMode === "list" ? "#EEF0FF" : "transparent", color: viewMode === "list" ? "#3D38F5" : "#9090A8" }}>
                <List className="w-4 h-4" />
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8E8F0] hover:border-[#3D38F5]/30 transition-all text-sm"
                style={{ color: "#6B6B8A", background: "#fff" }}>
                Name <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#EEF0FF" }}>
                <FolderOpen className="w-8 h-8 text-[#3D38F5]" />
              </div>
              <p style={{ fontSize: "1rem", fontWeight: 600, color: "#1A1A2E", marginBottom: "6px" }}>No files found</p>
              <p style={{ fontSize: "0.875rem", color: "#6B6B8A" }}>
                {search ? "Try a different search term" : "Upload some files to get started"}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredFiles.map((file) => {
                const meta = FILE_ICONS[getFileCategory(file.type)];
                const Icon = meta.icon;
                return (
                  <div key={file.id}
                    className="file-card group relative p-4 rounded-2xl border border-[#E8E8F0] hover:border-[#3D38F5]/30 hover:shadow-lg hover:shadow-[#3D38F5]/08 transition-all cursor-pointer"
                    style={{ background: "#fff" }}
                    onClick={() => previewFile(file.id)}>


                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: meta.bg }}>
                      <Icon className="w-6 h-6" style={{ color: meta.color }} />
                    </div>

                    <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1A1A2E", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.name}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "#9090A8" }}>{formatSize(file.size)}</p>

                    {/* Actions */}
                    <div className="file-actions absolute inset-x-3 bottom-3 flex gap-1.5 justify-end">
                      <button

                        onClick={(e) => {

                          e.stopPropagation();

                          previewFile(
                            file.id
                          );

                        }}

                        className="p-1.5 rounded-lg hover:bg-[#EEF0FF] transition-colors"
                      >

                        <Eye className="w-3.5 h-3.5 text-[#3D38F5]" />

                      </button>
                      <button

                        onClick={(e) => {

                          e.stopPropagation();

                          downloadFile(
                            file.id
                          );

                        }}

                        className="p-1.5 rounded-lg hover:bg-[#EEF0FF] transition-colors"
                      >

                        <Download className="w-3.5 h-3.5 text-[#3D38F5]" />

                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteFile(file.id); }}
                        className="p-1.5 rounded-lg hover:bg-[#FEF2F2] transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-[#EF4444]" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add new file card */}
              <button onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-[#D4D4F0] hover:border-[#3D38F5] hover:bg-[#EEF0FF] transition-all h-full min-h-[120px]">
                <Plus className="w-6 h-6 text-[#9090A8] mb-2" />
                <span style={{ fontSize: "0.75rem", color: "#9090A8", fontWeight: 500 }}>Upload File</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden border border-[#E8E8F0]" style={{ background: "#fff" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #F0F0FF" }}>
                    {["Name", "Size", "Modified", ""].map((col) => (
                      <th key={col} className="px-4 py-3 text-left"
                        style={{ fontSize: "0.75rem", fontWeight: 600, color: "#9090A8", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => {
                    const meta = FILE_ICONS[getFileCategory(file.type)];
                    const Icon = meta.icon;
                    return (
                      <tr key={file.id}
                        onClick={() =>
                          previewFile(file.id)
                        }
                        className="group border-t hover:bg-[#F8F8FF] transition-colors cursor-pointer"
                        style={{ borderColor: "#F0F0FF" }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                              <Icon className="w-4 h-4" style={{ color: meta.color }} />
                            </div>
                            <div>
                              <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#1A1A2E" }}>{file.name}</p>
                              <p style={{ fontSize: "0.75rem", color: "#9090A8" }}>{file.type.toUpperCase()}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3" style={{ fontSize: "0.875rem", color: "#6B6B8A" }}>{formatSize(file.size)}</td>
                        <td className="px-4 py-3" style={{ fontSize: "0.875rem", color: "#6B6B8A" }}>{new Date(file.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                previewFile(
                                  file.id
                                );
                              }}
                              className="p-1.5 rounded-lg hover:bg-[#EEF0FF] transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#3D38F5]" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadFile(
                                  file.id
                                );
                              }}
                              className="p-1.5 rounded-lg hover:bg-[#EEF0FF] transition-colors"
                            >
                              <Download className="w-3.5 h-3.5 text-[#3D38F5]" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteFile(
                                  file.id
                                );
                              }}
                              className="p-1.5 rounded-lg hover:bg-[#FEF2F2] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#EF4444]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
