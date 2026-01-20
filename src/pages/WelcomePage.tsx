import { useState } from "react";
import { useNavigate, Link  } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, type AppError } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

const PROVIDERS = [
  { id: "bsky", label: "Bluesky", url: "https://bsky.social" },
  { id: "custom", label: "Custom PDS", url: "" },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [customUrl, setCustomUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const service = provider.id === "custom" ? customUrl : provider.url;

      const response = await login({
        identifier: handle,
        password: password,
        service: service || undefined,
      });

      setSession({
        did: response.did,
        handle: response.handle,
        service_url: response.service,
        is_authenticated: true,
      });
      navigate("/");
    } catch (err) {
      const appError = err as AppError;
      setError(appError.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Welcome to Blue Horizon
        </h1>
        <p className="text-muted-foreground">Sign in to your Bluesky account</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        {/* Provider Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Provider</label>
          <div className="flex gap-2">
            {PROVIDERS.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant={provider.id === p.id ? "default" : "outline"}
                size="sm"
                onClick={() => setProvider(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Custom PDS URL */}
        {provider.id === "custom" && (
          <div className="space-y-2">
            <label htmlFor="pds-url" className="text-sm font-medium">
              PDS URL
            </label>
            <Input
              id="pds-url"
              type="url"
              placeholder="https://your-pds.example.com"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
            />
          </div>
        )}

        {/* Handle */}
        <div className="space-y-2">
          <label htmlFor="handle" className="text-sm font-medium">
            Handle
          </label>
          <Input
            id="handle"
            type="text"
            placeholder="alice.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            required
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            App Password
          </label>
          <Input
            id="password"
            type="password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-sm text-red-500 bg-red-500/10 p-3 rounded-md">{error}</div>
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign In"}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Use an{" "}
          <a
            href="https://bsky.app/settings/app-passwords"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            App Password
          </a>{" "}
          for security
        </p>
      </form>

      <Button variant="ghost" asChild>
        <Link to="/">← Back to Home</Link>
      </Button>
    </div>
  );
}
