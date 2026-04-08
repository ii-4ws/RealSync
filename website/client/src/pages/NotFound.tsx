import { Home, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import logo from "@/assets/realsync-logo.png";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#07090E] px-4">
      {/* Logo */}
      <img src={logo} alt="RealSync" className="h-10 w-10 object-contain mb-10" />

      {/* Icon */}
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-cyan-500/10 rounded-full animate-pulse" />
        <AlertTriangle className="relative h-16 w-16 text-cyan-400" />
      </div>

      <h1 className="text-5xl font-bold text-[#E6EDF3] mb-2 font-headline">404</h1>

      <h2 className="text-xl font-semibold text-[#8B949E] mb-4">
        Page Not Found
      </h2>

      <p className="text-[#484F58] mb-8 text-center leading-relaxed max-w-md">
        Sorry, the page you are looking for doesn't exist.
        <br />
        It may have been moved or deleted.
      </p>

      <button
        onClick={() => setLocation("/")}
        className="inline-flex items-center gap-2 bg-[#3B82F6] hover:bg-blue-600 text-white font-medium px-6 py-2.5 rounded-full transition-colors"
      >
        <Home className="w-4 h-4" />
        Go Home
      </button>
    </div>
  );
}
