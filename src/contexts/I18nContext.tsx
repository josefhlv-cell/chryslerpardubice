import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "cs" | "en";

const translations: Record<Lang, Record<string, string>> = {
  cs: {
    // Navigation
    "nav.parts": "Díly",
    "nav.service": "Servis",
    "nav.vehicles": "Vozy",
    "nav.garage": "Garáž",
    "nav.account": "Účet",
    "nav.cart": "Košík",
    "nav.orders": "Objednávky",
    "nav.menu": "Menu",
    // TopBar menu
    "menu.catalog": "Katalog dílů",
    "menu.service": "Servis",
    "menu.vehicles": "Vozy k prodeji",
    "menu.garage": "Garáž",
    // Common
    "common.save": "Uložit",
    "common.cancel": "Zrušit",
    "common.delete": "Smazat",
    "common.edit": "Upravit",
    "common.back": "Zpět",
    "common.next": "Další",
    "common.loading": "Načítám...",
    "common.search": "Hledat",
    "common.noResults": "Žádné výsledky",
    "common.close": "Zavřít",
    "common.confirm": "Potvrdit",
    "common.add": "Přidat",
    "common.refresh": "Obnovit",
    // Auth
    "auth.login": "Přihlásit se",
    "auth.register": "Registrace",
    "auth.logout": "Odhlásit se",
    "auth.email": "E-mail",
    "auth.password": "Heslo",
    "auth.forgotPassword": "Zapomenuté heslo?",
    "auth.resetPassword": "Obnovit heslo",
    // Shop
    "shop.title": "Katalog náhradních dílů",
    "shop.searchPlaceholder": "Hledat díl podle OEM, názvu...",
    "shop.addToCart": "Do košíku",
    "shop.inStock": "Skladem",
    "shop.outOfStock": "Nedostupné",
    "shop.price": "Cena",
    "shop.priceWithVat": "Cena s DPH",
    // Service
    "service.title": "Rezervace servisu",
    "service.bookNow": "Rezervovat",
    "service.myOrders": "Moje zakázky",
    "service.serviceBook": "Servisní knížka",
    "service.servicePlan": "Plán údržby",
    // Vehicles
    "vehicles.forSale": "Vozy k prodeji",
    "vehicles.buyback": "Výkup vozu",
    "vehicles.import": "Dovoz vozu",
    "vehicles.myVehicles": "Moje vozidla",
    // Account
    "account.title": "Můj účet",
    "account.profile": "Profil",
    "account.settings": "Nastavení",
    // Reviews
    "review.title": "Ohodnoťte servis",
    "review.submit": "Odeslat hodnocení",
    "review.thanks": "Děkujeme za hodnocení! ⭐",
    "review.placeholder": "Napište komentář (nepovinné)...",
    // Onboarding
    "onboarding.skip": "Přeskočit",
    "onboarding.start": "Začít",
    // Emergency
    "emergency.title": "Nouzová pomoc",
    "emergency.callService": "Zavolat servis",
  },
  en: {
    // Navigation
    "nav.parts": "Parts",
    "nav.service": "Service",
    "nav.vehicles": "Vehicles",
    "nav.garage": "Garage",
    "nav.account": "Account",
    "nav.cart": "Cart",
    "nav.orders": "Orders",
    "nav.menu": "Menu",
    // TopBar menu
    "menu.catalog": "Parts Catalog",
    "menu.service": "Service",
    "menu.vehicles": "Vehicles for Sale",
    "menu.garage": "Garage",
    // Common
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.back": "Back",
    "common.next": "Next",
    "common.loading": "Loading...",
    "common.search": "Search",
    "common.noResults": "No results",
    "common.close": "Close",
    "common.confirm": "Confirm",
    "common.add": "Add",
    "common.refresh": "Refresh",
    // Auth
    "auth.login": "Sign In",
    "auth.register": "Sign Up",
    "auth.logout": "Sign Out",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.forgotPassword": "Forgot password?",
    "auth.resetPassword": "Reset Password",
    // Shop
    "shop.title": "Parts Catalog",
    "shop.searchPlaceholder": "Search by OEM number, name...",
    "shop.addToCart": "Add to Cart",
    "shop.inStock": "In Stock",
    "shop.outOfStock": "Out of Stock",
    "shop.price": "Price",
    "shop.priceWithVat": "Price incl. VAT",
    // Service
    "service.title": "Book Service",
    "service.bookNow": "Book Now",
    "service.myOrders": "My Orders",
    "service.serviceBook": "Service Book",
    "service.servicePlan": "Maintenance Plan",
    // Vehicles
    "vehicles.forSale": "Vehicles for Sale",
    "vehicles.buyback": "Vehicle Buyback",
    "vehicles.import": "Vehicle Import",
    "vehicles.myVehicles": "My Vehicles",
    // Account
    "account.title": "My Account",
    "account.profile": "Profile",
    "account.settings": "Settings",
    // Reviews
    "review.title": "Rate Service",
    "review.submit": "Submit Review",
    "review.thanks": "Thanks for your review! ⭐",
    "review.placeholder": "Write a comment (optional)...",
    // Onboarding
    "onboarding.skip": "Skip",
    "onboarding.start": "Get Started",
    // Emergency
    "emergency.title": "Emergency Help",
    "emergency.callService": "Call Service",
  },
};

interface I18nContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: "cs",
  setLang: () => {},
  t: (key) => key,
});

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("app_lang") as Lang) || "cs";
    }
    return "cs";
  });

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("app_lang", newLang);
  };

  const t = (key: string): string => {
    return translations[lang][key] || translations["cs"][key] || key;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
