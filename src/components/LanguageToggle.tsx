import { forwardRef } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { Button } from "@/components/ui/button";

const LanguageToggle = forwardRef<HTMLButtonElement>((_, ref) => {
  const { lang, setLang } = useI18n();

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => setLang(lang === "cs" ? "en" : "cs")}
      title={lang === "cs" ? "Switch to English" : "Přepnout na češtinu"}
    >
      <span className="text-[10px] font-bold uppercase">{lang === "cs" ? "EN" : "CZ"}</span>
    </Button>
  );
});
LanguageToggle.displayName = "LanguageToggle";

export default LanguageToggle;
