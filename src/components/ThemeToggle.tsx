import { forwardRef, useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

const ThemeToggle = forwardRef<HTMLButtonElement>((_, ref) => {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
      title={theme === "dark" ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"}
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
});
ThemeToggle.displayName = "ThemeToggle";

export default ThemeToggle;
