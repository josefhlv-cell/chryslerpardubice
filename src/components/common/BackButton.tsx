import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  fallback?: string;
  className?: string;
  label?: string;
  variant?: "ghost" | "outline" | "default" | "secondary";
}

/**
 * Universal back button. Uses browser history when possible, falls back to `fallback` route.
 * Rendered on every detail page per app-wide navigation rule.
 */
export function BackButton({
  fallback = "/",
  className,
  label = "Zpět",
  variant = "ghost",
}: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={handleClick}
      className={cn("gap-1.5 -ml-2", className)}
      aria-label={label}
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="text-sm">{label}</span>
    </Button>
  );
}

export default BackButton;
