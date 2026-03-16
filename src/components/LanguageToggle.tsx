import { useI18n } from "@/contexts/I18nContext";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

const LanguageToggle = () => {
  const { lang, setLang } = useI18n();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setLang(lang === "cs" ? "en" : "cs")}
      title={lang === "cs" ? "Switch to English" : "Přepnout na češtinu"}
    >
      <span className="text-[10px] font-bold uppercase">{lang === "cs" ? "EN" : "CZ"}</span>
    </Button>
  );
};

export default LanguageToggle;
