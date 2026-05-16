import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  rightElement?: React.ReactNode;
  subtitle?: string;
}

const PageHeader = ({ title, showBack = false, rightElement, subtitle }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-14 z-40 flex items-center justify-between h-14 px-4 border-b border-border/30 bg-background/90 backdrop-blur-2xl">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            aria-label="Zpět"
            className="w-8 h-8 rounded-xl bg-card/60 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-[10px] text-muted-foreground -mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {rightElement}
    </header>
  );
};

export default PageHeader;
