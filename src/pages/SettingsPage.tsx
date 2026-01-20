import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useUIStore, selectTheme } from "@/stores/uiStore";
import { useAuthStore, selectIsAuthenticated, selectSession } from "@/stores/authStore";

export default function SettingsPage() {
  const navigate = useNavigate();
  const theme = useUIStore(selectTheme);
  const setTheme = useUIStore((state) => state.setTheme);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const session = useAuthStore(selectSession);
  const signOut = useAuthStore((state) => state.signOut);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const sessionHandle = session?.handle;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure your Blue Horizon experience</p>
        </div>

        <div className="space-y-6">
          {/* Theme Section */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Appearance</h2>
            <div className="flex gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
              >
                Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
              >
                Dark
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Current theme: {theme}</p>
          </section>

          {/* Account Section */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Account</h2>
            {isAuthenticated && sessionHandle ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border bg-muted/30">
                  <p className="text-sm text-muted-foreground">Signed in as</p>
                  <p className="font-medium">@{sessionHandle}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" asChild>
                    <Link to="/profile">View Profile</Link>
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                  >
                    {isLoggingOut ? "Signing out..." : "Sign Out"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Sign in to access your account settings.
                </p>
                <Button asChild>
                  <Link to="/welcome">Sign In</Link>
                </Button>
              </div>
            )}
          </section>

          {/* About Section */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">About</h2>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Blue Horizon v0.1.0</p>
              <p>A multiplatform Bluesky client</p>
            </div>
          </section>
        </div>

        {!isAuthenticated && (
          <div className="pt-4">
            <Button variant="ghost" asChild>
              <Link to="/">← Back to Home</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
