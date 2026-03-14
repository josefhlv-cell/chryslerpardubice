import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  rightElement?: React.ReactNode;
}

const PageHeader = ({ title, showBack = false, rightElement }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b border-border/40 bg-background/80 backdrop-blur-2xl safe-top">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-xl bg-card/60 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <h1 className="text-lg font-display font-bold">{title}</h1>
      </div>
      {rightElement}
    </header>
  );
};

export default PageHeader;
